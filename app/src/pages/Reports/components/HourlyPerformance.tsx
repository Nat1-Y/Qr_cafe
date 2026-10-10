import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HourlyPerformanceItem } from '../types';
import { formatETB } from '@/lib/format';

interface HourlyPerformanceProps {
  items: HourlyPerformanceItem[];
}

export const HourlyPerformance: React.FC<HourlyPerformanceProps> = ({ items }) => {
  const maxRevenue = Math.max(...items.map((item) => item.revenue), 1);

  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Sales by hour</CardTitle>
        <CardDescription>Your busiest hours</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {items.length > 0 ? items.map((item) => (
            <div key={item.hour} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                <span>{item.hour}</span>
                <span>{formatETB(item.revenue)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-chart-4" style={{ width: `${(item.revenue / maxRevenue) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs text-muted-foreground">{item.orders} orders</span>
              </div>
            </div>
          )) : (
            <p className="text-xs text-muted-foreground font-semibold text-center py-12">
              No sales in these dates.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HourlyPerformance;
