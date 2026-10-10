import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatETB } from "@/lib/format";
import type { TopItem } from "@/lib/reports";

export function PopularMenuItems({
  topItems,
  topItemsPeriod,
  setTopItemsPeriod,
}: {
  topItems: TopItem[];
  topItemsPeriod: string;
  setTopItemsPeriod: (period: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
        <div>
          <CardTitle>Best sellers</CardTitle>
          <CardDescription>What customers buy most</CardDescription>
        </div>
        <select
          value={topItemsPeriod}
          onChange={(e) => setTopItemsPeriod(e.target.value)}
          className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50">
          <option value="selected_range">Selected range</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="all_time">All time</option>
        </select>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="max-h-[420px] overflow-y-auto pr-1">
          {topItems.length > 0 ? (
            topItems.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-foreground text-xs font-semibold">{item.name}</p>
                    <p className="text-muted-foreground text-xs font-semibold">
                      {formatETB(item.revenue || 0)}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">
                  {item.sold} sold
                </Badge>
              </div>
            ))
          ) : (
            <div className="bg-muted/20 text-muted-foreground rounded-xl border border-dashed p-8 text-center text-xs font-semibold">
              Nothing sold for these filters and dates.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
