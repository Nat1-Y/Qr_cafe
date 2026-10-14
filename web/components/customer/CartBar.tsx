"use client";

import { ShoppingBagIcon } from "lucide-react";
import { formatETB } from "@/lib/format";
import { useI18n } from "@/lib/customer/i18n";

/**
 * Floating "3 items · 340 ETB · View order" bar. Re-keyed on every count change
 * so it gives a small, motion-safe bump when something is added.
 */
export function CartBar({
  count,
  total,
  showPrice,
  label,
  onOpen,
}: {
  count: number;
  total: number;
  showPrice: boolean;
  label?: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  if (count <= 0) return null;
  const items = count === 1 ? t("itemCountOne") : t("itemCount", { n: count });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        key={count}
        type="button"
        onClick={onOpen}
        className="pointer-events-auto flex h-14 w-full items-center gap-3 rounded-full bg-primary px-5 text-primary-foreground shadow-pop transition-colors outline-none hover:bg-primary-hover focus-visible:ring-4 focus-visible:ring-ring motion-safe:animate-in motion-safe:zoom-in-[0.97] motion-safe:duration-200">
        <ShoppingBagIcon className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left text-base font-semibold">
          {label ?? items}
          {showPrice ? <span className="font-normal opacity-90"> · {formatETB(total)}</span> : null}
        </span>
        <span className="shrink-0 text-base font-semibold">{t("viewOrder")}</span>
      </button>
    </div>
  );
}
