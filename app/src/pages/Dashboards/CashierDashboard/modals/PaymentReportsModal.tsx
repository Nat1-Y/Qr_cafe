import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import StatsCard from '@/components/common/StatsCard';

interface PaymentReportsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayStats: {
    paymentsProcessed: number;
    totalRevenue: number;
    qrPayments: number;
    cashPayments: number;
  };
  formatCurrency: (val: any) => string;
}

const PaymentReportsModal: React.FC<PaymentReportsModalProps> = ({
  open,
  onOpenChange,
  todayStats,
  formatCurrency
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Today&apos;s payments</DialogTitle>
          <DialogDescription>What the till has taken so far.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatsCard title="Payments" value={todayStats.paymentsProcessed} />
            <StatsCard title="Revenue" value={formatCurrency(todayStats.totalRevenue)} variant="success" />
          </div>

          <div className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Cash</span>
              <span className="text-foreground">{todayStats.cashPayments}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">QR code</span>
              <span className="text-foreground">{todayStats.qrPayments}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentReportsModal;
