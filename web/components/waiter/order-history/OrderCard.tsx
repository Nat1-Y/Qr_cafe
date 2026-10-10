/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatOrderNumber } from "@/lib/utils";
import React from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";

interface OrderCardProps {
  order: any;
  itemAdditions?: any[];
  getEffectiveStatus: (order: any) => string;
  getStatusDisplay: (status: string) => any;
  formatDate: (date: any) => string;
  canAddItems: (order: any) => boolean;
  goAddItems: (order: any) => void;
  formatCurrency: (val: any) => string;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  itemAdditions = [],
  getEffectiveStatus,
  getStatusDisplay,
  formatDate,
  canAddItems,
  goAddItems,
  formatCurrency,
}) => {
  const effectiveStatus = getEffectiveStatus(order);
  const statusDisplay = getStatusDisplay(effectiveStatus);
  const StatusIcon = statusDisplay.icon;
  const where =
    order.order_type_label || (order.table_number ? `Table ${order.table_number}` : "Takeaway");

  return (
    <article
      className={`rounded-card border border-border bg-card p-5 ${effectiveStatus === "cancelled" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {formatOrderNumber(order)} · {where}
          </p>
          <p className="text-meta text-muted-foreground">
            {formatDate(order.created_at)}
            {order.type ? <span> · {humanize(order.type)}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-semibold text-foreground">{formatCurrency(order.total_amount)}</span>
          <Badge variant={statusDisplay.variant}>
            {StatusIcon ? <StatusIcon /> : null}
            {statusDisplay.label}
          </Badge>
        </div>
      </div>

      {order.items && order.items.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-dashed border-border pt-3 text-sm">
          {order.items.map((item: any, idx: number) => (
            <li key={idx} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body">
                <span className="text-muted-foreground">{item.quantity} ×</span> {item.menu_item_name}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatCurrency(item.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* "Added later" audit trail — kept apart from the original items. */}
      {itemAdditions.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-meta font-medium text-muted-foreground">Added later</p>
          {itemAdditions.map((addition: any) => (
            <div key={addition.id} className="text-sm">
              <p className="text-meta text-muted-foreground">
                {addition.added_by_name || "Unknown"}
                {addition.added_at ? ` · ${new Date(addition.added_at).toLocaleString()}` : ""}
              </p>
              {(addition.items || []).map((it: any, idx: number) => (
                <p key={idx} className="text-body">
                  + {it.quantity} × {it.menu_item_name || "Item"}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {order.notes && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-meta font-medium text-muted-foreground">Kitchen note</p>
          <p className="mt-0.5 text-sm text-body">{order.notes}</p>
        </div>
      )}

      {/* "Add items" opens the full order screen pre-loaded with this order. */}
      {canAddItems(order) && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" className="h-12" onClick={() => goAddItems(order)}>
            <Plus />
            Add items
          </Button>
        </div>
      )}
    </article>
  );
};

export default OrderCard;
