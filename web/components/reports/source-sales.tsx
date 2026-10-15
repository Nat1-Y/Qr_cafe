"use client";

import { QrCodeIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatETB } from "@/lib/format";
import type { SourceSales } from "@/lib/reports";

const BAR: Record<SourceSales["key"], string> = {
  qr: "bg-chart-1",
  waiter: "bg-chart-2",
  cashier: "bg-chart-4",
};

/** Paid sales split by where the order was placed — QR guests vs staff. */
export function SourceSalesCard({ rows }: { rows: SourceSales[] }) {
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <QrCodeIcon className="size-4 text-muted-foreground" aria-hidden /> Where orders came from
          </h3>
          <p className="text-sm text-muted-foreground">Paid sales by who placed the order.</p>
        </div>
        <ul className="space-y-4">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.revenue / total) * 100) : 0;
            return (
              <li key={r.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{r.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatETB(r.revenue)} · {r.paidOrders} paid of {r.orders} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className={`h-full rounded-full ${BAR[r.key]}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
