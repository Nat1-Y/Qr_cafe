"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, DollarSign, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { StatCard } from "@/components/stat-card";
import { DateFilterBar } from "@/components/date-filter-bar";
import { birr, shortDate } from "@/lib/format";
import { StaffPenalties as StaffPenaltiesApi, Users as UsersResource } from "@/lib/resources";
import { can } from "@/lib/permissions";

const SEVERITY_OPTIONS = [
  { value: "verbal_warning", label: "Verbal warning" },
  { value: "written_warning", label: "Written warning" },
  { value: "fine", label: "Fine" },
  { value: "suspension", label: "Suspension" },
  { value: "other", label: "Other" },
];

const severityLabel = (v: string) =>
  SEVERITY_OPTIONS.find((s) => s.value === v)?.label ?? v;

const severityVariant = (v: string): "destructive" | "warning" | "muted" => {
  if (v === "suspension" || v === "fine") return "destructive";
  if (v === "written_warning") return "warning";
  return "muted";
};

type Penalty = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  severity: string;
  reason: string;
  amount: number | null;
  occurred_at: string;
  recorded_by_name: string | null;
};

type EmployeeAgg = {
  employee_id: string;
  employee_name: string;
  count: number;
  amount: number;
};

type Summary = {
  total: number;
  count: number;
  byEmployee: EmployeeAgg[];
};

const employeeDisplayName = (u: any) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
  u?.full_name ||
  u?.name ||
  u?.username ||
  "Staff";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const emptyForm = () => ({
  employee_id: "",
  severity: "verbal_warning",
  reason: "",
  amount: "",
  occurred_at: ymd(new Date()),
});

export function StaffPenalties() {
  const canWrite = can("staff_penalty", "write");
  const canDelete = can("staff_penalty", "delete");

  const [loading, setLoading] = useState(true);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    UsersResource.list()
      .then((rows) => setEmployees(Array.isArray(rows) ? rows : []))
      .catch(() => setEmployees([]));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const [rows, summaryData] = await Promise.all([
        StaffPenaltiesApi.list(params),
        StaffPenaltiesApi.summary(params),
      ]);
      setPenalties(Array.isArray(rows) ? rows : []);
      setSummary(summaryData ?? null);
    } catch (e: any) {
      toast.error(e.message || "Failed to load staff penalties");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    reload();
  }, [reload]);

  const employeeOptions = useMemo(
    () =>
      employees
        .map((e) => ({ value: e.id, label: employeeDisplayName(e) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees],
  );

  const topEmployee = summary?.byEmployee?.[0];

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(row: Penalty) {
    setForm({
      employee_id: row.employee_id,
      severity: row.severity,
      reason: row.reason,
      amount: row.amount != null ? String(row.amount) : "",
      occurred_at: row.occurred_at ? ymd(new Date(row.occurred_at)) : ymd(new Date()),
    });
    setEditingId(row.id);
    setOpen(true);
  }

  async function submit() {
    if (!form.employee_id) {
      toast.error("Pick an employee");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Enter a reason");
      return;
    }
    if (form.amount !== "" && Number(form.amount) < 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const payload = {
      employee_id: form.employee_id,
      severity: form.severity,
      reason: form.reason.trim(),
      amount: form.amount === "" ? null : Number(form.amount),
      occurred_at: form.occurred_at || undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await StaffPenaltiesApi.update(editingId, payload);
        toast.success("Penalty updated");
      } else {
        await StaffPenaltiesApi.create(payload);
        toast.success("Penalty recorded");
      }
      setOpen(false);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to save penalty");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this penalty record?")) return;
    try {
      await StaffPenaltiesApi.remove(id);
      toast.success("Deleted");
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete penalty");
    }
  }

  const columns: Column<Penalty>[] = [
    {
      key: "occurred_at",
      label: "Date",
      sortable: true,
      sortValue: (r) => new Date(r.occurred_at),
      render: (r) => shortDate(r.occurred_at),
    },
    { key: "employee_name", label: "Employee", render: (r) => r.employee_name || "—" },
    {
      key: "severity",
      label: "Severity",
      render: (r) => (
        <Badge variant={severityVariant(r.severity)} className="capitalize">
          {severityLabel(r.severity)}
        </Badge>
      ),
    },
    {
      key: "reason",
      label: "Reason",
      render: (r) => <span className="text-muted-foreground">{r.reason}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      className: "text-right",
      sortable: true,
      sortValue: (r) => r.amount ?? 0,
      render: (r) => (r.amount != null ? <span className="font-medium">{birr(r.amount)}</span> : "—"),
    },
    { key: "recorded_by_name", label: "By", render: (r) => r.recorded_by_name || "—" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Filters</CardTitle>
          {canWrite && (
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Log penalty
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DateFilterBar
            defaultPreset="all"
            allLabel="All time"
            viewingPrefix="Viewing:"
            onChange={(range) => {
              setDateFrom(range.from ?? "");
              setDateTo(range.to ?? "");
            }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Penalties"
          value={summary?.count ?? 0}
          subtitle={dateFrom || dateTo ? "In selected range" : "All time"}
          icon={<AlertTriangle className="size-5" />}
          variant="warning"
        />
        <StatCard
          title="Total Fine Amount"
          value={birr(summary?.total ?? 0)}
          subtitle="Sum of monetary penalties"
          icon={<DollarSign className="size-5" />}
          variant="destructive"
        />
        <StatCard
          title="Most Penalized"
          value={topEmployee?.employee_name || "—"}
          subtitle={topEmployee ? `${topEmployee.count} penalt${topEmployee.count === 1 ? "y" : "ies"}` : "No penalties yet"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Employee</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.byEmployee?.length ?? 0) > 0 ? (
                summary!.byEmployee.map((e) => (
                  <TableRow key={e.employee_id}>
                    <TableCell className="font-medium">{e.employee_name}</TableCell>
                    <TableCell className="text-right">{e.count}</TableCell>
                    <TableCell className="text-destructive text-right font-medium">
                      {birr(e.amount)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-10 text-center text-sm">
                    No penalties recorded for this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DataTable<Penalty>
        columns={columns}
        rows={penalties}
        loading={loading}
        searchKeys={["employee_name", "reason", "recorded_by_name"]}
        searchPlaceholder="Search penalties…"
        filters={[
          { key: "severity", label: "Severity", options: SEVERITY_OPTIONS },
          { key: "employee_id", label: "Employee", options: employeeOptions },
        ]}
        emptyMessage="No penalties recorded yet."
        rowActions={
          canWrite || canDelete
            ? (row) => (
                <>
                  {canWrite && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                      <PencilIcon className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" onClick={() => onDelete(row.id)}>
                      <Trash2Icon className="text-destructive size-4" />
                    </Button>
                  )}
                </>
              )
            : undefined
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit penalty" : "Log penalty"}</DialogTitle>
            <DialogDescription>
              Record a disciplinary action against an employee. Amount is optional — only fill
              it in for fines or cost deductions (e.g. cash shortage, breakage).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <select
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select employee…</option>
                {employeeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <select
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={form.reason}
                placeholder="What happened…"
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount (birr, optional)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
