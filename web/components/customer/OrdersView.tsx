"use client";

import { BellRingIcon, CheckIcon, ChefHatIcon, PlusIcon, ReceiptTextIcon, SendIcon, UtensilsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatETB } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/customer/i18n";
import type { GuestOrder, GuestStage, Landing, PaymentOption } from "@/lib/customer/types";
import { GuestHeader } from "./MenuScreen";

const STEPS: Array<{ stage: Exclude<GuestStage, "cancelled">; key: MessageKey; Icon: typeof SendIcon }> = [
  { stage: "sent", key: "stepSent", Icon: SendIcon },
  { stage: "in_kitchen", key: "stepKitchen", Icon: ChefHatIcon },
  { stage: "served", key: "stepServed", Icon: UtensilsIcon },
];

export function stageLabelKey(stage: GuestStage): MessageKey {
  return stage === "in_kitchen" ? "stepKitchen" : stage === "served" ? "stepServed" : stage === "cancelled" ? "cancelled" : "stepSent";
}

function Tracker({ order }: { order: GuestOrder }) {
  const { t } = useI18n();
  const reached = STEPS.findIndex((s) => s.stage === order.stage);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t(stageLabelKey(order.stage))}>
      {STEPS.map((step, i) => {
        const done = i < reached || (i === reached && order.stage === "served");
        const current = i === reached && !done;
        const last = i === STEPS.length - 1;
        return (
          <li key={step.stage} className="flex flex-col items-center gap-1.5 text-center" aria-current={current ? "step" : undefined}>
            <span className="relative flex w-full items-center justify-center">
              {i > 0 ? (
                <span aria-hidden className={cn("absolute top-1/2 right-1/2 h-0.5 w-full -translate-y-1/2", i <= reached ? "bg-success" : "bg-border")} />
              ) : null}
              <span
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none",
                  done && "border-success bg-success text-success-foreground",
                  current && "border-primary bg-highlight text-highlight-foreground",
                  !done && !current && "border-border bg-card text-muted-foreground",
                )}>
                {done ? <CheckIcon className="size-5" aria-hidden /> : <step.Icon className="size-4.5" aria-hidden />}
                {current ? <span aria-hidden className="absolute inset-0 rounded-full border-2 border-primary motion-safe:animate-ping motion-safe:[animation-duration:2s]" /> : null}
              </span>
            </span>
            <span className={cn("text-meta leading-tight", done || current ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {last && order.paid ? `${t(step.key)} · ${t("paid")}` : t(step.key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({
  order,
  justPlaced,
  showPrices,
  payInstructions,
}: {
  order: GuestOrder;
  justPlaced: boolean;
  showPrices: boolean;
  payInstructions: string | null;
}) {
  const { t } = useI18n();
  const cancelled = order.stage === "cancelled";
  return (
    <article
      className={cn(
        "space-y-4 rounded-card border bg-card p-5",
        justPlaced ? "border-success shadow-pop" : "border-border",
      )}
      aria-labelledby={`order-${order.id}`}>
      {justPlaced ? (
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
            <CheckIcon className="size-8" strokeWidth={2.5} aria-hidden />
          </span>
          <p className="text-section text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:delay-150 motion-safe:duration-300">
            {t("sentTitle")}
          </p>
        </div>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-muted-foreground">{t("orderNumberLabel")}</p>
          <p id={`order-${order.id}`} className="text-[2.5rem] leading-none font-semibold text-foreground tabular-nums">
            #{order.order_number ?? "—"}
          </p>
        </div>
        {cancelled ? null : order.paid ? <Badge variant="success">{t("paid")}</Badge> : <Badge variant="muted">{t("notPaid")}</Badge>}
      </div>

      {cancelled ? (
        <p className="rounded-card bg-destructive-soft p-3 text-meta font-medium text-destructive">{t("cancelled")}</p>
      ) : (
        <Tracker order={order} />
      )}

      {order.waiting_for_staff && !cancelled ? (
        <p className="rounded-card bg-info-soft p-3 text-meta font-medium text-info">{t("waitingStaff")}</p>
      ) : null}

      <ul className="divide-y divide-border border-t border-border">
        {order.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-foreground [overflow-wrap:anywhere]">
                <span className="font-semibold tabular-nums">{it.quantity}×</span> {it.name}
              </p>
              {it.note ? <p className="text-meta text-muted-foreground [overflow-wrap:anywhere]">“{it.note}”</p> : null}
            </div>
            {showPrices ? <span className="shrink-0 text-meta text-muted-foreground tabular-nums">{formatETB(it.subtotal)}</span> : null}
          </li>
        ))}
      </ul>
      {showPrices ? (
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold text-foreground">{t("total")}</span>
          <span className="text-section text-foreground tabular-nums">{formatETB(order.total)}</span>
        </div>
      ) : null}
      {!order.paid && !cancelled ? (
        <p className="flex gap-2 rounded-card bg-secondary p-3 text-meta text-body">
          <ReceiptTextIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {payInstructions ?? t("payAtCounter")}
        </p>
      ) : null}
    </article>
  );
}

export function OrdersView({
  landing,
  orders,
  justPlacedId,
  payInstructions,
  payOptions,
  onPay,
  onAddMore,
  onNewOrder,
  onAssist,
  assistSent,
  assistBusy,
}: {
  landing: Landing;
  orders: GuestOrder[];
  justPlacedId: string | null;
  payInstructions: string | null;
  payOptions: PaymentOption[];
  onPay: (order: GuestOrder, provider: string) => void;
  onAddMore: (order: GuestOrder) => void;
  onNewOrder: () => void;
  onAssist: (type: "call_waiter" | "request_bill") => void;
  assistSent: "call_waiter" | "request_bill" | null;
  assistBusy: boolean;
}) {
  const { t } = useI18n();
  const open = orders.find((o) => o.can_add_items) ?? null;
  const canOrder = landing.ordering.open;
  const unpaid = orders.filter((o) => !o.paid && o.stage !== "cancelled");

  return (
    <div className="min-h-dvh pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <GuestHeader landing={landing} ordersCount={0} />
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <h1 className="text-section text-foreground">{t("yourOrders")}</h1>
        {payOptions.length > 1 && unpaid.length > 0 ? (
          <section className="space-y-3 rounded-card border border-border bg-card p-4" aria-label={t("howToPay")}>
            <p className="font-semibold text-foreground">{t("howToPay")}</p>
            <div className="grid gap-2">
              {payOptions.map((p) => (
                <Button key={p.id} variant="outline" size="lg" onClick={() => onPay(unpaid[0], p.id)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </section>
        ) : null}
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            justPlaced={o.id === justPlacedId}
            showPrices={landing.options.show_prices}
            payInstructions={o.id === justPlacedId ? payInstructions : null}
          />
        ))}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto max-w-lg space-y-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {assistSent ? (
            <p role="status" className="flex items-center justify-center gap-2 text-meta font-medium text-success">
              <BellRingIcon className="size-4" aria-hidden />
              {assistSent === "call_waiter" ? t("waiterComing") : t("billComing")}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" disabled={assistBusy} onClick={() => onAssist("call_waiter")}>
              <BellRingIcon aria-hidden />
              {t("callWaiter")}
            </Button>
            <Button variant="outline" size="lg" disabled={assistBusy} onClick={() => onAssist("request_bill")}>
              <ReceiptTextIcon aria-hidden />
              {t("askBill")}
            </Button>
          </div>
          {canOrder ? (
            open ? (
              <Button size="charge" className="w-full" onClick={() => onAddMore(open)}>
                <PlusIcon aria-hidden />
                {t("addMore")}
              </Button>
            ) : (
              <Button size="charge" className="w-full" onClick={onNewOrder}>
                {t("newOrder")}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
