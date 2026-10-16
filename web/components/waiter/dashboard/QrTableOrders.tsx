"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCodeIcon } from "lucide-react";
import { formatETB } from "@/lib/format";
import { qrStaffApi, timeAgo, type OpenQrOrder, type StaffAuth } from "@/lib/staff/qr-live";
import { QrOrderBadges, QrStaffAlerts } from "@/components/staff/QrStaffAlerts";

const POLL_MS = 15_000;

/**
 * Waiter view of QR ordering: open orders and guest requests from the tables
 * assigned to this waiter, plus tables nobody is assigned to (so they're
 * never missed).
 */
export function QrTableOrders({ auth, waiterId }: { auth: StaffAuth; waiterId: string | null }) {
  const [orders, setOrders] = useState<OpenQrOrder[]>([]);
  const load = useCallback(async () => {
    try {
      // This waiter's tables, plus tables nobody is assigned to.
      const all = await qrStaffApi.openQrOrders(auth);
      setOrders(all.filter((o) => !waiterId || !o.waiter_id || o.waiter_id === waiterId));
    } catch {
      // keep the last list
    }
  }, [auth, waiterId]);

  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [load]);

  const sorted = useMemo(
    () => orders.slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))),
    [orders],
  );

  return (
    <section className="space-y-3">
      <QrStaffAlerts auth={auth} forWaiterId={waiterId} onNewQrOrder={() => void load()} />
      <div className="rounded-card border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-section text-foreground">
            <QrCodeIcon className="size-5 text-muted-foreground" aria-hidden /> My tables · QR orders
          </h2>
          <span className="rounded-full bg-highlight px-2.5 py-0.5 text-eyebrow text-highlight-foreground">{sorted.length}</span>
        </div>
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No open QR orders on your tables. New ones show up here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((o) => (
              <li key={o.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      #{o.order_number ?? "—"}
                      {o.table_number != null ? ` · Table ${o.table_number}` : ""}
                    </p>
                    <QrOrderBadges order={o} />
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-foreground">{formatETB(o.total_amount ?? 0)}</span>
                    <span className="block text-meta text-muted-foreground">{timeAgo(o.created_at)}</span>
                  </span>
                </div>
                <ul className="text-sm text-body">
                  {(o.items ?? []).map((it, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">{it.quantity ?? 1} ×</span> {it.menu_item_name || it.name}
                      {it.note ? <span className="font-medium text-foreground"> — {it.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
