import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/application';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, SearchInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { formatOrderNumber } from '@/lib/utils';
import {
  Bike,
  Hourglass,
  PackageCheck,
  XCircle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Truck,
  MapPin,
  ReceiptText,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { formatETB } from '@/lib/format';
import StatsCard from '@/components/common/StatsCard';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';

const birr = formatETB;

// Short-format timestamp for payment rows — mirrors web/lib/format.ts's
// shortDate so the two apps read the same way.
const shortDate = (value: string | null | undefined) => {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Small icon+label heading used to separate the Manage dialog's
// sections (items / status / courier / payments) so a dense form reads as
// distinct steps instead of one long stack of fields.
const SectionLabel: React.FC<{ icon: LucideIcon; children: React.ReactNode; className?: string }> = ({
  icon: Icon,
  children,
  className,
}) => (
  <div className={`flex items-center gap-1.5 text-xs font-semibold text-muted-foreground ${className ?? 'mb-2'}`}>
    <Icon className="h-3.5 w-3.5" />
    {children}
  </div>
);

const PAGE_SIZE = 10;

// Mirrors OrderManagement/components/OrderStats.tsx's tile style.
const StatTile = ({
  title,
  value,
  icon: Icon,
  color = 'default',
}: {
  title: string;
  value: string | number;
  icon: any;
  color?: 'default' | 'success' | 'warning' | 'danger';
}) => {
  // KPI tile: muted label, big number; olive only when it means good.
  const variant = color === 'danger' ? 'destructive' : color;
  void Icon;
  return <StatsCard title={title} value={value} variant={variant} />;
};

function ManageDeliveryDialog({
  order,
  couriers,
  onClose,
  onSaved,
}: {
  order: any;
  couriers: Array<{ id: string; name: string; phone?: string | null }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [courierName, setCourierName] = useState(order.delivery.courier_name ?? '');
  const [courierPhone, setCourierPhone] = useState(order.delivery.courier_phone ?? '');

  // Reflects the dropdown's selection only when the current name/phone still
  // matches a preconfigured profile exactly — editing either field by hand
  // (or picking a courier the admin never set up) naturally falls back to the
  // "Other / manual entry" placeholder instead of showing a stale selection.
  const matchedCourierId = useMemo(
    () =>
      couriers.find((c) => c.name === courierName && (c.phone || '') === (courierPhone || ''))
        ?.id ?? '',
    [couriers, courierName, courierPhone],
  );

  const selectCourier = (id: string) => {
    if (!id) return;
    const profile = couriers.find((c) => c.id === id);
    if (!profile) return;
    setCourierName(profile.name);
    setCourierPhone(profile.phone ?? '');
  };
  const [address, setAddress] = useState(order.delivery.address ?? '');
  const [fee, setFee] = useState(String((order.delivery.fee_cents ?? 0) / 100 || ''));
  const [notes, setNotes] = useState(order.delivery.notes ?? '');
  const [busy, setBusy] = useState(false);

  const [payMethod, setPayMethod] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  // Same source of truth as a normal order's Confirm Payment modal: the
  // amount owed comes from the order itself (built from menu prices), never
  // typed in by hand. `remainingDueCents` accounts for whatever's already
  // been collected so a previously-partial delivery still resolves cleanly.
  const remainingDueCents = Math.max(
    0,
    Math.round((Number(order.total_amount) || 0) * 100) -
      (order.delivery_payment_summary?.paid_cents ?? 0),
  );

  const saveDetails = async () => {
    setBusy(true);
    try {
      await api.orders.updateDeliveryDetails(order.id, {
        courier_name: courierName,
        courier_phone: courierPhone,
        address,
        fee_cents: Math.round((Number(fee) || 0) * 100),
        notes,
      });
      toast.success('Delivery details saved');
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'pending' | 'delivered' | 'cancelled') => {
    setBusy(true);
    try {
      await api.orders.updateDeliveryDetails(order.id, { status });
      toast.success(`Marked ${status}`);
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async () => {
    if (remainingDueCents <= 0) return;
    setPayBusy(true);
    try {
      await api.orders.addDeliveryPayment(order.id, {
        amount_cents: remainingDueCents,
        method: payMethod || null,
        notes: payNotes || null,
        status: 'paid',
      });
      toast.success('Payment recorded');
      setPayMethod('');
      setPayNotes('');
      await onSaved();
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || 'Failed to record payment';
      toast.error(message);
      // The order's payment state can change from under us — e.g. the owner
      // just confirmed it from the web dashboard while this dialog was still
      // showing a stale "still owing" amount. Refresh instead of leaving
      // that stale view up, which is exactly what let the same order get
      // paid twice.
      if (e?.response?.status === 400 && /fully paid/i.test(String(message))) {
        await onSaved();
      }
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {formatOrderNumber(order)}
            <StatusBadge kind="delivery" status={order.delivery.status} />
          </DialogTitle>
          <DialogDescription>{order.delivery.method_name || 'Delivery'} order</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Total / collected / due at a glance, before anything else. */}
          <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center">
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Total</div>
              <div className="text-sm font-semibold">{birr(order.total_amount)}</div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Collected</div>
              <div className="text-sm font-semibold text-success">
                {birr((order.delivery_payment_summary?.paid_cents ?? 0) / 100)}
              </div>
            </div>
            <div className="px-2 py-2.5">
              <div className="text-xs font-semibold text-muted-foreground">Due</div>
              <div
                className={`text-sm font-semibold ${remainingDueCents > 0 ? 'text-warning' : 'text-success'}`}
              >
                {birr(remainingDueCents / 100)}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel icon={ReceiptText}>Order items</SectionLabel>
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Subtotal</span>
              </div>
              {(order.items ?? []).length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No items recorded for this order.
                </div>
              ) : (
                (order.items ?? []).map((it: any) => (
                  <div
                    key={it.id}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 border-t px-3 py-2 text-sm"
                  >
                    <span>{it.name ?? it.menu_item_name ?? 'Item'}</span>
                    <span className="text-right tabular-nums text-muted-foreground">×{it.quantity}</span>
                    <span className="text-right font-medium tabular-nums">
                      {birr(it.subtotal ?? (it.unit_price ?? 0) * it.quantity)}
                    </span>
                  </div>
                ))
              )}
              <div className="grid grid-cols-[1fr_auto] gap-3 border-t bg-muted/20 px-3 py-2 text-sm font-semibold">
                <span>Total</span>
                <span className="text-right tabular-nums">{birr(order.total_amount)}</span>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel icon={Truck}>Delivery status</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {(['pending', 'delivered', 'cancelled'] as const).map((s) => {
                const StatusIcon = s === 'pending' ? Hourglass : s === 'delivered' ? PackageCheck : XCircle;
                return (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={order.delivery.status === s ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => setStatus(s)}
                    className="gap-1.5"
                  >
                    <StatusIcon className="h-3.5 w-3.5" />
                    {s === 'pending' ? 'Pending' : s === 'delivered' ? 'Mark delivered' : 'Cancel delivery'}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel icon={MapPin} className="mb-0">Courier & address</SectionLabel>
            <div className="space-y-1.5">
              <Label>Courier</Label>
              <select
                value={matchedCourierId}
                onChange={(e) => selectCourier(e.target.value)}
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
              >
                <option value="">
                  {couriers.length ? 'Choose a saved courier…' : 'No saved couriers — enter details below'}
                </option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
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
              <SectionLabel icon={Wallet} className="mb-0">Payments</SectionLabel>
              <span className="text-xs text-muted-foreground">
                {order.delivery_payments.length} entr{order.delivery_payments.length === 1 ? 'y' : 'ies'}
              </span>
            </div>

            {order.delivery_payments.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No payment recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {order.delivery_payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">{birr(p.amount_cents / 100)}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.method, p.processed_by_name].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={p.status === 'paid' ? 'success' : p.status === 'cancelled' ? 'destructive' : 'warning'}
                      >
                        {p.status}
                      </Badge>
                      {shortDate(p.paid_at) && (
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
                  <span className="text-xs font-medium text-warning">Amount due</span>
                  <span className="text-sm font-semibold text-warning">{birr(remainingDueCents / 100)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Source (e.g. courier cash)" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
                  <Button size="sm" onClick={recordPayment} disabled={payBusy}>
                    {payBusy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
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
                <CheckCircle2 className="h-3.5 w-3.5" />
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
function DeliveryPaymentsPopover({ order, onChanged }: { order: any; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const payments = order.delivery_payments || [];

  // Same as the full Manage dialog: the amount is whatever's left owing on
  // the order, never hand-typed.
  const remainingDueCents = Math.max(
    0,
    Math.round((Number(order.total_amount) || 0) * 100) -
      (order.delivery_payment_summary?.paid_cents ?? 0),
  );

  const recordPayment = async () => {
    if (remainingDueCents <= 0) return;
    setBusy(true);
    try {
      await api.orders.addDeliveryPayment(order.id, {
        amount_cents: remainingDueCents,
        method: payMethod || null,
        status: 'paid',
      });
      toast.success('Payment recorded');
      setPayMethod('');
      await onChanged();
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || 'Failed to record payment';
      toast.error(message);
      // See ManageDeliveryDialog.recordPayment — refresh on a stale-state
      // conflict so this popover stops showing an amount that's already
      // been paid elsewhere.
      if (e?.response?.status === 400 && /fully paid/i.test(String(message))) {
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
          <CreditCard />
          Payments
          {payments.length > 0 && (
            <Badge variant="outline" className="ml-1">
              {payments.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{formatOrderNumber(order)}</span>
          <span className="text-xs text-muted-foreground">
            {birr((order.delivery_payment_summary?.paid_cents ?? 0) / 100)} of {birr(order.total_amount)}
          </span>
        </div>

        {payments.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">No payment recorded yet.</p>
        ) : (
          <div className="mb-3 max-h-40 space-y-1.5 overflow-y-auto">
            {payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
                <div>
                  <span className="font-medium">{birr(p.amount_cents / 100)}</span>{' '}
                  <Badge
                    variant={p.status === 'paid' ? 'success' : p.status === 'cancelled' ? 'destructive' : 'warning'}
                    className="ml-1"
                  >
                    {p.status}
                  </Badge>
                  <div className="text-muted-foreground">{p.method || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {remainingDueCents > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Amount due</span>
              <span className="font-semibold">{birr(remainingDueCents / 100)}</span>
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Source"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="h-8"
              />
              <Button size="sm" className="h-8 shrink-0" onClick={recordPayment} disabled={busy}>
                <Plus />
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

const DeliveryManagement: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [courierFilter, setCourierFilter] = useState('');
  const [page, setPage] = useState(1);
  const [managing, setManaging] = useState<any | null>(null);
  const [couriers, setCouriers] = useState<Array<{ id: string; name: string; phone?: string | null }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Status is the only filter the backend narrows server-side; payment/method/
      // search stay client-side since the whole set is small enough to hold in memory.
      const response = await api.orders.getDeliveries(statusFilter ? { status: statusFilter } : undefined);
      const list = (response as any)?.data?.data?.orders ?? (response as any)?.data?.orders ?? [];
      setOrders(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Best-effort — a role without the couriers resource granted, or no signal,
  // just falls back to manual entry in the Manage dialog (empty dropdown).
  useEffect(() => {
    api.settings
      .getCouriers()
      .then((list: any[]) => setCouriers(Array.isArray(list) ? list : []))
      .catch(() => setCouriers([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, paymentFilter, methodFilter, courierFilter]);

  const methodOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      const id = o.delivery?.method_id;
      if (id && !seen.has(id)) seen.set(id, o.delivery?.method_name || '—');
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [orders]);

  // Courier is free-text on the order (no FK to the couriers settings
  // table), so this filter goes by name, same convention as Method going by
  // method_id: only names actually present in the current data.
  const courierOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of orders) {
      const name = o.delivery?.courier_name;
      if (name && !seen.has(name)) seen.add(name);
    }
    return Array.from(seen, (name) => ({ value: name, label: name }));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (paymentFilter) {
        const isPaid = !!o.delivery_payment_summary?.is_paid;
        if (paymentFilter === 'paid' && !isPaid) return false;
        if (paymentFilter === 'unpaid' && isPaid) return false;
      }
      if (methodFilter && o.delivery?.method_id !== methodFilter) return false;
      if (courierFilter && o.delivery?.courier_name !== courierFilter) return false;
      if (q) {
        const orderLabel = formatOrderNumber(o).toLowerCase();
        if (!orderLabel.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, paymentFilter, methodFilter, courierFilter]);

  // Summary tiles over `filtered` (search + payment/method/courier, plus
  // whatever status was narrowed server-side in `load`) so they track
  // whatever's currently filtered, not the whole fetched set.
  const stats = useMemo(() => {
    let pending = 0;
    let delivered = 0;
    let cancelled = 0;
    let collectedCents = 0;
    let outstanding = 0;
    for (const o of filtered) {
      const s = o.delivery?.status;
      if (s === 'pending') pending += 1;
      else if (s === 'delivered') delivered += 1;
      else if (s === 'cancelled') cancelled += 1;

      const paidCents = o.delivery_payment_summary?.paid_cents ?? 0;
      collectedCents += paidCents;
      if (s !== 'cancelled') {
        const due = Number(o.total_amount ?? 0) - paidCents / 100;
        if (due > 0) outstanding += due;
      }
    }
    return { total: filtered.length, pending, delivered, cancelled, collectedCents, outstanding };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  if (loading && orders.length === 0) return <LoadingSpinner text="Loading deliveries..." />;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        title="Deliveries"
        description="Orders placed through a delivery method, kept apart from dine-in and takeaway."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile title="Deliveries" value={stats.total} icon={Bike} color="default" />
        <StatTile title="Pending" value={stats.pending} icon={Hourglass} color="warning" />
        <StatTile title="Delivered" value={stats.delivered} icon={PackageCheck} color="success" />
        <StatTile title="Cancelled" value={stats.cancelled} icon={XCircle} color="danger" />
        <StatTile title="Collected" value={birr(stats.collectedCents / 100)} icon={CreditCard} color="success" />
        <StatTile title="Outstanding" value={birr(stats.outstanding)} icon={Wallet} color="warning" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order #..." wrapperClassName="w-full sm:max-w-xs" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">Status: All</option>
            <option value="pending">Pending</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">Payment: All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          {methodOptions.length > 0 && (
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">Method: All</option>
              {methodOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
          {courierOptions.length > 0 && (
            <select
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">Courier: All</option>
              {courierOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {pagedOrders.length === 0 ? (
            <EmptyState
              icon={<Bike />}
              title="No delivery orders found"
              description={orders.length === 0 ? 'Delivery orders will show up here.' : 'Try adjusting your filters.'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Placed by</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{formatOrderNumber(o)}</TableCell>
                    <TableCell>{o.delivery?.method_name || '—'}</TableCell>
                    <TableCell>{o.cashier_name || o.employee_name || '—'}</TableCell>
                    <TableCell>
                      {(o.items ?? []).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className="text-muted-foreground block max-w-[16rem] truncate"
                          title={(o.items ?? [])
                            .map((it: any) => `${it.quantity}× ${it.name ?? it.menu_item_name ?? 'Item'}`)
                            .join(', ')}
                        >
                          {(o.items ?? [])
                            .map((it: any) => `${it.quantity}× ${it.name ?? it.menu_item_name ?? 'Item'}`)
                            .join(', ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{birr(o.total_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={o.delivery_payment_summary?.is_paid ? 'success' : 'warning'}>
                        {o.delivery_payment_summary?.is_paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="delivery" status={o.delivery?.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <DeliveryPaymentsPopover order={o} onChanged={load} />
                        <Button variant="ghost" size="sm" onClick={() => setManaging(o)}>
                          Manage
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {rangeStart}-{rangeEnd} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
};

export default DeliveryManagement;
