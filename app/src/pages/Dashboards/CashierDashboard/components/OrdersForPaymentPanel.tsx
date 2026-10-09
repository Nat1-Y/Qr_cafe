import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatOrderNumber, getOrderPlacerLabel, getOrderCreator } from '@/lib/utils';

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
  /** The order open in the charge panel, highlighted in the list. */
  selectedOrderId?: string | number | null;
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
  currentUserRole,
  selectedOrderId,
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
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Waiting for payment</CardTitle>
            <CardDescription>Served orders, newest first.</CardDescription>
          </div>
          <span className="shrink-0 rounded-full bg-highlight px-2.5 py-0.5 text-eyebrow text-highlight-foreground">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </span>
        </div>

        {tableSummaries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={tableNumberFilter || 'all'}
              onValueChange={(v) => setTableNumberFilter(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-10 w-full rounded-full px-4 sm:w-52">
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
            <SearchInput
              inputMode="numeric"
              placeholder="Table #"
              value={tableSearch}
              onChange={(e) => handleTableSearchChange(e.target.value)}
              wrapperClassName="w-32"
            />
          </div>
        )}
      </CardHeader>

      {/* Totals for the selected table */}
      {tableNumberFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-highlight/30 px-6 py-4">
          <div>
            <p className="font-semibold text-foreground">Table {tableNumberFilter}</p>
            <p className="text-meta text-muted-foreground">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'} · {formatCurrency(visibleOrdersTotal)} due
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTableNumberFilter('')}
              aria-label="Clear table filter"
            >
              <X />
            </Button>
            <Button disabled={orders.length === 0 || settlingBatch} onClick={onOpenSettleTable}>
              {settlingBatch ? <RefreshCw className="animate-spin" /> : null}
              Charge all for Table {tableNumberFilter}
            </Button>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing waiting. New orders show up here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {orders.map((order: any) => {
            const unitSubtotal = getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId);
            const full = parseFloat(order.total_amount) || 0;
            const showFull = businessUnit !== 'all' && Number.isFinite(full) && Math.abs(full - unitSubtotal) > 0.01;

            const unit = businessUnit === 'all' ? null : businessUnit;
            const breakdown = getOrderUnitBreakdown(order, unit);
            const itemsRaw = Array.isArray(breakdown?.items) ? breakdown.items : [];
            const targetMenuItemId = selectedMenuItemId !== 'all' ? selectedMenuItemId : null;
            const items = targetMenuItemId !== null
              ? itemsRaw.filter((it: any) => it?.menu_item_id === targetMenuItemId)
              : itemsRaw;
            const summary = items
              .map((it: any) => `${parseInt(it.quantity, 10) || 1} × ${it.menu_item_name || it.name || 'Item'}`)
              .join(', ');

            const creator = getOrderCreator(order);
            const staff = order.waiter_name || order.employee_name;
            const isSelected = selectedOrderId != null && String(selectedOrderId) === String(order.id);
            const isProcessingThis = processingOrderIds.has(order.id);

            return (
              <li
                key={order.id}
                className={cn(
                  'flex flex-col gap-3 px-6 py-4 transition-colors sm:flex-row sm:items-start',
                  isSelected ? 'bg-highlight/40' : 'hover:bg-row-hover'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {formatOrderNumber(order)}
                    {order.table_number ? ` · Table ${order.table_number}` : ''}
                  </p>
                  {summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
                  <p className="mt-1 text-meta text-muted-foreground">
                    {staff ? `${getOrderPlacerLabel(order)}: ${staff}` : null}
                    {creator ? `${staff ? ' · ' : ''}Placed by ${creator.label}: ${creator.name}` : null}
                    {' · '}
                    {new Date(order.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{formatCurrency(unitSubtotal)}</p>
                    {showFull && <p className="text-meta text-muted-foreground">of {formatCurrency(full)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {canAddItems(order) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isBlockingPaymentUi}
                        onClick={() => goAddItems(order)}
                      >
                        Add items
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isSelected ? 'selected' : 'default'}
                      disabled={isBlockingPaymentUi || isProcessingThis}
                      onClick={() => onConfirmPayment(order)}
                    >
                      {isProcessingThis ? 'Charging…' : 'Charge'}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
