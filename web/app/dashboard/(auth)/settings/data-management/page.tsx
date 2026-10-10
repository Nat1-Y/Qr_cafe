"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, DatabaseIcon, Trash2Icon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { Settings } from "@/lib/resources";
import { getBranchId } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

export default function DataManagementPage() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const hasBranch = !!getBranchId();

  async function handleCleanup() {
    setBusy(true);
    try {
      await Settings.cleanupData();
      toast.success("All orders and payments for this branch are deleted.");
      setOpen(false);
      setConfirmText("");
    } catch (e: any) {
      toast.error(friendlyError(e, "Couldn't delete the data. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delete old data"
        description="Delete data for the branch picked at the top. Be careful."
      />

      {!hasBranch ? (
        <Card className="max-w-2xl">
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              Pick a branch at the top first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-destructive/30 bg-destructive/5 max-w-2xl">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangleIcon className="size-5" />
              Danger zone
            </CardTitle>
            <CardDescription>
              You can&apos;t undo these. Be very careful.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-background border-destructive/20 flex flex-col items-start justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  <DatabaseIcon className="size-4" />
                  Delete all orders and payments
                </h4>
                <p className="text-muted-foreground text-xs">
                  Deletes every order and payment for this branch for good. Tills will clear their copies the next time they send updates.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setOpen(true)}
                className="w-full shrink-0 sm:w-auto">
                <Trash2Icon />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) setConfirmText("");
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all orders and payments?</DialogTitle>
            <DialogDescription>
              This deletes every order and payment for this branch for good. You
              can&apos;t undo this. Type <strong>DELETE</strong> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirmDelete">Confirmation</Label>
            <Input
              id="confirmDelete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanup}
              disabled={busy || confirmText !== "DELETE"}>
              {busy ? "Deleting…" : "Yes, delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
