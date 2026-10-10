import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface PaymentMethodsBreakdownProps {
  paymentMethods: Record<string, number>;
}

export const PaymentMethodsBreakdown: React.FC<PaymentMethodsBreakdownProps> = ({ paymentMethods }) => {
  const maxCount = Math.max(...(Object.values(paymentMethods) as number[]), 1);

  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Payment channel breakdown</CardTitle>
        <CardDescription>Method shares for paid orders</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
          {Object.entries(paymentMethods).length > 0 ? (
            Object.entries(paymentMethods).map(([method, count]) => (
              <div key={method} className="flex items-center justify-between font-semibold">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-chart-3"></div>
                  <span className="text-xs font-semibold text-foreground capitalize truncate max-w-[120px]">
                    {method.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-semibold">
                    {count} transaction{count !== 1 ? 's' : ''}
                  </span>
                  <div className="w-24 bg-muted rounded-full h-2">
                    <div 
                      className="h-2 rounded-full bg-chart-3"
                      style={{ 
                        width: `${(count / maxCount) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground font-semibold text-center py-12">
              No transactions settled in the selected window.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodsBreakdown;
