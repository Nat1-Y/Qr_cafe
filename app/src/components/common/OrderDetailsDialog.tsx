import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import api from '@/application';
import { uuidToDisplayId, formatOrderNumber } from '@/lib/utils';

export interface OrderDetailsDialogProps {
  order: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usersMap?: { [key: number | string]: { name: string; role: string } };
  // Only the order's creator may add items to it (backend-enforced too — this
  // is the UI-side gate so the button isn't offered where it would just be
  // rejected). Off by default so read-only detail views (e.g. an employee's
  // historical order snapshot) don't need to opt out explicitly.
  enableAddItems?: boolean;
  currentUserId?: string | number | null;
  // Cashiers (and all-access roles) manage the whole payment queue, which in
  // practice means orders a *waiter* created — the backend exempts them from
  // the creator-only check for exactly that reason, so mirror it here too.
  currentUserRole?: string | null;
  // "Add Items" navigates to the full order-creation screen (pre-loaded with
  // this order) instead of offering its own picker here — this dialog just
  // triggers that navigation and closes itself.
  onAddItems?: (order: any) => void;
}

// Items can be added to an open order or a served ("done") one, which reopens
// it — mirrors the web waiter portal's canAddItems (preparing/ready are folded
// into these two states under the collapsed status vocabulary).
const ADDABLE_STATUSES = new Set(['pending', 'done']);
const OWNERSHIP_EXEMPT_ROLES = new Set([
  'cashier',
  'super_admin',
  'owner',
  'business_admin',
]);

export const OrderDetailsDialog: React.FC<OrderDetailsDialogProps> = ({
  order,
  open,
  onOpenChange,
  usersMap,
  enableAddItems = false,
  currentUserId = null,
  currentUserRole = null,
  onAddItems,
}) => {
  const [itemAdditions, setItemAdditions] = useState<any[]>([]);

  // Oldest-first so the block below reads as a timeline: original items,
  // then each addition in the order it actually happened.
  const chronologicalAdditions = React.useMemo(
    () =>
      [...itemAdditions].sort(
        (a, b) => new Date(a.added_at || 0).getTime() - new Date(b.added_at || 0).getTime(),
      ),
    [itemAdditions],
  );

  // order.items is the final, merged state (addItems bumps quantity on the
  // existing line rather than appending — see orders.adapter.ts addItems), so
  // the "original" line-up has to be reconstructed by subtracting every
  // addition's quantity back out, per menu_item_id.
  const originalItems = React.useMemo(() => {
    const items = order?.items || [];
    if (!itemAdditions.length) return items;
    const addedQtyByItem = new Map<string, number>();
    for (const addition of itemAdditions) {
      for (const it of addition.items || []) {
        const key = String(it.menu_item_id);
        addedQtyByItem.set(key, (addedQtyByItem.get(key) || 0) + Number(it.quantity || 0));
      }
    }
    return items
      .map((item: any) => {
        const key = String(item.menu_item_id);
        const originalQty = Number(item.quantity || 0) - (addedQtyByItem.get(key) || 0);
        return originalQty > 0 ? { ...item, quantity: originalQty } : null;
      })
      .filter(Boolean);
  }, [order?.items, itemAdditions]);

  const creatorId = order?.created_by_id ?? order?.waiter_id ?? order?.employee_id ?? null;
  const isOwnershipExempt = OWNERSHIP_EXEMPT_ROLES.has(String(currentUserRole || '').toLowerCase());
  // The backend rejects any item addition once payment_status is "paid"
  // (order.service.ts assertCanModifyOrderItems) — gate the button here too,
  // or clicking it just queues an addition that fails forever at sync time.
  const isPaid = String(order?.payment_status || '').toLowerCase() === 'paid';
  const canAddItems =
    enableAddItems &&
    !!order &&
    !isPaid &&
    (isOwnershipExempt ||
      (currentUserId != null && creatorId != null && String(creatorId) === String(currentUserId))) &&
    ADDABLE_STATUSES.has(String(order?.status || '').toLowerCase());

  // Load the audit trail whenever a different order is opened.
  useEffect(() => {
    setItemAdditions([]);
    if (!order?.id) return;
    (async () => {
      try {
        const resp = await (api.orders as any).getItemAdditions(order.id);
        const additions =
          resp?.data?.data?.itemAdditions ?? resp?.data?.itemAdditions ?? [];
        setItemAdditions(Array.isArray(additions) ? additions : []);
      } catch {
        // Non-fatal — the dialog still works without the audit block.
      }
    })();
  }, [order?.id]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details {formatOrderNumber(order)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-md">
            <div>
              <span className="text-muted-foreground block text-xs uppercase tracking-wider">Waiter</span>
              <span className="font-medium">
                {usersMap && (order.waiter_id || order.employee_id)
                  ? (usersMap[order.waiter_id || order.employee_id]?.name || 'N/A')
                  : order.employee_name || 'N/A'}
              </span>
            </div>
            {order.created_by_id && order.created_by_id !== (order.waiter_id || order.employee_id) && (
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Cashier / Created By</span>
                <span className="font-medium">{usersMap?.[order.created_by_id]?.name || 'Unknown'}</span>
              </div>
            )}
            {order.table_number && (
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Table</span>
                <span className="font-medium">#{order.table_number}</span>
              </div>
            )}
            <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wider">Type</span>
                <span className="font-medium capitalize">{order.type}</span>
            </div>
          </div>
          <div className="rounded-md border p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Order placed{order.created_at ? ` — ${new Date(order.created_at).toLocaleString()}` : ''}
              </p>
              <div className="space-y-3">
                {originalItems.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{item.name || item.menu_item_name || 'Item'}</p>
                      <p className="text-muted-foreground">{item.quantity} x {parseFloat(item.unit_price || item.price || 0).toLocaleString()} Birr</p>
                    </div>
                    <p className="font-medium">
                      {(item.quantity * parseFloat(item.unit_price || item.price || 0)).toLocaleString()} Birr
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {chronologicalAdditions.map((addition: any) => (
              <div key={addition.id} className="pt-3 border-t border-dashed">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Added by {addition.added_by_name || 'Unknown'}
                  {addition.added_at ? ` — ${new Date(addition.added_at).toLocaleString()}` : ''}
                </p>
                <div className="space-y-3">
                  {(addition.items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{item.menu_item_name || item.name || 'Item'}</p>
                        <p className="text-muted-foreground">{item.quantity} x {parseFloat(item.unit_price || item.price || 0).toLocaleString()} Birr</p>
                      </div>
                      <p className="font-medium">
                        {(item.quantity * parseFloat(item.unit_price || item.price || 0)).toLocaleString()} Birr
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-4 border-t flex justify-between items-center font-bold">
              <span>Total Amount</span>
              <span className="text-primary">{parseFloat(order.total_amount || 0).toLocaleString()} Birr</span>
            </div>
          </div>

          {order?.notes && (
            <div className="text-sm">
              <span className="font-semibold">Notes:</span>
              <p className="text-muted-foreground mt-1 bg-muted p-2 rounded-md">{order.notes}</p>
            </div>
          )}

          {canAddItems && (
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => onAddItems?.(order)}
            >
              <Plus className="h-4 w-4" /> Add Items
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
