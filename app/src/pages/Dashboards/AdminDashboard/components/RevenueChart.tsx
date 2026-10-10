import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatETB } from '@/lib/format';
import type { PaymentRow } from '@/types/display.types';

interface RevenueChartProps {
  /** Paid payments already filtered to the dashboard's range and unit. */
  payments: PaymentRow[];
  getPaymentAmount: (payment: PaymentRow) => number;
  /** Hourly buckets for a single day, daily buckets otherwise. */
  byHour: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Hand-built bar chart of paid revenue over the selected range. */
export const RevenueChart: React.FC<RevenueChartProps> = ({ payments, getPaymentAmount, byHour }) => {
  const { buckets, total } = useMemo(() => {
    const map = new Map<string, number>();
    let sum = 0;
    for (const p of payments) {
      const d = new Date(p?.created_at ?? '');
      if (Number.isNaN(d.getTime())) continue;
      const amount = Number(getPaymentAmount(p)) || 0;
      sum += amount;
      const key = byHour ? String(d.getHours()) : dayKey(d);
      map.set(key, (map.get(key) || 0) + amount);
    }

    let list: Array<{ key: string; label: string; value: number }>;
    if (byHour) {
      const hours = Array.from(map.keys()).map(Number);
      const from = Math.min(7, ...hours);
      const to = Math.max(21, ...hours);
      list = [];
      for (let h = from; h <= to; h++) {
        list.push({ key: String(h), label: `${pad(h)}:00`, value: map.get(String(h)) || 0 });
      }
    } else {
      list = Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([key, value]) => {
          const d = new Date(`${key}T00:00:00`);
          return { key, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value };
        });
    }
    return { buckets: list, total: sum };
  }, [payments, getPaymentAmount, byHour]);

  const max = Math.max(1, ...buckets.map((b) => b.value));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>{byHour ? 'Paid, by hour' : 'Paid, by day'}</CardDescription>
        </div>
        <p className="text-kpi text-foreground">{formatETB(total)}</p>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 || total === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No payments in this range yet.</p>
        ) : (
          <div
            role="img"
            aria-label={`Revenue ${byHour ? 'by hour' : 'by day'}: ${buckets
              .filter((b) => b.value > 0)
              .map((b) => `${b.label} ${formatETB(b.value)}`)
              .join(', ')}`}
          >
            <p className="mb-2 text-[12px] text-muted-foreground">{formatETB(max)}</p>
            <div className="flex h-48 items-end gap-1 border-b border-border">
              {buckets.map((b) => (
                <div key={b.key} className="group relative flex h-full flex-1 items-end" title={`${b.label} · ${formatETB(b.value)}`}>
                  <div
                    className="w-full rounded-t-[3px] bg-chart-1 transition-opacity group-hover:opacity-80"
                    style={{ height: `${b.value > 0 ? Math.max(2, (b.value / max) * 100) : 0}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              {buckets.map((b, i) => (
                <span key={b.key} className="flex-1 truncate text-center text-[12px] text-muted-foreground">
                  {i % labelEvery === 0 ? b.label : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
