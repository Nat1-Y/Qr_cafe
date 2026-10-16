"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { BellRingIcon, CheckIcon, PrinterIcon, QrCodeIcon, ReceiptTextIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playChime, qrOrderInfo, useQrStaffFeed, type AssistRequest, type PushedOrder, type StaffAuth } from "@/lib/staff/qr-live";

function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
}

/**
 * Guest requests ("Call waiter", "Ask for the bill") as dismissible alerts,
 * plus a chime + toast for every new QR order. Drop into any staff screen.
 */
export function QrStaffAlerts({
  auth,
  onNewQrOrder,
  forWaiterId,
  className,
}: {
  auth: StaffAuth;
  onNewQrOrder?: () => void;
  /** Waiter app: only this waiter's tables (and tables with no waiter). */
  forWaiterId?: string | null;
  className?: string;
}) {
  const isMine = useCallback(
    (waiterId: string | null | undefined) => !forWaiterId || !waiterId || waiterId === forWaiterId,
    [forWaiterId],
  );
  const handleOrder = useCallback(
    (order: PushedOrder) => {
      if (!isMine(order.waiter_id)) return;
      playChime();
      const where = order.table_number != null ? `Table ${order.table_number}` : "a table";
      const who = order.employee_name ? ` · ${order.employee_name}` : " · no waiter assigned";
      toast.info(`New QR order #${order.order_number ?? ""} from ${where}${who}`, { duration: 6000 });
      onNewQrOrder?.();
    },
    [onNewQrOrder, isMine],
  );
  const alertFor = useCallback((r: AssistRequest) => isMine(r.waiter_id), [isMine]);
  const { requests: allRequests, dismiss } = useQrStaffFeed(auth, handleOrder, alertFor);
  const requests = allRequests.filter((r) => isMine(r.waiter_id));

  if (requests.length === 0) return null;
  return (
    <section aria-label="Guest requests" aria-live="polite" className={cn("space-y-2", className)}>
      {requests.map((r) => {
        const bill = r.type === "request_bill";
        const Icon = bill ? ReceiptTextIcon : BellRingIcon;
        return (
          <div
            key={r.id}
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-warning">
            <Icon className="size-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                Table {r.table_number}
                {r.table_label ? ` (${r.table_label})` : ""}
              </span>
              {r.waiter_name ? ` · ${r.waiter_name}'s table` : ""}{" "}
              {bill ? "is asking for the bill" : "is calling a waiter"}
              {r.order_numbers.length ? ` · order ${r.order_numbers.map((n) => `#${n}`).join(", ")}` : ""}
              <span className="ml-1 opacity-80">· {minutesAgo(r.created_at)}</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => void dismiss(r.id)}>
              <CheckIcon /> On it
            </Button>
          </div>
        );
      })}
    </section>
  );
}

/** "QR · Table 7", guest name, not-printed and waiting-to-accept badges for one order. */
export function QrOrderBadges({
  order,
  onAccept,
}: {
  order: { source?: unknown; meta?: unknown; table_number?: number | null; employee_name?: string | null };
  onAccept?: () => void;
}) {
  const info = qrOrderInfo(order);
  if (!info.isQr) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge variant="info">
        <QrCodeIcon aria-hidden />
        QR{order.table_number != null ? ` · Table ${order.table_number}` : ""}
      </Badge>
      {/* The waiter's name is on the line below; only flag tables nobody is assigned to. */}
      {info.waiterName ? null : <Badge variant="warning">No waiter assigned</Badge>}
      {info.awaitingAccept ? (
        <>
          <Badge variant="warning">Waiting for you to accept</Badge>
          {onAccept ? (
            <Button size="xs" onClick={onAccept}>
              Accept
            </Button>
          ) : null}
        </>
      ) : info.notPrinted ? (
        <Badge variant="warning">
          <PrinterIcon aria-hidden />
          Not printed yet
        </Badge>
      ) : null}
    </span>
  );
}
