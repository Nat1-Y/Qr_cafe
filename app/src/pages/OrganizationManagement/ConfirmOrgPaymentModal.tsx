import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatETB } from '@/lib/format';


interface ConfirmOrgPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  isProcessing: boolean;
  onConfirm: () => void;
}

// Deliberately not the shared ConfirmCashPaymentModal used for regular
// cash-drawer payments: an organization order never carries a payment method
// or touches the shared `payments` table. It also never touches the
// organization's credit balance until THIS confirmation — a cashier
// attaching an order only records who it's for; the deduction posts here
// (see backend order.service.ts's confirmOrganizationOrderPayment).
const ConfirmOrgPaymentModal: React.FC<ConfirmOrgPaymentModalProps> = ({
  open,
  onOpenChange,
  order,
  isProcessing,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm organization order</DialogTitle>
          <DialogDescription>
            Posts this order as a charge against the organization's credit
            balance. It's never collected as cash and doesn't affect today's
            revenue.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 p-4 rounded-xl space-y-1.5">
          <div className="font-semibold text-sm">Order #{order?.id}</div>
          <p className="text-xs text-muted-foreground font-semibold">
            {order?.__orgName ? `${order.__orgName} • ` : ''}
            {order?.type === 'cafe' ? 'Café' : 'Bakery'} Order
          </p>
          {order?.meta?.org_customer_name && (
            <p className="text-xs text-muted-foreground">
              For: {order.meta.org_customer_name}
            </p>
          )}
          {order?.meta?.org_customer_phone && (
            <p className="text-xs text-muted-foreground">
              Phone: {order.meta.org_customer_phone}
            </p>
          )}
          {order?.meta?.org_customer_notes && (
            <p className="text-xs text-muted-foreground italic">
              {order.meta.org_customer_notes}
            </p>
          )}
          <p className="text-base font-semibold text-success pt-1">
            {formatETB(order?.total_amount || 0)}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isProcessing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={isProcessing} onClick={onConfirm}>
            {isProcessing ? 'Confirming...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmOrgPaymentModal;
