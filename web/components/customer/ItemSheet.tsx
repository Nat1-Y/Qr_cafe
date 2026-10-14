"use client";

import { useState } from "react";
import { FlameIcon, TimerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatETB } from "@/lib/format";
import { DEFAULT_NOTE_CHIPS, useI18n } from "@/lib/customer/i18n";
import type { MenuItem } from "@/lib/customer/types";
import { BottomSheet } from "./BottomSheet";
import { ItemImage, Stepper } from "./bits";

const NOTE_MAX = 200;

/**
 * Item detail. Mounted with key={item.id} by the parent, so quantity and note
 * start fresh for every item.
 */
export default function ItemSheet({
  item,
  drink,
  open,
  onOpenChange,
  allowNotes,
  canOrder,
  onAdd,
}: {
  item: MenuItem;
  drink: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowNotes: boolean;
  canOrder: boolean;
  onAdd: (quantity: number, note: string) => void;
}) {
  const { t, lang } = useI18n();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const out = item.availability === "out";
  const chips = item.note_presets.length > 0 ? item.note_presets : DEFAULT_NOTE_CHIPS[lang][drink ? "drink" : "food"];

  const toggleChip = (chip: string) => {
    const parts = note
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const has = parts.some((p) => p.toLowerCase() === chip.toLowerCase());
    const next = has ? parts.filter((p) => p.toLowerCase() !== chip.toLowerCase()) : [...parts, chip];
    setNote(next.join(", ").slice(0, NOTE_MAX));
  };
  const chipOn = (chip: string) =>
    note
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .includes(chip.toLowerCase());

  const total = item.price != null ? item.price * qty : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={item.name}
      hideTitle
      footer={
        canOrder ? (
          <Button
            size="charge"
            className="w-full"
            disabled={out}
            onClick={() => onAdd(qty, note.trim())}>
            {out ? t("soldOut") : total != null ? t("addPrice", { price: formatETB(total) }) : t("addToOrder")}
          </Button>
        ) : undefined
      }>
      <div className="space-y-5">
        {item.image_url ? (
          <ItemImage
            src={item.image_url}
            name={item.name}
            drink={drink}
            sizes="(max-width: 512px) 100vw, 512px"
            priority
            className="-mx-5 aspect-[16/10] w-[calc(100%+2.5rem)]"
          />
        ) : null}
        <div className="space-y-2">
          <h2 className="text-title leading-tight text-foreground [overflow-wrap:anywhere]">{item.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {item.price != null ? <span className="text-section text-foreground tabular-nums">{formatETB(item.price)}</span> : null}
            {out ? <Badge variant="muted">{t("soldOut")}</Badge> : null}
            {!out && item.availability === "low" ? <Badge variant="warning">{t("fewLeft")}</Badge> : null}
            {item.popular ? (
              <Badge>
                <FlameIcon aria-hidden />
                {t("popular")}
              </Badge>
            ) : null}
            {item.prep_minutes ? (
              <Badge variant="secondary">
                <TimerIcon aria-hidden />
                {t("minutes", { n: item.prep_minutes })}
              </Badge>
            ) : null}
          </div>
          {item.description ? <p className="text-body [overflow-wrap:anywhere]">{item.description}</p> : null}
        </div>

        {canOrder && !out ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-foreground">{t("quantity")}</span>
              <Stepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(50, n)))} label={t("quantity")} />
            </div>

            {allowNotes ? (
              <div className="space-y-2.5">
                <label htmlFor="item-note" className="flex items-baseline justify-between gap-2 font-semibold text-foreground">
                  {t("noteLabel")}
                  <span className="text-meta font-normal text-muted-foreground">{t("noteHint")}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {chips.map((chip) => {
                    const on = chipOn(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleChip(chip)}
                        className={cn(
                          "h-11 rounded-full border px-4 text-meta font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none",
                          on ? "border-primary bg-highlight text-highlight-foreground" : "border-border bg-card text-foreground hover:bg-row-hover",
                        )}>
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <Textarea
                  id="item-note"
                  value={note}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("notePlaceholder")}
                  rows={2}
                  className="min-h-14 resize-none"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
