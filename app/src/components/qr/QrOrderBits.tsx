import { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Printer, QrCode, ReceiptText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api as httpApi } from '@/infrastructure/api/http-client';
import { orderSocket } from '@/infrastructure/realtime/order-socket';
import { playChime } from '@/shared/utils/chime';

interface QrOrderLike {
  source?: unknown;
  table_number?: unknown;
  meta?: unknown;
  is_printed?: unknown;
}

/** "QR · Table 7", guest name and waiting/not-printed badges for a QR order. */
export function QrOrderBadges({ order }: { order: QrOrderLike }) {
  if (order?.source !== 'qr') return null;
  const meta = (order.meta ?? {}) as { customer_name?: unknown; awaiting_accept?: unknown; is_printed?: unknown };
  const printedHere = Number(order.is_printed) === 1 || Number(meta.is_printed) === 1;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge variant="info">
        <QrCode aria-hidden />
        QR{order.table_number != null ? ` · Table ${String(order.table_number)}` : ''}
      </Badge>
      {typeof meta.customer_name === 'string' && meta.customer_name ? (
        <Badge variant="secondary">{meta.customer_name}</Badge>
      ) : null}
      {meta.awaiting_accept === true ? (
        <Badge variant="warning">Waiting for a cashier to accept</Badge>
      ) : !printedHere ? (
        <Badge variant="warning">
          <Printer aria-hidden />
          Not printed yet
        </Badge>
      ) : null}
    </span>
  );
}

interface AssistRequest {
  id: string;
  type: 'call_waiter' | 'request_bill';
  table_number: number;
  table_label: string | null;
  order_numbers: number[];
  created_at: string;
}

/**
 * Guest "Call waiter" / "Ask for the bill" requests from QR tables, live from
 * the order socket (loaded once on open so nothing raised earlier is missed).
 * "On it" clears the request on every screen.
 */
export function QrAssistAlerts() {
  const [requests, setRequests] = useState<AssistRequest[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await httpApi.get('/orders/assist-requests');
      const list = (res?.data?.data?.requests ?? []) as AssistRequest[];
      setRequests(list);
    } catch {
      // offline — live events still arrive when the socket reconnects
    }
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    const off = orderSocket.subscribeQrEvents((event) => {
      if (event.type === 'assist_request' && event.payload?.request) {
        const r = event.payload.request as AssistRequest;
        setRequests((prev) => [...prev.filter((x) => !(x.table_number === r.table_number && x.type === r.type)), r]);
        playChime();
        toast(`Table ${r.table_number} ${r.type === 'request_bill' ? 'is asking for the bill' : 'is calling a waiter'}`, {
          duration: 5000,
        });
      } else if (event.type === 'assist_dismissed') {
        setRequests((prev) => prev.filter((x) => x.id !== event.payload?.id));
      }
    });
    return () => {
      window.clearTimeout(kick);
      off();
    };
  }, [load]);

  const dismiss = async (id: string) => {
    setRequests((prev) => prev.filter((x) => x.id !== id));
    try {
      await httpApi.post(`/orders/assist-requests/${encodeURIComponent(id)}/dismiss`);
    } catch {
      // it expires on its own; nothing else to do
    }
  };

  if (requests.length === 0) return null;
  return (
    <section aria-label="Guest requests" className="space-y-2">
      {requests.map((r) => {
        const bill = r.type === 'request_bill';
        const Icon = bill ? ReceiptText : BellRing;
        return (
          <div
            key={r.id}
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-warning"
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                Table {r.table_number}
                {r.table_label ? ` (${r.table_label})` : ''}
              </span>{' '}
              {bill ? 'is asking for the bill' : 'is calling a waiter'}
              {r.order_numbers.length ? ` · order ${r.order_numbers.map((n) => `#${n}`).join(', ')}` : ''}
            </p>
            <Button size="sm" variant="outline" onClick={() => void dismiss(r.id)}>
              <Check /> On it
            </Button>
          </div>
        );
      })}
    </section>
  );
}
