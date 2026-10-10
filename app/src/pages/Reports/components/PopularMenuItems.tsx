import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TopItem } from '../types';
import { formatETB } from '@/lib/format';

interface PopularMenuItemsProps {
  topItems: TopItem[];
  topItemsPeriod: string;
  setTopItemsPeriod: (period: string) => void;
}

export const PopularMenuItems: React.FC<PopularMenuItemsProps> = ({
  topItems,
  topItemsPeriod,
  setTopItemsPeriod
}) => {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <div>
          <CardTitle>Best sellers</CardTitle>
          <CardDescription>What customers buy most</CardDescription>
        </div>
        <Select value={topItemsPeriod} onValueChange={setTopItemsPeriod}>
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="selected_range">Selected range</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="all_time">All time</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {topItems.length > 0 ? (
            topItems.map((item, index) => (
              <div 
                key={item.name} 
                className="flex items-center justify-between border-b border-border py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-xs text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-semibold">
                      {formatETB((item.revenue || 0))}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">
                    {item.sold} sold
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground font-semibold border border-dashed rounded-xl bg-muted/20">
              Nothing sold for these filters and dates.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PopularMenuItems;
