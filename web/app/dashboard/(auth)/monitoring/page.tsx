"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  BanknoteIcon,
  ReceiptTextIcon,
  StoreIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DateFilterBar } from "@/components/date-filter-bar";
import { apiFetch } from "@/lib/api";
import { formatETB } from "@/lib/format";

type BusinessRow = { id: string; name: string };
type BranchOption = { id: string; name: string };
type SeriesPoint = { date: string; orders: number; revenue: number };
type BranchStat = {
  branch_id: string | null;
  branch_name: string;
  business_name: string;
  orders: number;
  revenue: number;
};
type StatusStat = { status: string; orders: number };

type Analytics = {
  range: { from: string; to: string };
  scope: { business_id: string | null; branch_id: string | null };
  summary: {
    orders: number;
    revenue: number;
    avg_order_value: number;
    branches_active: number;
    businesses_active: number;
  };
  series: SeriesPoint[];
  by_branch: BranchStat[];
  by_status: StatusStat[];
  branches: BranchOption[];
};

const compact = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

// Short axis label from a YYYY-MM-DD key, e.g. "Jul 1".
const dayLabel = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const STATUS_COLORS: Record<string, string> = {
  done: "var(--chart-1)",
  paid: "var(--chart-2)",
  pending: "var(--chart-3)",
  cancelled: "var(--chart-4)",
};
const statusColor = (status: string) =>
  STATUS_COLORS[status] ?? "var(--chart-5)";

const chartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export default function MonitoringPage() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [branchId, setBranchId] = useState("");
  // Seeded to match DateFilterBar's "month" preset (rolling 30 days) so the
  // first fetch already has real bounds instead of firing once unbounded.
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: iso(from), to: iso(today) };
  });
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Business list drives the top selector.
  useEffect(() => {
    apiFetch<BusinessRow[]>("/platform/businesses")
      .then((rows) =>
        setBusinesses(rows.map((b) => ({ id: b.id, name: b.name }))),
      )
      .catch((e) => toast.error(e.message));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (businessId) qs.set("business_id", businessId);
    if (branchId) qs.set("branch_id", branchId);
    return apiFetch<Analytics>(`/platform/analytics?${qs.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [businessId, branchId, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  // Selecting a business resets the branch scope; branch options come back with
  // the analytics payload for the chosen business.
  function onBusinessChange(value: string) {
    setBusinessId(value);
    setBranchId("");
  }

  const branchOptions = data?.branches ?? [];
  const series = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, label: dayLabel(p.date) })),
    [data],
  );
  const totalStatus = (data?.by_status ?? []).reduce(
    (s, r) => s + r.orders,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
        <p className="text-muted-foreground text-sm">
          Filter revenue and order activity across every business and branch.
        </p>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Business
              </label>
              <select
                className={selectClass}
                value={businessId}
                onChange={(e) => onBusinessChange(e.target.value)}>
                <option value="">All businesses</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Branch
              </label>
              <select
                className={`${selectClass} disabled:opacity-50`}
                disabled={!businessId}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}>
                <option value="">
                  {businessId ? "All branches" : "Select a business first"}
                </option>
                {branchOptions.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Date range
            </label>
            <DateFilterBar
              presets={["today", "week", "month", "custom"]}
              defaultPreset="month"
              viewingPrefix="Viewing:"
              onChange={(r) => setRange({ from: r.from ?? "", to: r.to ?? "" })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Headline stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          icon={BanknoteIcon}
          loading={loading}
          value={data ? formatETB(data.summary.revenue) : "—"}
        />
        <StatCard
          label="Orders"
          icon={ReceiptTextIcon}
          loading={loading}
          value={data ? data.summary.orders.toLocaleString() : "—"}
        />
        <StatCard
          label="Avg order value"
          icon={TrendingUpIcon}
          loading={loading}
          value={data ? formatETB(data.summary.avg_order_value) : "—"}
        />
        <StatCard
          label="Active branches"
          icon={StoreIcon}
          loading={loading}
          value={data ? String(data.summary.branches_active) : "—"}
          sub={
            data && !businessId
              ? `${data.summary.businesses_active} businesses`
              : undefined
          }
        />
      </div>

      {/* Time series */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle>Revenue over time</CardTitle>
            <CardDescription>Daily non-cancelled sales</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : series.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-64 w-full">
                <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tickMargin={8}
                    minTickGap={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    width={44}
                    tickMargin={4}
                    tickFormatter={(v) => compact(Number(v))}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            {formatETB(Number(value))}
                          </span>
                        )}
                      />
                    }
                  />
                  <Area
                    dataKey="revenue"
                    type="monotone"
                    fill="var(--color-revenue)"
                fillOpacity={0.12}
                    stroke="var(--color-revenue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle>Orders per day</CardTitle>
            <CardDescription>Order count in the selected window</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : series.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-64 w-full">
                <BarChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tickMargin={8}
                    minTickGap={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    width={32}
                    tickMargin={4}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <Bar
                    dataKey="orders"
                    fill="var(--color-orders)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Branch breakdown + status split */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle>Revenue by branch</CardTitle>
            <CardDescription>Top branches in range</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (data?.by_branch.length ?? 0) > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-64 w-full">
                <BarChart
                  layout="vertical"
                  data={data!.by_branch.slice(0, 8)}
                  margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tickFormatter={(v) => compact(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="branch_name"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    width={110}
                    tickMargin={4}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            {formatETB(Number(value))}
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--color-revenue)"
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle>Order status</CardTitle>
            <CardDescription>All orders in range</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : totalStatus > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <ChartContainer
                  config={chartConfig}
                  className="aspect-square h-52">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={data!.by_status}
                      dataKey="orders"
                      nameKey="status"
                      innerRadius={52}
                      strokeWidth={2}>
                      {data!.by_status.map((s) => (
                        <Cell key={s.status} fill={statusColor(s.status)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 space-y-2">
                  {data!.by_status.map((s) => (
                    <div
                      key={s.status}
                      className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: statusColor(s.status) }}
                        />
                        <span className="capitalize">{s.status}</span>
                      </span>
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {s.orders.toLocaleString()} ·{" "}
                        {Math.round((s.orders / totalStatus) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-branch table */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle>Branch breakdown</CardTitle>
          <CardDescription>
            Revenue and orders per branch in the selected window
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <Skeleton className="my-6 h-40 w-full" />
          ) : (data?.by_branch.length ?? 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-4 font-medium">Branch</th>
                    <th className="py-2 pr-4 font-medium">Business</th>
                    <th className="py-2 pr-4 text-right font-medium">Orders</th>
                    <th className="py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.by_branch.map((b) => (
                    <tr
                      key={`${b.business_name}-${b.branch_id}`}
                      className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{b.branch_name}</td>
                      <td className="text-muted-foreground py-2 pr-4">
                        {b.business_name}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">
                        {b.orders.toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatETB(b.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted-foreground py-10 text-center text-sm">
              No orders found for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof StoreIcon;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-semibold">{value}</div>
            {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="bg-muted/20 text-muted-foreground flex h-64 items-center justify-center rounded-md border border-dashed text-xs font-medium">
      No data for the selected filters.
    </div>
  );
}
