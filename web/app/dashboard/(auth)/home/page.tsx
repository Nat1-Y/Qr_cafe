"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader } from "@/components/page-header";
import { DateFilterBar } from "@/components/date-filter-bar";
import { Menu, Inventory, Tables, Orders, Payments } from "@/lib/resources";
import { formatETB, shortDate } from "@/lib/format";
import { salesSplit, monthRange, rangeBounds } from "@/lib/profit";

import { StatCards } from "@/components/stat-cards";
import { RevenueTrend } from "@/components/reports/revenue-trend";
import { TopItems } from "@/components/top-items";
import { StatusBadge } from "@/components/status-badge";
import { formatOrderNumber } from "@/lib/utils";
const withinRange = (value: any, fromDt: Date | null, toDt: Date | null) => {
  if (!fromDt && !toDt) return true;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  if (fromDt && dt < fromDt) return false;
  if (toDt && dt > toDt) return false;
  return true;
};

export default function HomePage() {
  const [stats, setStats] = useState({ menu: 0, inventory: 0, tables: 0, orders: 0 });
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => monthRange().from);
  const [dateTo, setDateTo] = useState(() => monthRange().to);

  useEffect(() => {
    Promise.all([
      Menu.items().catch(() => []),
      Inventory.list().catch(() => []),
      Tables.list().catch(() => []),
      // Organization orders settle on their own credit ledger, not as cash
      // sales — never count them toward the dashboard's totals/recent list.
      Orders.list({ exclude_organization: "1" }).catch(() => []),
      Payments.history().catch(() => []),
    ])
      .then(([menu, inv, tables, ords, pays]) => {
        setStats({
          menu: menu.length,
          inventory: inv.length,
          tables: tables.length,
          orders: ords.length,
        });
        setOrders(Array.isArray(ords) ? ords : []);
        setPayments(Array.isArray(pays) ? pays : []);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { sales, recent } = useMemo(() => {
    const { fromDt, toDt } = rangeBounds(dateFrom, dateTo);
    const inRange = orders.filter((o) => withinRange(o?.created_at, fromDt, toDt));
    return {
      sales: salesSplit(orders, payments, fromDt, toDt),
      recent: inRange.slice(0, 8),
    };
  }, [orders, payments, dateFrom, dateTo]);

  // Paid revenue per day in range, for the trend chart (display only).
  const trend = useMemo(() => {
    const { fromDt, toDt } = rangeBounds(dateFrom, dateTo);
    const byDay = new Map<string, { revenue: number; orders: number }>();
    for (const p of payments) {
      const status = String(p?.status || "").toLowerCase();
      if (status && status !== "paid" && status !== "completed") continue;
      const when = p?.paid_at || p?.created_at;
      if (!withinRange(when, fromDt, toDt)) continue;
      const d = new Date(when);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const entry = byDay.get(key) ?? { revenue: 0, orders: 0 };
      entry.revenue += Number(p?.amount) || 0;
      entry.orders += 1;
      byDay.set(key, entry);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        label: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        revenue: v.revenue,
        orders: v.orders,
      }));
  }, [payments, dateFrom, dateTo]);

  const inRange = useMemo(() => {
    const { fromDt, toDt } = rangeBounds(dateFrom, dateTo);
    return orders.filter((o) => withinRange(o?.created_at, fromDt, toDt));
  }, [orders, dateFrom, dateTo]);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          loading
            ? today
            : `${today} · ${stats.menu} menu items · ${stats.tables} tables · ${stats.inventory} stock items`
        }
      />

      <DateFilterBar
        defaultPreset="month"
        allLabel="All time"
        viewingPrefix="Showing"
        onChange={(range) => {
          setDateFrom(range.from ?? "");
          setDateTo(range.to ?? "");
        }}
      />

      <StatCards
        loading={loading}
        cards={[
          { label: "Revenue", value: formatETB(sales.paid), hint: "Collected", valueClass: "text-accent" },
          { label: "Not paid yet", value: formatETB(sales.unpaid), hint: "Outstanding", valueClass: "text-warning" },
          { label: "Total sales", value: formatETB(sales.total), hint: "Paid and unpaid" },
          { label: "Orders", value: inRange.length, hint: `${stats.orders} all time` },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrend points={trend} />
        </div>
        <TopItems orders={inRange} />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section text-foreground">Recent orders</h2>
          <p className="text-meta text-muted-foreground">Newest first, in this range.</p>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">No orders in this range.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((o) => {
              const summary = (Array.isArray(o?.items) ? o.items : [])
                .map((it: any) => `${parseInt(it?.quantity, 10) || 1} × ${it?.menu_item_name || it?.name || "Item"}`)
                .join(", ");
              return (
                <li key={o.id} className="flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-row-hover">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {formatOrderNumber(o)}
                      {o.table_number ? ` · Table ${o.table_number}` : ""}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {summary || <span className="capitalize">{o.type ?? "Order"}</span>}
                    </p>
                    <p className="text-meta text-muted-foreground">{shortDate(o.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold text-foreground">{formatETB(o.total_amount)}</span>
                    <StatusBadge kind="order" status={String(o?.payment_status).toLowerCase() === "paid" ? "paid" : o.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
