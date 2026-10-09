import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/common/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { uuidToDisplayId, getOrderPlacerLabel, getOrderCreator } from '@/lib/utils';

interface RecentPaymentsPanelProps {
  payments: any[];
  loading: boolean;
  expandedPaymentIds: Set<string>;
  loadingOrderIds: Set<string>;
  orderDetailsById: any;
  businessUnit: string;
  selectedMenuItemId: string;
  formatCurrency: (val: any) => string;
  getOrderUnitBreakdown: (order: any, unit: string | null) => any;
  getItemSubtotalBirr: (item: any) => number;
  getPaymentAmountForSelection: (payment: any, unit: string, itemId: string) => number;
  toggleRecentPaymentDetails: (payment: any) => void;
  orderIndex?: any;
}

export const RecentPaymentsPanel: React.FC<RecentPaymentsPanelProps> = ({
  payments,
  loading,
  expandedPaymentIds,
  loadingOrderIds,
  orderDetailsById,
  businessUnit,
  selectedMenuItemId,
  formatCurrency,
  getOrderUnitBreakdown,
  getItemSubtotalBirr,
  getPaymentAmountForSelection,
  toggleRecentPaymentDetails
  , orderIndex
}) => {
  const resolvePaymentOrderId = (payment: any) => {
    const directOrderId = payment?.order_id != null ? payment.order_id : null;
    if (directOrderId != null && directOrderId !== "") return directOrderId;

    const nestedOrderId = payment?.order?.id != null ? payment.order.id : null;
    if (nestedOrderId != null && nestedOrderId !== "") return nestedOrderId;

    const metaOrderId = payment?.meta?.orderId != null ? payment.meta.orderId : null;
    if (metaOrderId != null && metaOrderId !== "") return metaOrderId;

    const metaOrderIdAlt = payment?.meta?.order_id != null ? payment.meta.order_id : null;
    if (metaOrderIdAlt != null && metaOrderIdAlt !== "") return metaOrderIdAlt;

    return null;
  };

  const getOrderFromIndex = (orderId: number | null) => {
    if (orderId == null) return null;
    const idx: any = orderIndex || {};
    if (idx.byId && idx.byId[orderId]) return idx.byId[orderId];
    if (idx.byRemoteId && idx.byRemoteId[orderId]) return idx.byRemoteId[orderId];
    if (idx.byLocalId && idx.byLocalId[String(orderId)]) return idx.byLocalId[String(orderId)];
    // fallback to direct map
    if (orderDetailsById && orderDetailsById[orderId]) return orderDetailsById[orderId];
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle>Recent payments</CardTitle>
        <CardDescription>What this till has charged so far.</CardDescription>
      </CardHeader>
      {payments.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">No payments yet today.</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
          {payments.map((payment: any) => {
            // Local payments don't carry order_number (offline-first), so
            // resolve it from the linked order; fall back to a short id.
            const orderId = resolvePaymentOrderId(payment);
            const linkedOrder = orderId != null ? getOrderFromIndex(orderId) : null;
            const num = payment.order_number ?? linkedOrder?.order_number;
            const orderLabel =
              num != null ? `#${num}` : orderId != null ? `#${uuidToDisplayId(String(orderId))}` : 'Payment';
            const unitAmount = getPaymentAmountForSelection(payment, businessUnit, selectedMenuItemId);
            const needsDetails = !(businessUnit === 'all' && selectedMenuItemId === 'all');
            const hasDetails = !needsDetails || (orderId == null ? false : !!linkedOrder);
            const method = String(payment.payment_method || 'unknown').replace('_', ' ');
            const expanded = expandedPaymentIds.has(payment.id);

            return (
              <li key={payment.id} className="px-6 py-3 transition-colors hover:bg-row-hover">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleRecentPaymentDetails(payment)}
                    className="min-w-0 text-left"
                    aria-expanded={expanded}
                  >
                    <p className="flex items-center gap-1 font-semibold text-foreground">
                      {orderLabel}
                      <span className="font-normal capitalize text-muted-foreground">· {method}</span>
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </p>
                    <p className="text-meta text-muted-foreground">
                      {new Date(payment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold text-foreground">
                      {needsDetails && !hasDetails ? '…' : formatCurrency(unitAmount)}
                    </span>
                    <StatusBadge kind="payment" status={payment.status} />
                  </div>
                </div>

                {expanded && (
                  <div className="mt-2 space-y-1.5 border-t border-dashed border-border pt-2 text-sm">
                    {(() => {
                      if (orderId == null) return <p className="text-meta text-muted-foreground">No order details</p>;
                      if (loadingOrderIds.has(String(orderId))) return <Skeleton className="h-8 w-full" />;

                      const order = linkedOrder;
                      if (!order) return <p className="text-meta text-muted-foreground">Details unavailable</p>;

                      const unit = businessUnit === 'all' ? null : businessUnit;
                      const breakdown = getOrderUnitBreakdown(order, unit);
                      const itemsRaw = Array.isArray(breakdown.items) ? breakdown.items : [];
                      const targetMenuItemId = selectedMenuItemId !== 'all' ? selectedMenuItemId : null;
                      const items = targetMenuItemId !== null
                        ? itemsRaw.filter((it: any) => it?.menu_item_id === targetMenuItemId)
                        : itemsRaw;
                      const creator = getOrderCreator(order);

                      return (
                        <>
                          {(order.employee_name || order.waiter_name) && (
                            <p className="text-meta text-muted-foreground">
                              {getOrderPlacerLabel(order)}: <span className="text-foreground">{order.employee_name || order.waiter_name}</span>
                            </p>
                          )}
                          {creator && (
                            <p className="text-meta text-muted-foreground">
                              Placed by {creator.label}: <span className="text-foreground">{creator.name}</span>
                            </p>
                          )}
                          {items.map((it: any) => (
                            <div
                              key={it.id || `${it.menu_item_id}-${it.quantity}`}
                              className="flex items-baseline justify-between gap-3"
                            >
                              <span className="min-w-0 truncate">
                                <span className="text-muted-foreground">{parseInt(it.quantity, 10) || 0} ×</span>{' '}
                                {it.menu_item_name || it.name || 'Item'}
                              </span>
                              <span className="shrink-0 text-foreground">{formatCurrency(getItemSubtotalBirr(it))}</span>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
