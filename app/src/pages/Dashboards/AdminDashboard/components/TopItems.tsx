import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatETB } from '@/lib/format';

interface TopItemsProps {
  /** Orders already filtered to the dashboard's range and unit. */
  orders: any[];
  limit?: number;
}

const lineTotal = (it: any) => {
  const sub = Number(it?.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  const qty = parseInt(it?.quantity, 10) || 0;
  const unit = Number(it?.unit_price ?? it?.price);
  return Number.isFinite(unit) ? unit * qty : 0;
};

/** Best sellers in the range, by quantity. */
export const TopItems: React.FC<TopItemsProps> = ({ orders, limit = 6 }) => {
  const items = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const it of Array.isArray(o?.items) ? o.items : []) {
        const name = String(it?.menu_item_name || it?.name || '').trim();
        if (!name) continue;
        const key = String(it?.menu_item_id ?? name);
        const entry = map.get(key) ?? { name, qty: 0, revenue: 0 };
        entry.qty += parseInt(it?.quantity, 10) || 0;
        entry.revenue += lineTotal(it);
        map.set(key, entry);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }, [orders, limit]);

  const maxQty = Math.max(1, ...items.map((i) => i.qty));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top items</CardTitle>
        <CardDescription>Most sold in this range</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing sold yet.</p>
        ) : (
          <ol className="space-y-3">
            {items.map((it) => (
              <li key={it.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">{it.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatETB(it.revenue)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-2" style={{ width: `${(it.qty / maxQty) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-meta text-muted-foreground">{it.qty} sold</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
