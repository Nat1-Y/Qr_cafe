import { formatOrderNumber } from "@/lib/utils";
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/common/StatusBadge';
import { formatETB } from '@/lib/format';

interface OrderStreamPanelProps {
  orders: any[];
  getOrderSubtotal: (order: any) => number;
}

const itemSummary = (order: any) =>
  (Array.isArray(order?.items) ? order.items : [])
    .map((it: any) => `${parseInt(it?.quantity, 10) || 1} × ${it?.menu_item_name || it?.name || 'Item'}`)
    .join(', ');

/** Recent orders as list rows: number and table, item summary, amount, status. */
export const OrderStreamPanel: React.FC<OrderStreamPanelProps> = ({
  orders,
  getOrderSubtotal
}) => {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b border-border">
        <div>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>Newest first, in this range.</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard/orders')}>
          All orders
        </Button>
      </CardHeader>
      {orders.length > 0 ? (
        <ul className="divide-y divide-border">
          {orders.map((order: any) => {
            const summary = itemSummary(order);
            const paid = String(order?.payment_status || '').toLowerCase() === 'paid';
            return (
              <li key={order.id} className="flex items-start justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-row-hover">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {formatOrderNumber(order)}
                    {order.table_number ? ` · Table ${order.table_number}` : ''}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {summary || <span className="capitalize">{order.type}</span>}
                  </p>
                  <p className="text-meta text-muted-foreground">
                    {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold text-foreground">{formatETB(getOrderSubtotal(order))}</span>
                  <StatusBadge kind="order" status={paid ? 'paid' : order.status} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">No orders in this range yet.</p>
      )}
    </Card>
  );
};
