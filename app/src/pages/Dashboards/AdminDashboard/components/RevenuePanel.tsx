import { uuidToDisplayId } from "@/lib/utils";
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../utils';
import { formatETB } from '@/lib/format';

interface RevenuePanelProps {
  payments: any[];
  getPaymentAmount: (payment: any) => number;
}

export const RevenuePanel: React.FC<RevenuePanelProps> = ({
  payments,
  getPaymentAmount
}) => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <div>
          <CardTitle>Revenue & settlement ledger</CardTitle>
          <CardDescription>
            Payout timeline logs across all gateway accounts
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate('/dashboard/payments')}
        >
          Full audit
        </Button>
      </CardHeader>
      <CardContent className="pt-6 overflow-x-auto">
        <div className="min-w-[600px] space-y-2">
          <div className="grid grid-cols-5 text-xs font-semibold text-muted-foreground pb-2 border-b">
            <div>Ref ID</div>
            <div>Order #</div>
            <div>Settled amount</div>
            <div>Gateway channel</div>
            <div className="text-right">Settlement timeline</div>
          </div>

          {payments.length > 0 ? (
            payments.map((payment: any) => (
              <div
                key={payment.id}
                className="grid grid-cols-5 text-xs font-semibold text-foreground py-3.5 border-b hover:bg-muted/10 transition-colors rounded-xl px-1 items-center"
              >
                <div className="text-muted-foreground font-semibold">
                  P-{uuidToDisplayId(payment.id)}
                </div>
                <div className="text-foreground">#{payment.order_id}</div>
                <div>
                  <span className="font-semibold text-success bg-success/10 px-2 py-0.5 rounded-md border border-success/30">
                    {formatETB(getPaymentAmount(payment))}
                  </span>
                </div>
                <div>
                  <Badge variant="secondary">
                    {payment.payment_method?.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <Badge variant="success">
                    {payment.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {formatDate(payment.created_at)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground font-semibold border border-dashed rounded-xl bg-muted/20">
              No recent transactions settled in this range
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
