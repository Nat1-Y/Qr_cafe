import { uuidToDisplayId, formatOrderNumber, getOrderSource, displayStatus } from "@/lib/utils";
import StatusBadge from '@/components/common/StatusBadge';
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Utensils, Eye } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderDetailsDialog } from '@/components/common/OrderDetailsDialog';
import { formatETB } from '@/lib/format';

interface OrdersListProps {
  orders: any[];
  selectedDate: string;
  userRole?: string;
  paidOrderIdSet: Set<string>;
  menuMainCategoryById: { [key: number]: string };
  filterType: string;
  onUpdateStatus: (orderId: number, status: string) => void;
  onCreateNew: () => void;
  usersMap?: { [key: number]: { name: string; role: string } };
  currentUserId?: string | number | null;
  onAddItems?: (order: any) => void;
}

export const OrdersList: React.FC<OrdersListProps> = ({
  orders,
  paidOrderIdSet,
  usersMap,
  currentUserId,
  userRole,
  onAddItems
}) => {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const getWaiterName = (order: any) => {
    const waiterId = order.waiter_id || order.employee_id || order.created_by_id;
    const user = waiterId && usersMap ? usersMap[waiterId] : null;
    // Prefer the local users map, but fall back to the server-resolved name so
    // owner/admin-placed orders (whose creator isn't in the local users map)
    // still show who created them instead of "N/A".
    return user?.name || order.employee_name || order.waiter_name || 'N/A';
  };

  if (!orders.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Table</TableHead>
            <TableHead>Waiter</TableHead>
            <TableHead>Placed by</TableHead>
            <TableHead>Date & time</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-center">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const isPaid = paidOrderIdSet?.has(String(order.id)) || order.payment_status === 'paid';
            const items = order.items || [];
            const totalItemsCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
            const waiterName = getWaiterName(order);

            return (
              <TableRow
                key={order.id}
                className={`transition-colors ${order.status === 'done' ? 'bg-success-soft' :
                  order.status === 'pending' ? 'bg-warning-soft' : ''
                  } hover:bg-muted/50`}
                onClick={() => setSelectedOrder(order)}
              >
                <TableCell className="font-medium">{formatOrderNumber(order)}</TableCell>

                <TableCell>
                  {order.table_number ? (
                    <Badge className="bg-info-soft text-info border border-info/30 hover:bg-info-soft">
                      #{order.table_number}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">None selected</span>
                  )}
                </TableCell>
                <TableCell className="font-medium text-sm">{waiterName}</TableCell>
                <TableCell>
                  {(() => {
                    const source = getOrderSource(order);
                    if (source === 'cashier') {
                      return (
                        <Badge variant="secondary">Cashier</Badge>
                      );
                    }
                    if (source === 'owner') {
                      return (
                        <Badge variant="secondary">Owner</Badge>
                      );
                    }
                    return (
                      <Badge variant="secondary">Waiter</Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(order.created_at).toLocaleString()}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1">
                    <Utensils className="w-3 h-3" />
                    {totalItemsCount}
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  {formatETB(order.total_amount)}
                </TableCell>
                <TableCell>
                  {(() => {
                    // Unified vocabulary: deleted (cancelled/voided) → paid
                    // (confirmed) → pending (in process).
                    const state =
                      displayStatus(order.status) === 'deleted'
                        ? 'deleted'
                        : isPaid
                          ? 'paid'
                          : 'pending';
                    return (
                      <StatusBadge kind="order" status={state === 'deleted' ? 'cancelled' : state} />
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)} className="h-8 w-8 hover:bg-muted hover:text-foreground">
                    <Eye />
                  </Button>
                </TableCell>

              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <OrderDetailsDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        usersMap={usersMap}
        enableAddItems
        currentUserId={currentUserId}
        currentUserRole={userRole}
        onAddItems={(order) => {
          setSelectedOrder(null);
          onAddItems?.(order);
        }}
      />
    </div>
  );
};
