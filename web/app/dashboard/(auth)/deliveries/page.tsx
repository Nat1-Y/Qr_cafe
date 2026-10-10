"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  PlusIcon,
  BikeIcon,
  HourglassIcon,
  PackageCheckIcon,
  XCircleIcon,
  WalletIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  TruckIcon,
  MapPinIcon,
  ReceiptTextIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DataTable,
  type Column,
  type DataTableFilter,
  type DateRangeFilter,
} from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCards, type StatCard } from "@/components/stat-cards";
import { Deliveries, Settings } from "@/lib/resources";
import { formatETB, shortDate } from "@/lib/format";
import { formatOrderNumber } from "@/lib/utils";

// Hoisted so DataTable's `searchKeys` prop keeps a stable reference across
// renders — an inline array literal at the call site would get a new
// identity every render and, combined with onVisibleRowsChange below, loop.
const DELIVERY_SEARCH_KEYS = ["order_number"];

type DeliveryPayment = {
  id: string;
  amount_cents: number;
  status: "pending" | "paid" | "cancelled";
  method: string | null;
  notes: string | null;
  paid_at: string | null;
  processed_by_name?: string | null;
};

type OrderItem = {
  id: string;
  name?: string | null;
  menu_item_name?: string | null;
  quantity: number;
  unit_price?: number | null;
  subtotal?: number | null;
};

type DeliveryOrder = {
  id: string;
  order_number?: number | null;
  total_amount: number | null;
  created_at: string;
  employee_name?: string | null;
  cashier_name?: string | null;
  items?: OrderItem[];
  delivery: {
    id: string;
    method_id: string | null;
    method_name: string | null;
    courier_name: string | null;
    courier_phone: string | null;
    address: string | null;
    fee_cents: number | null;
    status: "pending" | "delivered" | "cancelled";
    notes: string | null;
  };
  delivery_payments: DeliveryPayment[];
  delivery_payment_summary: { paid_cents: number; is_paid: boolean };
};

type Courier = {
  id: string;
  name: string;
  phone: string | null;
};

// Small uppercase icon+label heading used to separate the Manage dialog's
// sections (items / status / courier / payments) so a dense form reads as
// distinct steps instead of one long stack of fields.
function SectionLabel({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-semibold text-muted-foreground ${className ?? "mb-2"}`}
    >
      <Icon className="size-3.5" />
      {children}
    </div>
  );
}

const deliveryStatusVariant = (s: string): "success" | "warning" | "destructive" => {
  if (s === "delivered") return "success";
  if (s === "cancelled") return "destructive";
  return "warning";
};

function ManageDeliveryDialog({
  order,
  couriers,
  onClose,
  onSaved,
}: {
  order: DeliveryOrder;
  couriers: Courier[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [courierName, setCourierName] = useState(order.delivery.courier_name ?? "");
  const [courierPhone, setCourierPhone] = useState(order.delivery.courier_phone ?? "");

  // Reflects the dropdown's selection only when the current name/phone still
  // matches a preconfigured profile exactly — editing either field by hand
  // (or picking a courier the owner never set up) naturally falls back to the
  // "Other / manual entry" placeholder instead of showing a stale selection.
  const matchedCourierId = useMemo(
    () =>
      couriers.find((c) => c.name === courierName && (c.phone || "") === (courierPhone || ""))
        ?.id ?? "",
    [couriers, courierName, courierPhone],
  );

  const selectCourier = (id: string) => {
    if (!id) return;
    const profile = couriers.find((c) => c.id === id);
    if (!profile) return;
    setCourierName(profile.name);
    setCourierPhone(profile.phone ?? "");
  };
  const [address, setAddress] = useState(order.delivery.address ?? "");
  const [fee, setFee] = useState(String((order.delivery.fee_cents ?? 0) / 100 || ""));
  const [notes, setNotes] = useState(order.delivery.notes ?? "");
  const [busy, setBusy] = useState(false);

  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // Same source of truth as a normal order's Confirm Payment modal: the
  // amount owed comes from the order itself (built from menu prices), never
  // typed in by hand. `remainingDueCents` accounts for whatever's already
  // been collected so a previously-partial delivery still resolves cleanly.
  const remainingDueCents = Math.max(
    0,
    Math.round((Number(order.total_amount) || 0) * 100) -
      order.delivery_payment_summary.paid_cents,
  );

  const saveDetails = async () => {
    setBusy(true);
    try {
      await Deliveries.updateDetails(order.id, {
        courier_name: courierName,
        courier_phone: courierPhone,
        address,
        fee_cents: Math.round((Number(fee) || 0) * 100),
        notes,
      });
      toast.success("Delivery details saved");
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "pending" | "delivered" | "cancelled") => {
    setBusy(true);
    try {
      await Deliveries.updateDetails(order.id, { status });
      toast.success(`Marked ${status}`);
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async () => {
    if (remainingDueCents <= 0) return;
    setPayBusy(true);
    try {
      await Deliveries.addPayment(order.id, {
        amount_cents: remainingDueCents,
        method: payMethod || null,
        notes: payNotes || null,
        status: "paid",
      });
      toast.success("Payment recorded");
      setPayMethod("");
      setPayNotes("");
      await onSaved();
    } catch (e: any) {
      const message = e?.message || "Failed to record payment";
      toast.error(message);
      // The order's payment state can change from under us — e.g. a POS
      // client confirms the same order at nearly the same moment. Refresh
      // instead of leaving a stale "still owing" view up, which is exactly
      // what let the same order get paid twice.
      if (/fully paid/i.test(message)) {
        await onSaved();
      }
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {formatOrderNumber(order)}
            <Badge variant={deliveryStatusVariant(order.delivery.status)} className="capitalize">
              {order.delivery.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>{order.delivery.method_name || "Delivery"} order</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Total / collected / due at a glance, before anything else. */}
          <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center">
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">
                Total
              </div>
              <div className="text-sm font-semibold">{formatETB(order.total_amount)}</div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">
                Collected
              </div>
              <div className="text-sm font-semibold text-success">
                {formatETB(order.delivery_payment_summary.paid_cents / 100)}
              </div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">
                Due
              </div>
              <div
                className={`text-sm font-semibold ${remainingDueCents > 0 ? "text-warning" : "text-success"}`}
              >
                {formatETB(remainingDueCents / 100)}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel icon={ReceiptTextIcon}>Order items</SectionLabel>
            <div className="overflow-hidden rounded-lg border">
              <div className="bg-muted/50 text-muted-foreground grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs font-medium">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Subtotal</span>
              </div>
              {(order.items ?? []).length === 0 ? (
                <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                  No items recorded for this order.
                </div>
              ) : (
                (order.items ?? []).map((it) => (
                  <div
                    key={it.id}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 border-t px-3 py-2 text-sm"
                  >
                    <span>{it.name ?? it.menu_item_name ?? "Item"}</span>
                    <span className="text-muted-foreground text-right tabular-nums">
                      ×{it.quantity}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {formatETB(it.subtotal ?? (it.unit_price ?? 0) * it.quantity)}
                    </span>
                  </div>
                ))
              )}
              <div className="bg-muted/20 grid grid-cols-[1fr_auto] gap-3 border-t px-3 py-2 text-sm font-semibold">
                <span>Total</span>
                <span className="text-right tabular-nums">{formatETB(order.total_amount)}</span>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel icon={TruckIcon}>Delivery status</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {(["pending", "delivered", "cancelled"] as const).map((s) => {
                const StatusIcon =
                  s === "pending" ? HourglassIcon : s === "delivered" ? PackageCheckIcon : XCircleIcon;
                return (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={order.delivery.status === s ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => setStatus(s)}
                    className="gap-1.5"
                  >
                    <StatusIcon className="size-3.5" />
                    {s === "pending" ? "Pending" : s === "delivered" ? "Mark delivered" : "Cancel delivery"}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel icon={MapPinIcon} className="mb-0">
              Courier & address
            </SectionLabel>
            <div className="space-y-1.5">
              <Label>Courier</Label>
              <select
                value={matchedCourierId}
                onChange={(e) => selectCourier(e.target.value)}
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
              >
                <option value="">
                  {couriers.length ? "Choose a saved courier…" : "No saved couriers — enter details below"}
                </option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Courier name</Label>
                <Input
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="Pick above, or type a new one"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Courier phone</Label>
                <Input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Delivery fee (ETB)</Label>
                <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveDetails} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Save details
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel icon={WalletIcon} className="mb-0">
                Payments
              </SectionLabel>
              <span className="text-muted-foreground text-xs">
                {order.delivery_payments.length} entr
                {order.delivery_payments.length === 1 ? "y" : "ies"}
              </span>
            </div>

            {order.delivery_payments.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No payment recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {order.delivery_payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                        <CreditCardIcon className="text-muted-foreground size-4" />
                      </div>
                      <div>
                        <div className="font-medium">{formatETB(p.amount_cents / 100)}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.method, p.processed_by_name].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "success"
                            : p.status === "cancelled"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.paid_at && (
                        <span className="text-xs text-muted-foreground">{shortDate(p.paid_at)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {remainingDueCents > 0 ? (
              <div className="mt-3 space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-warning">
                    Amount due
                  </span>
                  <span className="text-sm font-semibold text-warning">
                    {formatETB(remainingDueCents / 100)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Source (e.g. courier cash)"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  />
                  <Button size="sm" onClick={recordPayment} disabled={payBusy}>
                    {payBusy ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <CheckCircle2Icon />
                    )}
                    Confirm payment
                  </Button>
                </div>
                <Input
                  placeholder="Payment notes (optional)"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                />
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success-soft py-2.5 text-xs font-semibold text-success">
                <CheckCircle2Icon className="size-3.5" />
                Fully paid
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Quick payment recording, right from the row — no need to open the full
// Manage dialog just to log a courier hand-off or a platform remittance.
function DeliveryPaymentsPopover({
  order,
  onChanged,
}: {
  order: DeliveryOrder;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [busy, setBusy] = useState(false);

  // Same as the full Manage dialog: the amount is whatever's left owing on
  // the order, never hand-typed.
  const remainingDueCents = Math.max(
    0,
    Math.round((Number(order.total_amount) || 0) * 100) -
      order.delivery_payment_summary.paid_cents,
  );

  const recordPayment = async () => {
    if (remainingDueCents <= 0) return;
    setBusy(true);
    try {
      await Deliveries.addPayment(order.id, {
        amount_cents: remainingDueCents,
        method: payMethod || null,
        status: "paid",
      });
      toast.success("Payment recorded");
      setPayMethod("");
      await onChanged();
    } catch (e: any) {
      const message = e?.message || "Failed to record payment";
      toast.error(message);
      // See ManageDeliveryDialog.recordPayment — refresh on a stale-state
      // conflict so this popover stops showing an amount that's already
      // been paid elsewhere.
      if (/fully paid/i.test(message)) {
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <CreditCardIcon />
          Payments
          {order.delivery_payments.length > 0 && (
            <Badge variant="outline" className="ml-1">
              {order.delivery_payments.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{formatOrderNumber(order)}</span>
          <span className="text-muted-foreground text-xs">
            {formatETB(order.delivery_payment_summary.paid_cents / 100)} of {formatETB(order.total_amount)}
          </span>
        </div>

        {order.delivery_payments.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-xs">No payment recorded yet.</p>
        ) : (
          <div className="mb-3 max-h-40 space-y-1.5 overflow-y-auto">
            {order.delivery_payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
              >
                <div>
                  <span className="font-medium">{formatETB(p.amount_cents / 100)}</span>{" "}
                  <Badge
                    variant={p.status === "paid" ? "success" : p.status === "cancelled" ? "destructive" : "warning"}
                    className="ml-1"
                  >
                    {p.status}
                  </Badge>
                  <div className="text-muted-foreground">{p.method || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {remainingDueCents > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Amount due</span>
              <span className="font-semibold">{formatETB(remainingDueCents / 100)}</span>
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Source"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="h-8"
              />
              <Button size="sm" className="h-8 shrink-0" onClick={recordPayment} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <PlusIcon />}
              </Button>
            </div>
          </>
        ) : (
          <p className="py-1 text-center text-xs font-medium text-success">Fully paid</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Confirms every checked order for exactly what it's owed — same rule as a
// single confirm, just looped. Mirrors the cashier dashboard's "Settle all
// payments for Table N" bulk flow (SettleAllPaymentsModal / handleSettleOrders).
function BulkConfirmDeliveryPaymentsDialog({
  orders,
  busy,
  progress,
  onClose,
  onConfirm,
}: {
  orders: DeliveryOrder[];
  busy: boolean;
  progress: { done: number; total: number } | null;
  onClose: () => void;
  onConfirm: (source: string, notes: string) => void;
}) {
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  const totalDueCents = orders.reduce((sum, o) => {
    const due = Math.max(
      0,
      Math.round((Number(o.total_amount) || 0) * 100) - o.delivery_payment_summary.paid_cents,
    );
    return sum + due;
  }, 0);

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!busy && !v) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Confirm {orders.length} delivery payment{orders.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Each order is settled for exactly what it&apos;s owed — same as confirming one at a
            time. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4">
            <span className="text-xs font-semibold text-muted-foreground">
              Total amount
            </span>
            <span className="text-base font-semibold text-success">
              {formatETB(totalDueCents / 100)}
            </span>
          </div>

          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {orders.map((o) => {
              const due = Math.max(
                0,
                Math.round((Number(o.total_amount) || 0) * 100) - o.delivery_payment_summary.paid_cents,
              );
              return (
                <div key={o.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{formatOrderNumber(o)}</span>
                  <span className="text-muted-foreground">{formatETB(due / 100)}</span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source (optional)</Label>
              <Input
                placeholder="e.g. courier cash"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
            </div>
          </div>

          {progress && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Confirming {progress.done} / {progress.total}…
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || orders.length === 0} onClick={() => onConfirm(source, notes)}>
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                Confirming…
              </span>
            ) : (
              `Confirm ${orders.length} payment${orders.length === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveriesPage() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  // Rows currently matching the table's search/filters/date-range (every
  // page, not just the one on screen) — reported by DataTable so the stat
  // cards below track whatever the owner has filtered to, not the whole set.
  const [visibleOrders, setVisibleOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState<DeliveryOrder | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);

  // Bulk-confirm selection. Only a cancelled or already-paid delivery is
  // excluded — nothing left to confirm on either.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const isRowSelectable = useCallback(
    (row: DeliveryOrder) =>
      row.delivery.status !== "cancelled" && !row.delivery_payment_summary.is_paid,
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await Deliveries.list());
    } catch (e: any) {
      toast.error(e?.message || "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Best-effort — a role without the couriers resource granted just falls
  // back to manual entry in the Manage dialog (empty dropdown option list).
  useEffect(() => {
    Settings.couriers()
      .then((list: Courier[]) => setCouriers(Array.isArray(list) ? list : []))
      .catch(() => setCouriers([]));
  }, []);

  // Drop selections that no longer qualify whenever the data refreshes — e.g.
  // another client just settled an order the owner had already checked here.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const stillValid = orders.filter((o) => prev.has(o.id) && isRowSelectable(o)).map((o) => o.id);
      if (stillValid.length === prev.size) return prev;
      return new Set(stillValid);
    });
  }, [orders, isRowSelectable]);

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id) && isRowSelectable(o)),
    [orders, selectedIds, isRowSelectable],
  );

  const confirmSelectedPayments = async (source: string, notes: string) => {
    if (bulkBusy || selectedOrders.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: selectedOrders.length });
    let ok = 0;
    let fail = 0;

    // Sequential — same reason as the cashier dashboard's table batch-settle:
    // avoids hammering the backend and racing this page's own reload.
    for (let i = 0; i < selectedOrders.length; i++) {
      const order = selectedOrders[i];
      const dueCents = Math.max(
        0,
        Math.round((Number(order.total_amount) || 0) * 100) - order.delivery_payment_summary.paid_cents,
      );
      if (dueCents <= 0) {
        ok += 1; // Already settled — not a real failure for a bulk action.
      } else {
        try {
          await Deliveries.addPayment(order.id, {
            amount_cents: dueCents,
            method: source || null,
            notes: notes || null,
            status: "paid",
          });
          ok += 1;
        } catch (e: any) {
          // Another client (e.g. a POS confirming the same order at nearly
          // the same moment) may have just settled it first.
          if (/fully paid/i.test(String(e?.message))) ok += 1;
          else fail += 1;
        }
      }
      setBulkProgress({ done: i + 1, total: selectedOrders.length });
    }

    setBulkBusy(false);
    setBulkProgress(null);
    setBulkOpen(false);
    setSelectedIds(new Set());

    if (fail === 0) toast.success(`Confirmed ${ok} payment${ok === 1 ? "" : "s"}`);
    else if (ok === 0) toast.error(`Failed to confirm ${fail} payment${fail === 1 ? "" : "s"}`);
    else toast(`Confirmed ${ok}, ${fail} failed`);

    await load();
  };

  // Memoized: DataTable's onVisibleRowsChange effect depends (transitively,
  // via its `filtered` memo) on this array's identity — an inline literal
  // here would get a new reference every render and fire that effect in a
  // loop (setVisibleOrders → re-render → new columns ref → …).
  const columns: Column<DeliveryOrder>[] = useMemo(
    () => [
      {
        key: "order_number",
        label: "Order",
        render: (r) => <span className="font-medium">{formatOrderNumber(r)}</span>,
        sortable: true,
      },
      { key: "method_name", label: "Method", render: (r) => r.delivery.method_name || "—" },
      {
        key: "placed_by",
        label: "Placed by",
        render: (r) => r.cashier_name || r.employee_name || "—",
      },
      {
        key: "items",
        label: "Items",
        searchValue: (r) =>
          (r.items ?? []).map((it) => it.name ?? it.menu_item_name ?? "").join(" "),
        render: (r) => {
          const items = r.items ?? [];
          if (items.length === 0) return <span className="text-muted-foreground">—</span>;
          const summary = items
            .map((it) => `${it.quantity}× ${it.name ?? it.menu_item_name ?? "Item"}`)
            .join(", ");
          return (
            <span className="text-muted-foreground block max-w-[16rem] truncate" title={summary}>
              {summary}
            </span>
          );
        },
      },
      {
        key: "total_amount",
        label: "Total",
        render: (r) => formatETB(r.total_amount),
        sortable: true,
        sortValue: (r) => Number(r.total_amount ?? 0),
      },
      {
        key: "payment",
        label: "Payment",
        render: (r) => (
          <Badge variant={r.delivery_payment_summary.is_paid ? "success" : "warning"}>
            {r.delivery_payment_summary.is_paid ? "Paid" : "Unpaid"}
          </Badge>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (r) => (
          <Badge variant={deliveryStatusVariant(r.delivery.status)}>{r.delivery.status}</Badge>
        ),
      },
      {
        key: "created_at",
        label: "Placed",
        render: (r) => shortDate(r.created_at),
        sortable: true,
        sortValue: (r) => new Date(r.created_at).getTime(),
      },
    ],
    [],
  );

  // Distinct methods actually present in the current data — an owner with one
  // configured method shouldn't see an empty "pick a method" dropdown.
  const methodOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      const id = o.delivery.method_id;
      if (id && !seen.has(id)) seen.set(id, o.delivery.method_name || "—");
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [orders]);

  // Courier is free-text on the order (no FK to the couriers settings
  // table — see couriers.table.ts), so this filter goes by name, same
  // convention as Method going by method_id: only names actually present in
  // the current data, no empty "pick a courier" dropdown.
  const courierOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of orders) {
      const name = o.delivery.courier_name;
      if (name && !seen.has(name)) seen.add(name);
    }
    return Array.from(seen, (name) => ({ value: name, label: name }));
  }, [orders]);

  // Memoized for the same reason `columns` is — see comment there.
  const filters: DataTableFilter<DeliveryOrder>[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "pending", label: "Pending" },
          { value: "delivered", label: "Delivered" },
          { value: "cancelled", label: "Cancelled" },
        ],
        match: (row, value) => row.delivery.status === value,
      },
      {
        key: "payment",
        label: "Payment",
        options: [
          { value: "paid", label: "Paid" },
          { value: "unpaid", label: "Unpaid" },
        ],
        match: (row, value) =>
          value === "paid"
            ? row.delivery_payment_summary.is_paid
            : !row.delivery_payment_summary.is_paid,
      },
      {
        key: "method",
        label: "Method",
        options: methodOptions,
        match: (row, value) => row.delivery.method_id === value,
      },
      {
        key: "courier",
        label: "Courier",
        options: courierOptions,
        match: (row, value) => row.delivery.courier_name === value,
      },
    ],
    [methodOptions, courierOptions],
  );

  const dateFilters: DateRangeFilter<DeliveryOrder>[] = useMemo(
    () => [{ key: "created_at", label: "Placed", getDate: (r) => r.created_at }],
    [],
  );

  // Summary cards over whatever's currently visible in the table — i.e. the
  // full matching set across every page of the active search/filters/date
  // range, not just the whole fetched set and not just the current page.
  const stats = useMemo(() => {
    let pending = 0;
    let delivered = 0;
    let cancelled = 0;
    let collectedCents = 0;
    let outstanding = 0;
    for (const o of visibleOrders) {
      if (o.delivery.status === "pending") pending += 1;
      else if (o.delivery.status === "delivered") delivered += 1;
      else if (o.delivery.status === "cancelled") cancelled += 1;

      collectedCents += o.delivery_payment_summary.paid_cents;
      if (o.delivery.status !== "cancelled") {
        const due = Number(o.total_amount ?? 0) - o.delivery_payment_summary.paid_cents / 100;
        if (due > 0) outstanding += due;
      }
    }
    return { total: visibleOrders.length, pending, delivered, cancelled, collectedCents, outstanding };
  }, [visibleOrders]);

  const statCards: StatCard[] = [
    { label: "Total deliveries", value: stats.total, icon: BikeIcon },
    { label: "Pending", value: stats.pending, icon: HourglassIcon, valueClass: "text-warning" },
    { label: "Delivered", value: stats.delivered, icon: PackageCheckIcon, valueClass: "text-success" },
    { label: "Cancelled", value: stats.cancelled, icon: XCircleIcon, valueClass: "text-destructive" },
    { label: "Collected", value: formatETB(stats.collectedCents / 100), icon: CreditCardIcon, valueClass: "text-success" },
    { label: "Outstanding", value: formatETB(stats.outstanding), icon: WalletIcon, valueClass: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliveries"
        description="Orders placed through a delivery method, tracked separately from dine-in/take-away."
      />

      <StatCards cards={statCards} loading={loading} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />

      <DataTable<DeliveryOrder>
        columns={columns}
        rows={orders}
        loading={loading}
        searchKeys={DELIVERY_SEARCH_KEYS}
        searchPlaceholder="Search order #..."
        filters={filters}
        dateFilters={dateFilters}
        onVisibleRowsChange={setVisibleOrders}
        pageSize={15}
        emptyMessage="No delivery orders yet."
        selection={{
          selectedKeys: selectedIds,
          onSelectionChange: setSelectedIds,
          isSelectable: isRowSelectable,
          label: "Select all unpaid deliveries",
        }}
        toolbar={
          selectedOrders.length > 0 ? (
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <CheckCircle2Icon />
              Confirm {selectedOrders.length} payment{selectedOrders.length === 1 ? "" : "s"}
            </Button>
          ) : undefined
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <DeliveryPaymentsPopover order={row} onChanged={load} />
            <Button variant="ghost" size="sm" onClick={() => setManaging(row)}>
              Manage
            </Button>
          </div>
        )}
      />

      {managing && (
        <ManageDeliveryDialog
          order={managing}
          couriers={couriers}
          onClose={() => setManaging(null)}
          onSaved={async () => {
            await load();
            setManaging(null);
          }}
        />
      )}

      {bulkOpen && (
        <BulkConfirmDeliveryPaymentsDialog
          orders={selectedOrders}
          busy={bulkBusy}
          progress={bulkProgress}
          onClose={() => setBulkOpen(false)}
          onConfirm={confirmSelectedPayments}
        />
      )}
    </div>
  );
}
