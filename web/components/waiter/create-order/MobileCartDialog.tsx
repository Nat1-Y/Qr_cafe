/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WaiterCartSidebar } from "./WaiterCartSidebar";

interface MobileCartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: any[];
  selectedTable: string;
  selectedDeliveryMethodName?: string | null;
  creatingOrder: boolean;
  onUpdateQuantity: (id: any, change: number) => void;
  onRemoveFromOrder: (id: any) => void;
  onUpdateItemNote?: (id: any, note: string) => void;
  onSubmitOrder: () => Promise<void>;
  calculateTotal: () => string;
  getOrderRoutingInfo: () => any;
  formatCurrency: (val: any) => string;
  forceTableSelection?: boolean;
  notes?: string;
  onNotesChange?: (value: string) => void;
}

export const MobileCartDialog: React.FC<MobileCartDialogProps> = ({
  open,
  onOpenChange,
  orderItems,
  selectedTable,
  selectedDeliveryMethodName,
  creatingOrder,
  onUpdateQuantity,
  onRemoveFromOrder,
  onUpdateItemNote,
  onSubmitOrder,
  calculateTotal,
  getOrderRoutingInfo,
  formatCurrency,
  forceTableSelection = false,
  notes = "",
  onNotesChange,
}) => {
  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Cart bar, stuck to the bottom on phones and tablets */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pt-3 lg:hidden"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="flex h-14 w-full items-center justify-between gap-3 rounded-full bg-primary px-5 text-primary-foreground transition-colors outline-none hover:bg-primary-hover focus-visible:ring-4 focus-visible:ring-ring">
          <span className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="size-5" />
            {totalQuantity > 0
              ? `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · View order`
              : "View order"}
          </span>
          <span className="text-base font-semibold">{formatCurrency(calculateTotal())}</span>
        </button>
      </div>

      {/* Mobile cart */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Current order</DialogTitle>
          <WaiterCartSidebar
            isMobile
            orderItems={orderItems}
            selectedTable={selectedTable}
            selectedDeliveryMethodName={selectedDeliveryMethodName}
            creatingOrder={creatingOrder}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveFromOrder={onRemoveFromOrder}
            onUpdateItemNote={onUpdateItemNote}
            onSubmitOrder={onSubmitOrder}
            calculateTotal={calculateTotal}
            getOrderRoutingInfo={getOrderRoutingInfo}
            formatCurrency={formatCurrency}
            forceTableSelection={forceTableSelection}
            notes={notes}
            onNotesChange={onNotesChange}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MobileCartDialog;
