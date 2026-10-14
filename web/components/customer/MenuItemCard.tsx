"use client";

import { memo } from "react";
import { FlameIcon, PlusIcon, TimerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatETB } from "@/lib/format";
import { useI18n } from "@/lib/customer/i18n";
import type { MenuItem } from "@/lib/customer/types";
import { ItemImage } from "./bits";

/**
 * One dish or drink: name, two-line description, price, small badges and a
 * big photo with a thumb-sized "+" for a one-tap add. Tapping anywhere else
 * opens the detail sheet. Sold-out items stay visible but can't be added.
 */
export const MenuItemCard = memo(function MenuItemCard({
  item,
  drink,
  canOrder,
  onOpen,
  onQuickAdd,
  inCart,
}: {
  item: MenuItem;
  drink: boolean;
  canOrder: boolean;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
  inCart: number;
}) {
  const { t } = useI18n();
  const out = item.availability === "out";
  const low = item.availability === "low";

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          "flex w-full items-stretch gap-3 rounded-card border border-border bg-card p-3 text-left transition-colors outline-none hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring active:bg-row-hover",
          out && "opacity-70",
        )}>
        <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
          <span className={cn("text-base leading-snug font-semibold text-foreground [overflow-wrap:anywhere]", out && "text-muted-foreground")}>
            {item.name}
          </span>
          {item.description ? (
            <span className="line-clamp-2 text-meta text-muted-foreground [overflow-wrap:anywhere]">{item.description}</span>
          ) : null}
          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
            {item.price != null ? (
              <span className="mr-1 text-base font-semibold text-foreground tabular-nums">{formatETB(item.price)}</span>
            ) : null}
            {out ? (
              <Badge variant="muted">{t("soldOut")}</Badge>
            ) : (
              <>
                {item.popular ? (
                  <Badge variant="default">
                    <FlameIcon aria-hidden />
                    {t("popular")}
                  </Badge>
                ) : null}
                {low ? <Badge variant="warning">{t("fewLeft")}</Badge> : null}
                {item.prep_minutes ? (
                  <Badge variant="secondary">
                    <TimerIcon aria-hidden />
                    {t("minutes", { n: item.prep_minutes })}
                  </Badge>
                ) : null}
              </>
            )}
          </span>
        </span>
        <ItemImage
          src={item.image_url}
          name={item.name}
          drink={drink}
          sizes="112px"
          className={cn("size-28 shrink-0 rounded-2xl", out && "grayscale")}
        />
      </button>
      {canOrder && !out ? (
        <button
          type="button"
          onClick={() => onQuickAdd(item)}
          aria-label={t("addItem", { name: item.name })}
          className="absolute right-4 bottom-4 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop ring-2 ring-card transition-transform hover:bg-primary-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none active:scale-95 motion-reduce:transition-none">
          {inCart > 0 ? <span className="text-meta font-bold tabular-nums">{inCart}</span> : <PlusIcon className="size-5" />}
        </button>
      ) : null}
    </li>
  );
});
