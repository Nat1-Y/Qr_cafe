"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatETB, humanize } from "@/lib/format";
import type { RevenueTrendPoint } from "@/lib/reports";

const chartConfig = {
  revenue: { label: "Money in", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

const compact = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function RevenueTrend({ points }: { points: RevenueTrendPoint[] }) {
  const total = points.reduce((sum, p) => sum + p.revenue, 0);

  return (
    <Card>
      <CardHeader className="border-b pb-3">
        <CardTitle>Money in over time</CardTitle>
        <CardDescription>
          Paid sales each day · {formatETB(total)} total
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {points.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickMargin={8}
                minTickGap={16}
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
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{humanize(String(name))}</span>
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {name === "revenue" ? formatETB(Number(value)) : Number(value).toLocaleString()}
                        </span>
                      </div>
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
          <div className="bg-muted/20 text-muted-foreground flex h-64 items-center justify-center rounded-md border border-dashed text-xs font-medium">
            No paid sales for these filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
