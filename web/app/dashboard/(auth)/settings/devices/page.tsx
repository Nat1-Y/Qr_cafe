"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MonitorSmartphoneIcon,
  CopyIcon,
  RefreshCwIcon,
  Trash2Icon,
  Loader2Icon,
  DatabaseIcon,
  CheckIcon,
  XIcon,
  EraserIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { Devices, DataCleanup } from "@/lib/resources";
import { getBranchId } from "@/lib/api";
import { humanize } from "@/lib/format";
import { friendlyError } from "@/lib/errors";

type EnrolledDevice = {
  id: string;
  name: string | null;
  status: string;
  last_seen_at: string | null;
  online: boolean;
};

type CleanupRequest = {
  id: string;
  device_id: string | null;
  device_name: string | null;
  status: string;
  reason: string | null;
  requested_at: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DevicesPage() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [devices, setDevices] = useState<EnrolledDevice[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [devicesLoading, setDevicesLoading] = useState(true);
  // The device the operator is about to kick out (drives the confirm dialog).
  const [toKick, setToKick] = useState<EnrolledDevice | null>(null);
  const [kicking, setKicking] = useState(false);
  const [cleanups, setCleanups] = useState<CleanupRequest[]>([]);
  const [cleanupsLoading, setCleanupsLoading] = useState(true);
  // Id of the request currently being approved/rejected (drives button spinner).
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // The device the operator is about to wipe (drives the confirm dialog).
  const [toWipe, setToWipe] = useState<EnrolledDevice | null>(null);
  const [wiping, setWiping] = useState(false);

  // Devices with a pending/approved cleanup already in flight — disables the
  // wipe button so the owner can't queue a second one on top of it.
  const devicesWithActiveCleanup = new Set(
    cleanups
      .filter((c) => c.status === "pending" || c.status === "approved")
      .map((c) => c.device_id)
      .filter((id): id is string => !!id),
  );

  const load = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId) {
      setLoading(false);
      setDevicesLoading(false);
      setCleanupsLoading(false);
      return;
    }
    setLoading(true);
    setDevicesLoading(true);
    setCleanupsLoading(true);
    try {
      const [codeRes, devicesRes, cleanupRes] = await Promise.all([
        Devices.getEnrollmentCode(branchId),
        Devices.list(branchId),
        DataCleanup.list(branchId),
      ]);
      setCode(codeRes.code);
      setDevices(devicesRes.devices ?? []);
      setOnlineCount(devicesRes.online_count ?? 0);
      setCleanups(cleanupRes);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
      setDevicesLoading(false);
      setCleanupsLoading(false);
    }
  }, []);

  async function review(id: string, action: "approve" | "reject") {
    setReviewingId(id);
    try {
      if (action === "approve") {
        await DataCleanup.approve(id);
        toast.success("Approved. The device will clear its data after it sends its updates.");
      } else {
        await DataCleanup.reject(id);
        toast.success("Request turned down.");
      }
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setReviewingId(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function rotate() {
    const branchId = getBranchId();
    if (!branchId) {
      toast.error("Pick a branch first.");
      return;
    }
    setRotating(true);
    try {
      const res = await Devices.rotateEnrollmentCode(branchId);
      setCode(res.code);
      toast.success(
        "New setup code made. The old code no longer works.",
      );
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setRotating(false);
    }
  }

  async function kick() {
    const branchId = getBranchId();
    if (!toKick || !branchId) return;
    setKicking(true);
    try {
      await Devices.remove(toKick.id, branchId);
      setDevices((prev) => {
        const next = prev.filter((d) => d.id !== toKick.id);
        setOnlineCount(next.filter((d) => d.online).length);
        return next;
      });
      toast.success(
        `${toKick.name ?? "Device"} cleared and signed out. It will go back to the setup screen.`,
      );
      setToKick(null);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setKicking(false);
    }
  }

  async function wipe() {
    const branchId = getBranchId();
    if (!toWipe || !branchId) return;
    setWiping(true);
    try {
      await DataCleanup.push(branchId, toWipe.id);
      toast.success(
        `${toWipe.name ?? "The device"} will clear its data once it is online and has sent all updates.`,
      );
      setToWipe(null);
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description="The setup code tills use to join this branch."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphoneIcon className="size-5" />
            Branch setup code
          </CardTitle>
          <CardDescription>
            Type this code when you open the app on a new device to link it to this
            branch. The same code works for every device. Make a new code to stop new
            devices joining (devices already set up stay connected).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted flex items-center justify-between rounded-md border p-4">
            <div>
              <div className="text-muted-foreground text-xs">Setup code</div>
              <div className="font-mono text-2xl">
                {loading ? "…" : code || "Not set"}
              </div>
            </div>
            {code && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  toast.success("Copied");
                }}>
                <CopyIcon />
              </Button>
            )}
          </div>

          {code && (
            <div className="flex flex-col items-center gap-2 rounded-card border border-border p-4">
              <div className="rounded-md bg-paper p-3">
                <QRCodeSVG value={code} size={176} marginSize={0} level="M" />
              </div>
              <p className="text-muted-foreground text-center text-xs">
                On a new device, open the waiter app and tap{" "}
                <span className="font-medium">Scan QR</span> to set it up without
                typing the code.
              </p>
            </div>
          )}

          <Button onClick={rotate} disabled={rotating || loading}>
            <RefreshCwIcon />
            {rotating
              ? "Making…"
              : code
                ? "Make a new code"
                : "Make a setup code"}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphoneIcon className="size-5" />
            Devices set up
          </CardTitle>
          <CardDescription>
            {devicesLoading
              ? "Loading devices…"
              : `${onlineCount} of ${devices.length} device${
                  devices.length === 1 ? "" : "s"
                } online (seen in the last 5 minutes).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!devicesLoading && devices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No devices set up for this branch yet.
            </p>
          ) : (
            <ul className="divide-y">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        d.online ? "bg-success" : "bg-muted-foreground/40"
                      }`}
                      title={d.online ? "Online" : "Offline"}
                    />
                    <div>
                      <div className="font-medium">
                        {d.name ?? "Unnamed device"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Last seen {relativeTime(d.last_seen_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">
                      {humanize(d.status)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      title={
                        devicesWithActiveCleanup.has(d.id)
                          ? "This device will already clear its data"
                          : "Clear data on this device"
                      }
                      disabled={devicesWithActiveCleanup.has(d.id)}
                      onClick={() => setToWipe(d)}>
                      <EraserIcon />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      title="Clear and sign out this device"
                      onClick={() => setToKick(d)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-5" />
            Requests to clear old data
          </CardTitle>
          <CardDescription>
            Requests cashiers sent from the till, and clears you started above. If you say yes, the device&apos;s data is cleared and this branch&apos;s orders and payments are deleted for good. You can&apos;t undo this.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cleanupsLoading ? (
            <p className="text-muted-foreground text-sm">Loading requests…</p>
          ) : cleanups.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No requests for this branch.
            </p>
          ) : (
            <ul className="divide-y">
              {cleanups.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {r.device_name ?? "Unnamed device"}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Requested {relativeTime(r.requested_at)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  {r.status === "pending" ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reviewingId === r.id}
                        onClick={() => review(r.id, "reject")}>
                        <XIcon />
                        Say no
                      </Button>
                      <Button
                        size="sm"
                        disabled={reviewingId === r.id}
                        onClick={() => review(r.id, "approve")}>
                        {reviewingId === r.id ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <CheckIcon />
                        )}
                        Say yes
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      variant={
                        r.status === "approved" ? "default" : "muted"
                      }
                      className="shrink-0">
                      {humanize(r.status)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!toWipe}
        onOpenChange={(open) => !open && !wiping && setToWipe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the data on this device?</DialogTitle>
            <DialogDescription>
              {toWipe?.name ?? "This device"} will send its last updates, then
              clear all its data, and this branch&apos;s orders and payments
              will be deleted. The device stays set up and downloads the menu,
              staff and settings again after. You can&apos;t undo this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={wiping}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={wipe} disabled={wiping}>
              {wiping ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <EraserIcon />
                  Clear device data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!toKick}
        onOpenChange={(open) => !open && !kicking && setToKick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear and sign out this device?</DialogTitle>
            <DialogDescription>
              {toKick?.name ?? "This device"} will be removed and signed out
              now. It goes back to the setup screen and needs the setup code (or
              a QR scan) to join again. You can&apos;t undo this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={kicking}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={kick} disabled={kicking}>
              {kicking ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Signing out…
                </>
              ) : (
                <>
                  <Trash2Icon />
                  Clear and sign out
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
