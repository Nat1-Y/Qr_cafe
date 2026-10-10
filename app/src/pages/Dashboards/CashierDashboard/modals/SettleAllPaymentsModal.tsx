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
import { RefreshCw } from 'lucide-react';
import api from '@/application';
import toast from 'react-hot-toast';
import { humanize } from '@/lib/format';

interface PaymentMethodOption {
  id: number;
  name: string;
  display_name: string;
  icon?: string;
  is_active: boolean;
}

interface SettleAllPaymentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  total: number;
  employeeName?: string;
  isProcessing: boolean;
  progress: { done: number; total: number } | null;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  onConfirm: () => void;
  formatCurrency: (val: any) => string;
}

const SettleAllPaymentsModal: React.FC<SettleAllPaymentsModalProps> = ({
  open,
  onOpenChange,
  count,
  total,
  employeeName,
  isProcessing,
  progress,
  paymentMethod,
  setPaymentMethod,
  onConfirm,
  formatCurrency
}) => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);

  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        setLoadingMethods(true);
        const resp = await api.settings.getPaymentMethods();
        const list = (resp as any)?.data?.data?.payment_methods ?? (resp as any)?.data?.payment_methods ?? [];
        const active = (list || []).filter((m: any) => m.is_active);
        setPaymentMethods(active);

        if (active.length > 0 && !active.some((m: any) => m.name === paymentMethod)) {
          setPaymentMethod(active[0].name);
        } else if (active.length === 0) {
          toast.error('No payment types are set up. Ask your manager.');
        }
      } catch {
        toast.error("Couldn't load payment types. Please try again.");
      } finally {
        setLoadingMethods(false);
      }
    })();
  }, [open, paymentMethod, setPaymentMethod]);

  const selectedMethodLabel =
    paymentMethods.find((method) => method.name === paymentMethod)?.display_name ||
    humanize(paymentMethod);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isProcessing) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="eyebrow">Charge all</p>
          <DialogTitle className="text-[22px] leading-tight">{employeeName || 'Every order shown'}</DialogTitle>
          <DialogDescription>
            {count} {count === 1 ? 'order' : 'orders'} will be marked paid. You can&apos;t undo this.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-baseline justify-between border-b border-dashed border-border pb-4">
            <span className="text-base font-semibold text-foreground">Total</span>
            <span className="text-kpi text-foreground">{formatCurrency(total)}</span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Paid with</p>
            {loadingMethods ? (
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 w-24 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
            ) : paymentMethods.length === 0 ? (
              <p className="text-meta text-muted-foreground">No payment types are set up yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paid with">
                {paymentMethods.map((method) => {
                  const selected = method.name === paymentMethod;
                  return (
                    <Button
                      key={method.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      variant={selected ? 'selected' : 'outline'}
                      disabled={isProcessing}
                      onClick={() => setPaymentMethod(method.name)}
                    >
                      {method.display_name}
                    </Button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-meta text-muted-foreground">
              Each order is saved as paid with {selectedMethodLabel}.
            </p>
          </div>

          {progress ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Paying {progress.done} of {progress.total}…
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isProcessing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={isProcessing || count === 0}
            onClick={onConfirm}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="animate-spin" />
                Paying…
              </>
            ) : (
              `Charge ${count} ${count === 1 ? 'order' : 'orders'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettleAllPaymentsModal;
