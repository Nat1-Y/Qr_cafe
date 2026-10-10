import { uuidToDisplayId, formatOrderNumber } from "@/lib/utils";
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecentOrder } from '../types';
import { formatETB } from '@/lib/format';

interface RecentOrdersListProps {
  recentOrders: RecentOrder[];
}

export const RecentOrdersList: React.FC<RecentOrdersListProps> = ({ recentOrders }) => {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Recent orders</CardTitle>
        <CardDescription>Latest order status logs</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {recentOrders.slice(0, 5).map((order) => (
            <div 
              key={order.id} 
              className="flex items-center justify-between border-b border-border py-3 last:border-b-0"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-foreground">
                    Order {formatOrderNumber(order)}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {String(order.type || '').trim().toLowerCase() === 'bakery' ? 'cafe' : order.type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground font-semibold">
                  Waiter: {String(order?.waiter_name || order?.employee_name || '').trim() || (order?.employee_id != null ? `#${order.employee_id}` : '—')}
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className="font-semibold text-xs text-foreground">
                  {formatETB(parseFloat(String(order.total_amount)))}
                </p>
                <Badge 
                  variant={
                    order?.derived_status === 'paid' 
                      ? 'success' 
                      : order?.derived_status === 'voided' 
                      ? 'destructive' 
                      : 'warning'
                  } 
                  className="capitalize"
                >
                  {order.derived_status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentOrdersList;
