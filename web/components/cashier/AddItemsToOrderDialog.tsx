"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Minus, X, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatOrderNumber } from "@/lib/utils";
import { cashierServices } from "@/lib/cashier/api";

interface AddItemsToOrderDialogProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId?: string | number | null;
  formatCurrency: (val: any) => string;
  // Called after a successful save with the response's addition record, so
  // the caller can refresh its own order list / audit-trail state.
  onSaved?: () => void;
}

// Self-contained: manages its own menu fetch, search, and pending-items cart
// state, so callers only need to control open/close. Mirrors the waiter
// portal's add-items flow (web/components/waiter/order-history) at the API
// level — same POST /orders/:id/items call — with a simpler single-column UI.
export const AddItemsToOrderDialog: React.FC<AddItemsToOrderDialogProps> = ({
  order,
  open,
  onOpenChange,
  currentUserId,
  formatCurrency,
  onSaved,
}) => {
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPendingItems([]);
    setSearch("");
    if (menuItems.length > 0) return;
    setMenuLoading(true);
    (async () => {
      try {
        const res: any = await cashierServices.menu.getCafeMenu();
        const payload = res?.data ?? res;
        const items =
          payload?.data?.menuItems ?? payload?.menuItems ?? payload?.data ?? [];
        setMenuItems(Array.isArray(items) ? items : []);
      } catch {
        toast.error("Failed to load menu items");
      } finally {
        setMenuLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredMenuItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((m: any) =>
      String(m?.name || "").toLowerCase().includes(q),
    );
  }, [menuItems, search]);

  const addToPending = (menuItem: any) => {
    setPendingItems((prev) => {
      const idx = prev.findIndex((it) => it.menu_item_id === menuItem.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + 1,
          subtotal: (next[idx].quantity + 1) * next[idx].unit_price,
        };
        return next;
      }
      const price = parseFloat(menuItem.price || menuItem.unit_price || 0) || 0;
      const mainCategory = menuItem.main_category || "restaurant";
      return [
        ...prev,
        {
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          main_category: mainCategory,
          item_type: mainCategory,
          quantity: 1,
          unit_price: price,
          subtotal: price,
        },
      ];
    });
  };

  const changeQuantity = (index: number, delta: number) => {
    setPendingItems((prev) => {
      const next = [...prev];
      const item = next[index];
      const quantity = Math.max(1, item.quantity + delta);
      next[index] = { ...item, quantity, subtotal: quantity * item.unit_price };
      return next;
    });
  };

  const removeItem = (index: number) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  };

  const pendingTotal = pendingItems.reduce(
    (sum, it) => sum + (it.subtotal || 0),
    0,
  );

  const save = async () => {
    if (!order?.id || pendingItems.length === 0 || saving) return;
    setSaving(true);
    try {
      await cashierServices.orders.addItems(order.id, {
        items: pendingItems,
        updated_by: currentUserId,
      });
      toast.success("Items added to order");
      setPendingItems([]);
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      const message =
        err?.response?.status === 403
          ? "Only the staff member who created this order can add items to it."
          : err?.message || "Failed to add items. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Items — Order {formatOrderNumber(order)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-1.5">
            {menuLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading menu...
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No items found
              </p>
            ) : (
              filteredMenuItems.map((m: any) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addToPending(m)}
                  className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-muted/60 text-left"
                >
                  <span>{m.name}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(m.price)}
                  </span>
                </button>
              ))
            )}
          </div>

          {pendingItems.length > 0 && (
            <div className="space-y-1.5 border-t pt-2">
              {pendingItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="flex-1 truncate">{item.menu_item_name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => changeQuantity(idx, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => changeQuantity(idx, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs font-semibold pt-1">
                <span>Total to add</span>
                <Badge variant="secondary">{formatCurrency(pendingTotal)}</Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || pendingItems.length === 0}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddItemsToOrderDialog;
