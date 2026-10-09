import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, formatOrderNumber } from '@/lib/utils';
import api from '@/application';
import toast from 'react-hot-toast';

interface PaymentMethodOption {
  id: number;
  name: string;
  display_name: string;
  icon?: string;
  is_active: boolean;
}

interface ChargeOrderProps {
  confirmProcessPaymentOrder: any;
  isBlockingPaymentUi: boolean;
  isProcessing: boolean;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  onConfirm: () => void;
  formatCurrency: (val: any) => string;
  /** When given, the order's line items are listed receipt-style. */
  getOrderUnitBreakdown?: (order: any, unit: string | null) => any;
  getItemSubtotalBirr?: (item: any) => number;
}

interface ConfirmCashPaymentModalProps extends ChargeOrderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Loads the active payment methods whenever the charge UI is showing, and
// falls back to the first active one if the current choice isn't available.
function usePaymentMethods(
  active: boolean,
  paymentMethod: string,
  setPaymentMethod: (method: string) => void,
) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);

  useEffect(() => {
    if (!active) return;

    (async () => {
      try {
        setLoadingMethods(true);
        const resp = await api.settings.getPaymentMethods();
        const list = (resp as any)?.data?.data?.payment_methods ?? (resp as any)?.data?.payment_methods ?? [];
        const activeList = (list || []).filter((m: any) => m.is_active);
        setPaymentMethods(activeList);

        if (activeList.length > 0 && !activeList.some((m: any) => m.name === paymentMethod)) {
          setPaymentMethod(activeList[0].name);
        } else if (activeList.length === 0) {
          toast.error('No active payment methods. Please contact an administrator.');
        }
      } catch {
        toast.error('Failed to load payment methods');
      } finally {
        setLoadingMethods(false);
      }
    })();
  }, [active, paymentMethod, setPaymentMethod]);

  return { paymentMethods, loadingMethods };
}

const orderTitle = (order: any) => {
  if (!order) return '';
  const where = order.table_number
    ? `Table ${order.table_number}`
    : order.type === 'bakery'
      ? 'Bakery'
      : 'Takeaway';
  return `${formatOrderNumber(order)} · ${where}`;
};

/** Receipt-style body: line items, dashed rule, totals, payment pills. */
const ChargeOrderBody: React.FC<
  ChargeOrderProps & { paymentMethods: PaymentMethodOption[]; loadingMethods: boolean }
> = ({
  confirmProcessPaymentOrder: order,
  isBlockingPaymentUi,
  isProcessing,
  paymentMethod,
  setPaymentMethod,
  formatCurrency,
  getOrderUnitBreakdown,
  getItemSubtotalBirr,
  paymentMethods,
  loadingMethods,
}) => {
  const breakdown = getOrderUnitBreakdown ? getOrderUnitBreakdown(order, null) : null;
  const items: any[] = Array.isArray(breakdown?.items) ? breakdown.items : [];
  const total = parseFloat(order?.total_amount) || 0;
  const itemsSum = getItemSubtotalBirr
    ? items.reduce((sum, it) => sum + (getItemSubtotalBirr(it) || 0), 0)
    : total;
  const showSubtotal = items.length > 0 && Math.abs(itemsSum - total) > 0.01;
  const busy = isBlockingPaymentUi || isProcessing;

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <ul className="space-y-2 text-sm">
          {items.map((it, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 text-body">
                <span className="text-muted-foreground">{parseInt(it.quantity, 10) || 1} ×</span>{' '}
                {it.menu_item_name || it.name || 'Item'}
              </span>
              <span className="shrink-0 text-foreground">
                {formatCurrency(getItemSubtotalBirr ? getItemSubtotalBirr(it) : 0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 border-t border-dashed border-border pt-4">
        {showSubtotal && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(itemsSum)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold text-foreground">Total</span>
          <span className="text-kpi text-foreground">{formatCurrency(total)}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Paid with</p>
        {loadingMethods && paymentMethods.length === 0 ? (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 w-24 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        ) : paymentMethods.length === 0 ? (
          <p className="text-meta text-muted-foreground">No payment methods are set up yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
            {paymentMethods.map((method) => {
              const selected = method.name === paymentMethod;
              return (
                <Button
                  key={method.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  variant={selected ? 'selected' : 'outline'}
                  disabled={busy}
                  onClick={() => setPaymentMethod(method.name)}
                >
                  {method.display_name}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/** Docked "Current order" panel for wide screens. */
export const ChargeOrderPanel: React.FC<ChargeOrderProps & { onCancel: () => void }> = (props) => {
  const { confirmProcessPaymentOrder: order, isBlockingPaymentUi, isProcessing, onConfirm, onCancel, formatCurrency } = props;
  const { paymentMethods, loadingMethods } = usePaymentMethods(!!order, props.paymentMethod, props.setPaymentMethod);
  const busy = isBlockingPaymentUi || isProcessing;

  return (
    <div className="rounded-card border border-border bg-card p-6">
      <p className="eyebrow">Current order</p>
      <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {orderTitle(order)}
      </h2>
      {(order?.waiter_name || order?.employee_name) && (
        <p className="mt-1 text-meta text-muted-foreground">Waiter: {order.waiter_name || order.employee_name}</p>
      )}

      <div className="mt-5">
        <ChargeOrderBody {...props} paymentMethods={paymentMethods} loadingMethods={loadingMethods} />
      </div>

      <div className="mt-6 space-y-2">
        <Button size="charge" className="w-full" disabled={busy || paymentMethods.length === 0} onClick={onConfirm}>
          {busy ? 'Charging…' : `Charge ${formatCurrency(order?.total_amount || 0)}`}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
          Not this one
        </Button>
      </div>
    </div>
  );
};

/** The same charge flow as a dialog, for narrower screens. */
const ConfirmCashPaymentModal: React.FC<ConfirmCashPaymentModalProps> = ({ open, onOpenChange, ...props }) => {
  const { confirmProcessPaymentOrder: order, isBlockingPaymentUi, isProcessing, onConfirm, formatCurrency } = props;
  const { paymentMethods, loadingMethods } = usePaymentMethods(open, props.paymentMethod, props.setPaymentMethod);
  const busy = isBlockingPaymentUi || isProcessing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="eyebrow">Current order</p>
          <DialogTitle className="text-[22px] leading-tight">{orderTitle(order)}</DialogTitle>
          <DialogDescription>Pick how the guest paid, then charge.</DialogDescription>
        </DialogHeader>

        <ChargeOrderBody {...props} paymentMethods={paymentMethods} loadingMethods={loadingMethods} />

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={cn('sm:min-w-40')}
            disabled={busy || paymentMethods.length === 0}
            onClick={onConfirm}
          >
            Charge {formatCurrency(order?.total_amount || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmCashPaymentModal;
