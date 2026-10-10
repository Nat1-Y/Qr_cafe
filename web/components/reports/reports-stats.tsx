"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/segmented";
import { cn } from "@/lib/utils";
import { formatETB } from "@/lib/format";
import {
  PERIOD_LABELS,
  calculatePeriodStats,
  type SourceData,
  type StatsDateRange,
  type StatsPeriod,
} from "@/lib/reports";

const PERIODS: StatsPeriod[] = ["today", "month", "year"];

// Parse a `YYYY-MM-DD` value (from the date picker) into a local day boundary.
const parseLocalDateOnly = (ymd: string) => {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
};
const startLocal = (ymd: string) => {
  const p = parseLocalDateOnly(ymd);
  return p ? new Date(p.y, p.mo - 1, p.d, 0, 0, 0, 0) : null;
};
const endLocal = (ymd: string) => {
  const p = parseLocalDateOnly(ymd);
  return p ? new Date(p.y, p.mo - 1, p.d, 23, 59, 59, 999) : null;
};
const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function ReportsStats({
  source,
  unit,
  dateFrom = "",
  dateTo = "",
}: {
  source: SourceData;
  unit: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [period, setPeriod] = useState<StatsPeriod>("today");

  const range = useMemo<StatsDateRange | null>(() => {
    if (!dateFrom && !dateTo) return null;
    return { from: dateFrom ? startLocal(dateFrom) : null, to: dateTo ? endLocal(dateTo) : null };
  }, [dateFrom, dateTo]);

  const hasRange = range !== null;

  const stats = useMemo(
    () => calculatePeriodStats(source.orders, source.payments, source.menuItems, unit, period, range),
    [source, unit, period, range],
  );

  const rangeLabel = useMemo(() => {
    if (!range) return "";
    const from = range.from ? shortDate(range.from) : null;
    const to = range.to ? shortDate(range.to) : null;
    if (from && to) return `${from} – ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Through ${to}`;
    return "";
  }, [range]);

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Performance</p>
            <h3 className="text-section font-semibold text-foreground">
              {hasRange ? "Selected range" : PERIOD_LABELS[period]}
            </h3>
          </div>
          {hasRange ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-meta font-medium text-muted-foreground">
              <CalendarRange className="size-3.5" />
              {rangeLabel}
            </div>
          ) : (
            <Segmented
              aria-label="Period"
              value={period}
              onChange={setPeriod}
              options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Orders" value={stats.totalOrders} subtitle={`${stats.pendingOrders} pending`} />
          <Metric
            label="Paid revenue"
            value={formatETB(stats.paidRevenue || 0)}
            subtitle="Paid orders only"
            accent="success"
          />
          <Metric label="Paid orders" value={stats.paidOrders} subtitle={`${stats.voidedOrders} voided`} />
          <Metric label="Avg paid order" value={formatETB(stats.avgPaidOrderValue || 0)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  accent?: "success";
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-kpi leading-tight break-words text-foreground",
          accent === "success" && "text-accent",
        )}>
        {value}
      </p>
      {subtitle && <p className="truncate text-meta text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
