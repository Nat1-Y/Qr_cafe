"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileUpIcon,
  Loader2Icon,
  UploadIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { Users } from "@/lib/resources";
import { downloadFile } from "@/lib/bulk-import";
import {
  CSV_TEMPLATE,
  JSON_TEMPLATE,
  ParsedStaffRow,
  ParseResult,
  StaffValidationContext,
  parseStaffFile,
  rowToStaffPayload,
} from "@/lib/staff-import";
import { roleLabel } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";

export default function BulkStaffImportPage() {
  const router = useRouter();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ctxRef = useRef<StaffValidationContext>({
    existingUsernames: new Set(),
  });

  // Load existing usernames so we can flag duplicates / updates.
  useEffect(() => {
    Users.list()
      .then((users) => {
        ctxRef.current = {
          existingUsernames: new Set(
            (users as { username?: string }[])
              .map((u) => String(u?.username || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        };
      })
      .catch(() => {
        /* non-fatal — validation just won't flag duplicates */
      });
  }, []);

  function runParse(text: string, fmt: "csv" | "json") {
    if (!text.trim()) {
      setResult(null);
      return;
    }
    setResult(parseStaffFile(text, fmt, ctxRef.current));
  }

  const detectFormat = (name: string): "csv" | "json" =>
    name.toLowerCase().endsWith(".json") ? "json" : "csv";

  async function handleFile(file: File) {
    const text = await file.text();
    const fmt = detectFormat(file.name);
    setFormat(fmt);
    setRawText(text);
    setFileName(file.name);
    runParse(text, fmt);
  }

  function handleTextChange(text: string) {
    setRawText(text);
    setFileName(null);
    runParse(text, format);
  }

  function handleFormatChange(fmt: "csv" | "json") {
    setFormat(fmt);
    runParse(rawText, fmt);
  }

  const validRows = useMemo(
    () => result?.rows.filter((r) => r.errors.length === 0) ?? [],
    [result],
  );
  const errorCount = useMemo(
    () => result?.rows.filter((r) => r.errors.length > 0).length ?? 0,
    [result],
  );
  const warningCount = useMemo(
    () =>
      result?.rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0)
        .length ?? 0,
    [result],
  );

  async function handleImport() {
    if (validRows.length === 0) {
      toast.error("No rows are ready to add. Fix the file and try again.");
      return;
    }
    setSubmitting(true);
    try {
      await Users.bulkSync(validRows.map(rowToStaffPayload));
      toast.success(
        `Added ${validRows.length} staff member${validRows.length === 1 ? "" : "s"}.`,
      );
      router.push("/dashboard/staff");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't add the staff. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setRawText("");
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add many staff"
        description="Add many staff at once from a spreadsheet (CSV) or JSON file."
        action={
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/staff")}>
            <ArrowLeftIcon />
            Back to staff
          </Button>
        }
      />

      {/* Step 1 — template + upload */}
      <Card>
        <CardHeader>
          <CardTitle>
            1. Get the example file, fill it in, and upload it
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadFile("staff-template.csv", CSV_TEMPLATE, "text/csv")
              }>
              <DownloadIcon />
              CSV template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadFile(
                  "staff-template.json",
                  JSON_TEMPLATE,
                  "application/json",
                )
              }>
              <DownloadIcon />
              JSON template
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            Must have: full name (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">full_name</code>) and the name they sign in with{" "}
            (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">username</code>). Can also have: role (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">role</code>): one of{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">admin</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">fb_manager</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">finance</code>,{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">cashier</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">kitchen_staff</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">cafe_waiter</code>,{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">barista</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">host</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">storekeeper</code>,{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">accountant</code>, <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">housekeeping</code>; phone (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">phone</code>),
            password (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">password</code>), 4-number PIN (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">pin</code>), and can sign in{" "}
            (<code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">is_active</code>). If there is no password or PIN, we set a starting password.
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className="border-muted-foreground/25 bg-muted/20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center">
            <FileUpIcon className="text-muted-foreground size-8" />
            <p className="text-sm font-medium">
              {fileName ?? "Drag a .csv or .json file here"}
            </p>
            <p className="text-muted-foreground text-xs">or</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}>
              <UploadIcon />
              Choose file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {/* Paste fallback */}
          <details className="bg-card rounded-lg border">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
              …or paste data directly
            </summary>
            <div className="space-y-2 px-4 pb-4">
              <div className="flex gap-2">
                {(["csv", "json"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleFormatChange(fmt)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      format === fmt
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}>
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              <Textarea
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={format === "csv" ? CSV_TEMPLATE : JSON_TEMPLATE}
                rows={6}
                className="font-mono"
              />
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Step 2 — preview */}
      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>2. Check and add</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2Icon className="size-3 text-success" />
                {validRows.length} ready
              </Badge>
              {warningCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangleIcon className="size-3 text-warning" />
                  {warningCount} to check
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircleIcon className="size-3" />
                  {errorCount} with problems
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.fatalError ? (
              <div className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-3 text-sm">
                <XCircleIcon className="size-4 shrink-0" />
                {result.fatalError}
              </div>
            ) : (
              <>
                {errorCount > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Rows with problems are skipped. Fix them in your file and upload it again to add them.
                  </p>
                )}
                <div className="max-h-[460px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Full name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Signs in with</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row) => (
                        <RowView key={row.rowNumber} row={row} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {result && !result.fatalError && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={reset} disabled={submitting}>
            Clear
          </Button>
          <Button
            onClick={handleImport}
            disabled={submitting || validRows.length === 0}>
            {submitting ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <UploadIcon />
            )}
            Import {validRows.length} staff
          </Button>
        </div>
      )}
    </div>
  );
}

function RowView({ row }: { row: ParsedStaffRow }) {
  const hasError = row.errors.length > 0;
  const hasWarning = row.warnings.length > 0;
  const auth = row.pin ? "PIN" : row.password ? "Password" : "Starting password";
  return (
    <TableRow className={hasError ? "bg-destructive/5" : undefined}>
      <TableCell className="text-muted-foreground">
        {row.rowNumber}
      </TableCell>
      <TableCell className="font-medium">{row.full_name || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{row.username || "—"}</TableCell>
      <TableCell>{roleLabel(row.role)}</TableCell>
      <TableCell className="text-muted-foreground">{auth}</TableCell>
      <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
      <TableCell>
        {hasError ? (
          <span className="text-destructive flex items-center gap-1 text-xs">
            <XCircleIcon className="size-3.5" />
            {row.errors.join("; ")}
          </span>
        ) : hasWarning ? (
          <span className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangleIcon className="size-3.5" />
            {row.warnings.join("; ")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2Icon className="size-3.5" />
            Ready
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
