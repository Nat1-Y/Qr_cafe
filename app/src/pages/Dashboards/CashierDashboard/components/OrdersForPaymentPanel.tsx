import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, MapPin, CheckCircle2, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatOrderNumber, getOrderPlacerLabel, getOrderCreator } from '@/lib/utils';

interface TableSummary {
  table_number: string;
  count: number;
  total: number;
}

interface OrdersForPaymentPanelProps {
  orders: any[];
  loading: boolean;
  expandedPaymentIds: Set<string>;
  loadingOrderIds: Set<string>;
  processingOrderIds: Set<string>;
  isBlockingPaymentUi: boolean;
  businessUnit: string;
  selectedMenuItemId: string;
  tableNumberFilter: string;
  setTableNumberFilter: (val: string) => void;
  tableSummaries: TableSummary[];
  visibleOrdersTotal: number;
  onOpenSettleTable: () => void;
  settlingBatch: boolean;
  formatCurrency: (val: any) => string;
  getOrderSubtotalForUnitAndMenuItem: (order: any, unit: string, itemId: string) => number;
  getOrderUnitBreakdown: (order: any, unit: string | null) => any;
  getItemSubtotalBirr: (item: any) => number;
  toggleRecentPaymentDetails: (payment: any) => void;
  onConfirmPayment: (order: any) => void;
  currentUserId?: string | number | null;
  currentUserRole?: string | null;
}

// Items can be added to an open order or a served ("done") one, which
// reopens it — mirrors the desktop OrderManagement page / web portals.
const ADDABLE_STATUSES = new Set(['pending', 'done']);

export const OrdersForPaymentPanel: React.FC<OrdersForPaymentPanelProps> = ({
  orders,
  loading,
  processingOrderIds,
  isBlockingPaymentUi,
  businessUnit,
  selectedMenuItemId,
  tableNumberFilter,
  setTableNumberFilter,
  tableSummaries,
  visibleOrdersTotal,
  onOpenSettleTable,
  settlingBatch,
  formatCurrency,
  getOrderSubtotalForUnitAndMenuItem,
  getOrderUnitBreakdown,
  getItemSubtotalBirr,
  onConfirmPayment,
  currentUserId,
  currentUserRole
}) => {
  const navigate = useNavigate();

  // Text box for jumping straight to a table by number instead of scrolling
  // the dropdown. Kept as separate state (not bound directly to
  // `tableNumberFilter`) so a partial, not-yet-matching keystroke (e.g. "1"
  // while typing "12") isn't wiped out by the dashboard's "stale filter"
  // effect, which clears `tableNumberFilter` the instant it stops matching
  // any order. The filter itself is only ever applied on an exact match.
  const [tableSearch, setTableSearch] = useState(tableNumberFilter);
  useEffect(() => {
    setTableSearch(tableNumberFilter);
  }, [tableNumberFilter]);

  const handleTableSearchChange = (value: string) => {
    setTableSearch(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setTableNumberFilter('');
      return;
    }
    const match = tableSummaries.find(
      (t) => t.table_number.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) setTableNumberFilter(match.table_number);
  };

  // Only the order's creator may add items — except cashiers (and all-access
  // roles), who manage the whole payment queue and in practice are looking at
  // orders a *waiter* created. Mirrors the backend's own exemption. In
  // practice this component only ever renders for the "cashier" role (see
  // App.tsx's DashboardRouter), so isOwnershipExempt is always true here —
  // kept explicit for consistency with the other surfaces' gating.
  const isOwnershipExempt = ['cashier', 'super_admin', 'owner', 'business_admin'].includes(
    String(currentUserRole || '').toLowerCase(),
  );
  const canAddItems = (order: any) => {
    if (!ADDABLE_STATUSES.has(String(order?.status || '').toLowerCase())) return false;
    // Backend rejects item additions to a paid order (order.service.ts
    // assertCanModifyOrderItems) — this list is normally unpaid-only, but a
    // stale order object (a payment that landed elsewhere hasn't refreshed
    // this device's copy yet) can still slip through, so check it too.
    if (String(order?.payment_status || '').toLowerCase() === 'paid') return false;
    if (isOwnershipExempt) return true;
    const creatorId = order?.created_by_id ?? order?.waiter_id ?? order?.employee_id;
    return (
      creatorId != null &&
      currentUserId != null &&
      String(creatorId) === String(currentUserId)
    );
  };

  // "Add Items" navigates to the cashier's full order-creation screen
  // pre-loaded with this order + its original waiter, skipping the usual
  // waiter-selection step (the order already has a definite waiter).
  const goAddItems = (order: any) => {
    const waiter = {
      id: order.waiter_id ?? order.employee_id,
      full_name: order.waiter_name || order.employee_name,
      name: order.waiter_name || order.employee_name,
    };
    navigate('/dashboard/cashier/create-order', { state: { waiter, existingOrder: order } });
  };
  if (loading) {
    return (
      <Card className="flex flex-col min-h-[400px] lg:min-h-[550px] overflow-hidden">
        <CardHeader className="pb-3 border-b">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="pt-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full mb-4 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col min-h-[400px] lg:min-h-[550px] overflow-hidden">
      <CardHeader className="pb-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-2 sm:flex-1 sm:justify-start">
          <div>
            <CardTitle className="text-sm">Ready for Payment</CardTitle>
            <CardDescription>Finalized wait staff services</CardDescription>
          </div>
          <Badge variant="info" className="text-xs font-bold shrink-0 sm:hidden">
            {orders.length} Orders
          </Badge>
        </div>

        <Badge variant="info" className="hidden sm:inline-flex text-xs font-bold shrink-0">
          {orders.length} Orders
        </Badge>
      </CardHeader>
      <CardContent className="pt-6 overflow-y-auto flex-1 space-y-3">
        {/* Table selector */}
        {tableSummaries.length > 0 && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground shrink-0" />
            <Select
              value={tableNumberFilter || 'all'}
              onValueChange={(v) => setTableNumberFilter(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-9 w-full sm:w-56 text-xs font-bold">
                <SelectValue placeholder="All tables" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {tableSummaries.map((t) => (
                  <SelectItem key={t.table_number} value={t.table_number}>
                    Table {t.table_number} ({t.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-24 sm:w-28 shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Table #"
                value={tableSearch}
                onChange={(e) => handleTableSearchChange(e.target.value)}
                className="h-9 pl-8 pr-2 text-xs font-bold"
              />
            </div>
          </div>
        )}

        {/* Aggregate card for the selected table */}
        {tableNumberFilter && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                <MapPin className="size-4 text-primary" />
                Table {tableNumberFilter}
              </div>
              <button
                type="button"
                onClick={() => setTableNumberFilter('')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear table filter"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {orders.length} order{orders.length === 1 ? '' : 's'} attached to this table
            </p>
            <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground">Total due</span>
              <span className="text-lg font-extrabold text-foreground">
                {formatCurrency(visibleOrdersTotal)}
              </span>
            </div>
            <Button
              size="sm"
              className="w-full h-10 bg-success hover:bg-green-700 text-white font-extrabold"
              disabled={orders.length === 0 || settlingBatch}
              onClick={onOpenSettleTable}
            >
              {settlingBatch ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Confirm all payments for Table {tableNumberFilter}
            </Button>
          </div>
        )}

        {orders.map((order: any) => (
          <div key={order.id} className="border rounded-2xl p-4 bg-muted/20 hover:bg-muted/30 transition-colors space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="font-extrabold text-md text-foreground">
                  Order {formatOrderNumber(order)}{order.table_number && ` • Table ${order.table_number}`}
                </span>
                <p className="font-extrabold text-md text-foreground">
                  {getOrderPlacerLabel(order)}: {order.waiter_name || order.employee_name}
                </p>
                {(() => {
                  const creator = getOrderCreator(order);
                  if (!creator) return null;
                  return (
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      Placed by {creator.label}: <span className="text-foreground font-bold">{creator.name}</span>
                    </p>
                  );
                })()}
              </div>

              {(() => {
                const unitSubtotal = getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId);
                const full = parseFloat(order.total_amount) || 0;
                const showFull = businessUnit !== 'all' && Number.isFinite(full) && Math.abs(full - unitSubtotal) > 0.01;
                return (
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-success">{formatCurrency(unitSubtotal)}</div>
                    {showFull && <div className="text-[9px] text-muted-foreground">of {formatCurrency(full)}</div>}
                  </div>
                );
              })()}
            </div>

            {(() => {
              const unit = businessUnit === 'all' ? null : businessUnit;
              const breakdown = getOrderUnitBreakdown(order, unit);
              const itemsRaw = Array.isArray(breakdown?.items) ? breakdown.items : [];
              const targetMenuItemId = selectedMenuItemId !== 'all' ? selectedMenuItemId : null;
              const items = targetMenuItemId !== null
                ? itemsRaw.filter((it: any) => it?.menu_item_id === targetMenuItemId)
                : itemsRaw;
              if (!Array.isArray(items) || items.length === 0) return null;
              return (
                <div className="bg-background border rounded-xl p-2.5 space-y-1">
                  {items.map((it: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="truncate text-muted-foreground">
                        <span className="font-extrabold text-foreground mr-1">{(parseInt(it.quantity, 10) || 1)}x</span>
                        {it.menu_item_name || it.name || 'Item'}
                      </span>
                      <span className="font-extrabold text-foreground">{formatCurrency(getItemSubtotalBirr(it))}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] pt-1.5 border-t">
              <span className="text-muted-foreground font-semibold">
                Completed: {new Date(order.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>

              <div className="flex items-center gap-2 ml-auto">
                {canAddItems(order) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-[11px] font-bold"
                    disabled={isBlockingPaymentUi}
                    onClick={() => goAddItems(order)}
                  >
                    Add Items
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-9 text-[11px] bg-success hover:bg-green-700 text-white font-extrabold"
                  disabled={isBlockingPaymentUi || processingOrderIds.has(order.id)}
                  onClick={() => onConfirmPayment(order)}
                >
                  {processingOrderIds.has(order.id) ? 'Processing...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground font-bold border border-dashed rounded-xl bg-muted/20">
            No orders waiting for payment
          </div>
        )}
      </CardContent>
    </Card>
  );
};
