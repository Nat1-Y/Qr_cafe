import React, { useEffect, useRef, useState } from 'react';
import api from '@/application';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatOrderNumber } from '@/lib/utils';
import { generateLocalId } from '@/db/localDb';
import { formatETB } from '@/lib/format';

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: any[];
  userRole?: string;
  userId?: number | string;
  onSuccess: () => void;
  onInventoryInsufficient?: (details: any[]) => void;
  // When set, this dialog adds items to an already-created order instead of
  // creating a new one — the order's existing items are shown read-only for
  // context, table/type selection is hidden (the order's table is already
  // fixed), and submitting calls the addItems endpoint instead of createCafe.
  existingOrder?: any | null;
}

export const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({
  open,
  onOpenChange,
  menuItems,
  userRole,
  userId,
  onSuccess,
  onInventoryInsufficient,
  existingOrder = null,
}) => {
  const isAddMode = !!existingOrder;
  const [orderType, setOrderType] = useState('cafe');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  // Synchronous lock so a double-click can't fire two order creations before
  // `creating` re-renders the button to disabled.
  const submitLockRef = useRef(false);
  // Stable idempotency key for this whole dialog visit — generated once on the
  // first submit attempt and reused for every submit after that until one
  // actually succeeds. Deliberately NOT cleared when the cart is edited: a
  // user unsure whether a submit went through commonly re-picks the same
  // items before retrying rather than re-clicking the same button — clearing
  // the key on every cart edit (as an earlier version of this code did) meant
  // that ordinary retry path minted a fresh id every time, defeating the
  // guard entirely and doubling the added items.
  const addItemsIdRef = useRef<string | null>(null);
  const [forceTableSelection, setForceTableSelection] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.settings.getTableSelectionSettings();
        if (!cancelled) setForceTableSelection(Boolean((res as any)?.force_table_selection));
      } catch {
        // default to not forcing if the setting can't be read
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleAddItem = (item: any) => {
    const exists = selectedItems.find(i => i.menu_item_id === item.id);
    if (exists) {
      setSelectedItems(selectedItems.map(i =>
        i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems([...selectedItems, {
        menu_item_id: item.id,
        menu_item_name: item.name,
        price: item.price,
        quantity: 1
      }]);
    }
  };

  const handleRemoveItem = (itemId: string | number) => {
    setSelectedItems(selectedItems.filter(i => i.menu_item_id !== itemId));
  };

  const handleSubmitOrder = async () => {
    if (selectedItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    if (!isAddMode && forceTableSelection && !tableNumber) {
      toast.error('Table selection is mandatory to create an order.');
      return;
    }

    if (submitLockRef.current || creating) return;
    submitLockRef.current = true;

    try {
      setCreating(true);

      if (isAddMode) {
        // Reused across retries of this same cart (cleared on success or when
        // the cart itself changes) so a resubmit after a transient failure is
        // recognized as the same action instead of re-adding the items.
        if (!addItemsIdRef.current) addItemsIdRef.current = generateLocalId();
        await api.orders.addItems(existingOrder.id, {
          items: selectedItems.map(item => ({
            menu_item_id: item.menu_item_id,
            menu_item_name: item.menu_item_name,
            quantity: parseInt(item.quantity),
            unit_price: parseFloat(item.price),
            subtotal: parseFloat(item.price) * parseInt(item.quantity)
          })),
          updated_by: userId,
          addition_id: addItemsIdRef.current,
        });
        addItemsIdRef.current = null;
        toast.success('Items added to order successfully!');
        onSuccess();
        setSelectedItems([]);
        submitLockRef.current = false;
        setCreating(false);
        return;
      }

      const orderData: any = {
        employee_id: userId,
        waiter_id: userId,
        created_by_id: userId,
        type: orderType,
        items: selectedItems.map(item => ({
          menu_item_id: item.menu_item_id,
          quantity: parseInt(item.quantity),
          unit_price: parseFloat(item.price),
          subtotal: parseFloat(item.price) * parseInt(item.quantity)
        })),
        total_amount: selectedItems.reduce((sum, item) =>
          sum + (parseFloat(item.price) * parseInt(item.quantity)), 0
        )
      };

      if (orderType === 'cafe' && tableNumber) {
        orderData.table_number = parseInt(tableNumber);
      }

      await api.orders.createCafe(orderData);
      toast.success('Order created successfully!');
      onSuccess();
      setSelectedItems([]);
      setTableNumber('');
    } catch (error: any) {
      console.error(isAddMode ? 'Error adding items:' : 'Error creating order:', error);
      const details = error?.response?.data?.details;
      if (error?.response?.status === 409 && error?.response?.data?.error === 'insufficient_inventory') {
        onInventoryInsufficient?.(Array.isArray(details) ? details : []);
      }
      const fallbackMessage = isAddMode
        ? (error?.response?.status === 403
            ? 'Only the staff member who created this order can add items to it.'
            : 'Failed to add items')
        : 'Failed to create order';
      toast.error(error.response?.data?.message || fallbackMessage);
    } finally {
      submitLockRef.current = false;
      setCreating(false);
    }
  };

  const subtotal = selectedItems.reduce((sum, item) =>
    sum + (parseFloat(item.price) * parseInt(item.quantity)), 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAddMode
              ? `Add Items to Order ${formatOrderNumber(existingOrder)}`
              : `Create New ${orderType === 'cafe' ? 'Café' : 'Bakery'} Order`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          {/* Order Details */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Order details</h4>

            {!isAddMode && (
              <div className="space-y-2">
                <Label>Order type</Label>
                <Select value={orderType} onValueChange={setOrderType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cafe">Café</SelectItem>
                    <SelectItem value="restaurant">Restaurant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAddMode && (orderType === 'cafe' || forceTableSelection) && (
              <div className="space-y-2">
                <Label>
                  Table number
                  {forceTableSelection && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Select value={tableNumber} onValueChange={setTableNumber}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Table" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                      <SelectItem key={num} value={String(num)}>Table {num}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {forceTableSelection && (
                  <p className="text-xs text-muted-foreground">A table is required to create an order.</p>
                )}
              </div>
            )}

            {isAddMode && Array.isArray(existingOrder?.items) && existingOrder.items.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">Already on this order</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 border rounded-xl p-2.5 bg-muted/20">
                  {existingOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">
                        <span className="font-semibold text-foreground mr-1">{item.quantity}x</span>
                        {item.menu_item_name || item.name || 'Item'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Items */}
            <div className="space-y-3 pt-2">
              <Label className="text-sm">
                {isAddMode ? 'New Items' : 'Selected Items'}
              </Label>
              {selectedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-xl bg-muted/20">
                  No items selected
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedItems.map((item) => (
                    <div key={item.menu_item_id} className="flex items-center justify-between p-3 border rounded-xl">
                      <div>
                        <p className="font-semibold text-sm">{item.menu_item_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatETB(parseFloat(item.price))} × {item.quantity}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.menu_item_id)}
                        className="text-destructive h-7"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between items-center text-sm font-semibold">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-success">{formatETB(subtotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Available Items */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Available items</h4>
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto pr-1">
              {menuItems.map((item) => (
                <div key={item.id} className="border hover:border-primary/50 rounded-xl p-3 flex items-center justify-between transition-colors">
                  <div>
                    <h5 className="font-semibold text-sm">{item.name}</h5>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                    <span className="text-sm font-semibold text-success mt-1 block">
                      {formatETB(parseFloat(item.price))}
                    </span>
                  </div>
                  <Button
                    onClick={() => handleAddItem(item)}
                    disabled={!item.is_available}
                    size="sm"
                    className="h-8"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmitOrder} disabled={selectedItems.length === 0 || creating || (!isAddMode && forceTableSelection && !tableNumber)}>
            {isAddMode
              ? (creating ? 'Adding...' : 'Add Items')
              : (creating ? 'Creating...' : 'Create Order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
