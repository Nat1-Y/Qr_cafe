/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatOrderNumber } from "@/lib/utils";
import React from "react";

import { Card } from "@/components/ui/card";

import { formatOrderItemsPreview, normalizeStatus } from "./utils";

import { StatusBadge } from "@/components/status-badge";
import { formatETB } from "@/lib/format";
interface RecentOrdersPanelProps {
  orders: any[];
}

export const RecentOrdersPanel: React.FC<RecentOrdersPanelProps> = ({
  orders,
}) => {
  const filteredRecentOrders = Array.isArray(orders) ? orders : [];

  return (
    <Card className="gap-0 py-0">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-section text-foreground">Recent orders</h2>
        <p className="text-meta text-muted-foreground">Your latest tables in this range.</p>
      </div>
      {filteredRecentOrders.length > 0 ? (
        <ul className="divide-y divide-border">
          {filteredRecentOrders
            .slice()
            .sort(
              (a: any, b: any) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )
            .slice(0, 8)
            .map((order: any) => {
              const st = normalizeStatus(order.status);
              const pst = normalizeStatus(order.payment_status);
              const isCanceled =
                st === "deleted" || st === "cancelled" || st === "canceled";
              const displayStatus = pst === "paid" ? "paid" : st || order.status;
              const where =
                order.order_type_label ||
                (order.table_number ? `Table ${order.table_number}` : "Takeaway");

              return (
                <li
                  key={order.id}
                  className={`flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-row-hover ${
                    isCanceled ? "opacity-60" : ""
                  }`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      {formatOrderNumber(order)} · {where}
                    </p>
                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <p className="truncate text-sm text-muted-foreground">
                        {formatOrderItemsPreview(order.items)}
                      </p>
                    )}
                    <p className="text-meta text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold text-foreground">{formatETB(order.total_amount)}</span>
                    <StatusBadge kind="order" status={isCanceled ? "cancelled" : displayStatus} />
                  </div>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No orders in this range yet.</p>
      )}
    </Card>
  );
};

export default RecentOrdersPanel;
