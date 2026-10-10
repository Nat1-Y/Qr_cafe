/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { AlertTriangle, Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Item notes combine free text with quick-select preset chips. Presets are
// stored as comma-separated parts inside the same note string, so a chip is
// "active" when its value is already one of those parts.
const splitNoteParts = (note: string | undefined): string[] =>
  String(note || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const noteHasPart = (note: string | undefined, part: string): boolean =>
  splitNoteParts(note).some((p) => p.toLowerCase() === part.toLowerCase());

const togglePart = (note: string | undefined, part: string): string => {
  const parts = splitNoteParts(note);
  const exists = parts.some((p) => p.toLowerCase() === part.toLowerCase());
  const next = exists
    ? parts.filter((p) => p.toLowerCase() !== part.toLowerCase())
    : [...parts, part];
  return next.join(", ");
};

interface WaiterCartSidebarProps {
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
  isMobile?: boolean;
  onClose?: () => void;
}

export const WaiterCartSidebar: React.FC<WaiterCartSidebarProps> = ({
  orderItems,
  selectedTable,
  selectedDeliveryMethodName,
  creatingOrder,
  onUpdateQuantity,
  onRemoveFromOrder,
  onUpdateItemNote,
  onSubmitOrder,
  calculateTotal,
  formatCurrency,
  forceTableSelection = false,
  notes = "",
  onNotesChange,
  isMobile = false,
}) => {
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  // A delivery order or an explicit Take Away both carry no table by design —
  // force_table_selection only blocks placing an order with no choice made
  // at all, same as the backend.
  const tableRequirementUnmet =
    forceTableSelection && !selectedTable && !selectedDeliveryMethodName;

  const tableLabel = selectedDeliveryMethodName
    ? selectedDeliveryMethodName
    : selectedTable === "takeaway"
      ? "Takeaway"
      : selectedTable
        ? `Table ${selectedTable}`
        : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-card",
        !isMobile && "rounded-card border border-border"
      )}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 pb-4 pt-5 pr-12">
        <p className="eyebrow">Current order</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h3 className={cn("truncate text-section", tableLabel ? "text-foreground" : "text-muted-foreground")}>
            {tableLabel ?? "No table yet"}
          </h3>
          <span className="shrink-0 text-meta text-muted-foreground">
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {orderItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-medium text-foreground">Nothing in this order yet</p>
            <p className="mt-1 max-w-[240px] text-sm text-muted-foreground">Tap a menu item to add it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {orderItems.map((item) => (
              <li key={item.menu_item_id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <span className="text-muted-foreground">{item.quantity} ×</span>{" "}
                    <span className="font-medium text-foreground">{item.menu_item_name}</span>
                  </p>
                  <span className="shrink-0 text-sm text-foreground">
                    {formatCurrency(Number(item.price) * Number(item.quantity))}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="inline-flex h-12 items-center rounded-full border border-border bg-card">
                    <button
                      type="button"
                      className="flex size-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => onUpdateQuantity(item.menu_item_id, -1)}
                      aria-label="One less"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                    <button
                      type="button"
                      className="flex size-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => onUpdateQuantity(item.menu_item_id, 1)}
                      aria-label="One more"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-meta text-muted-foreground">{formatCurrency(item.price)} each</span>
                  <button
                    type="button"
                    className="ml-auto flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                    onClick={() => onRemoveFromOrder(item.menu_item_id)}
                    aria-label={`Remove ${item.menu_item_name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {onUpdateItemNote && (
                  <div className="mt-2 space-y-2">
                    {Array.isArray(item.predefined_notes) && item.predefined_notes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.predefined_notes.map((presetNote: string) => {
                          const active = noteHasPart(item.note, presetNote);
                          return (
                            <button
                              key={presetNote}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                onUpdateItemNote(item.menu_item_id, togglePart(item.note, presetNote))
                              }
                              className={cn(
                                "h-10 rounded-full border px-3.5 text-meta transition-colors",
                                active
                                  ? "border-[1.5px] border-primary bg-card font-medium text-primary"
                                  : "border-border bg-card text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {presetNote}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <Input
                      type="text"
                      value={item.note || ""}
                      onChange={(e) => onUpdateItemNote(item.menu_item_id, e.target.value)}
                      maxLength={200}
                      placeholder="Note for the kitchen, e.g. no sugar"
                      className="h-11"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Total + send */}
      {orderItems.length > 0 && (
        <div className="shrink-0 space-y-3 border-t border-dashed border-border px-5 pb-5 pt-4">
          {onNotesChange && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Order note <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="e.g. allergy info, serve together"
                className="min-h-[64px] resize-none text-sm"
              />
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold text-foreground">Total</span>
            <span className="text-kpi text-foreground">{formatCurrency(calculateTotal())}</span>
          </div>

          {tableRequirementUnmet && (
            <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-meta text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Pick a table or Takeaway first.
            </p>
          )}

          <Button
            size="charge"
            disabled={creatingOrder || tableRequirementUnmet}
            className="w-full"
            onClick={onSubmitOrder}
          >
            {creatingOrder ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send to kitchen"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default WaiterCartSidebar;
