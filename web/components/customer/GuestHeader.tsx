"use client";

import { ReceiptTextIcon } from "lucide-react";
import { useI18n } from "@/lib/customer/i18n";
import type { Landing } from "@/lib/customer/types";
import { LanguageToggle } from "./bits";

export function TableChip({ landing }: { landing: Landing }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex h-7 max-w-[45vw] items-center truncate rounded-full bg-highlight px-3 text-meta font-semibold text-highlight-foreground">
      {landing.table.label || t("table", { n: landing.table.number })}
    </span>
  );
}

/** Sticky top bar shared by the menu and the order tracker. */
export function GuestHeader({
  landing,
  ordersCount,
  onOrders,
}: {
  landing: Landing;
  ordersCount: number;
  onOrders?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-16 items-center gap-2 px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground">{landing.cafe.name}</p>
        <TableChip landing={landing} />
      </div>
      {onOrders && ordersCount > 0 ? (
        <button
          type="button"
          onClick={onOrders}
          className="relative inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-meta font-semibold text-foreground transition-colors hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
          <ReceiptTextIcon className="size-4" aria-hidden />
          {t("yourOrders")}
          <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[0.6875rem] text-primary-foreground tabular-nums">
            {ordersCount}
          </span>
        </button>
      ) : null}
      <LanguageToggle />
    </div>
  );
}
