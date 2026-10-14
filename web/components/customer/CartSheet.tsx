"use client";

import { useState } from "react";
import { PencilIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatETB } from "@/lib/format";
import { useI18n } from "@/lib/customer/i18n";
import type { CartLine } from "@/lib/ordering/cart";
import { BottomSheet } from "./BottomSheet";
import { Stepper } from "./bits";

export interface GuestDetails {
  orderNote: string;
  name: string;
  phone: string;
}

function LineNote({
  line,
  onSave,
}: {
  line: CartLine;
  onSave: (note: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.note);
  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {line.note ? <p className="text-meta font-medium text-foreground [overflow-wrap:anywhere]">“{line.note}”</p> : null}
        <button
          type="button"
          onClick={() => {
            setDraft(line.note);
            setEditing(true);
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-1 text-meta font-semibold text-primary hover:underline focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
          <PencilIcon className="size-3.5" aria-hidden />
          {line.note ? t("changeNote") : t("editNote")}
        </button>
      </div>
    );
  }
  return (
    <Textarea
      autoFocus
      value={draft}
      maxLength={200}
      rows={2}
      aria-label={t("noteLabel")}
      placeholder={t("notePlaceholder")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onSave(draft.trim());
      }}
      className="min-h-14 resize-none"
    />
  );
}

export default function CartSheet({
  open,
  onOpenChange,
  lines,
  total,
  addingToOrderNumber,
  allowNotes,
  showPrices,
  details,
  onDetails,
  onQty,
  onRemove,
  onNote,
  onSend,
  sending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  total: number;
  addingToOrderNumber: number | null;
  allowNotes: boolean;
  showPrices: boolean;
  details: GuestDetails;
  onDetails: (next: GuestDetails) => void;
  onQty: (key: string, qty: number) => void;
  onRemove: (line: CartLine) => void;
  onNote: (key: string, note: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const { t } = useI18n();
  const [showContact, setShowContact] = useState(Boolean(details.name || details.phone));
  const adding = addingToOrderNumber != null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={adding ? t("addingTo", { n: addingToOrderNumber }) : t("yourOrder")}
      footer={
        lines.length > 0 ? (
          <div className="space-y-3">
            {showPrices ? (
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-foreground">{t("total")}</span>
                <span className="text-section text-foreground tabular-nums">{formatETB(total)}</span>
              </div>
            ) : null}
            <Button size="charge" className="w-full" onClick={onSend} disabled={sending} aria-busy={sending}>
              {sending ? t("sending") : adding ? t("sendItems") : t("sendOrder")}
            </Button>
          </div>
        ) : undefined
      }>
      {lines.length === 0 ? (
        <div className="space-y-4 py-10 text-center">
          <p className="text-muted-foreground">{t("emptyCart")}</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("backToMenu")}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.key} className="space-y-1 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground [overflow-wrap:anywhere]">{line.name}</p>
                    {showPrices ? (
                      <p className="text-meta text-muted-foreground tabular-nums">{formatETB(line.unit_price * line.quantity)}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line)}
                    aria-label={`${t("remove")} ${line.name}`}
                    className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {allowNotes ? <LineNote line={line} onSave={(n) => onNote(line.key, n)} /> : <span />}
                  <Stepper size="sm" value={line.quantity} min={0} onChange={(n) => onQty(line.key, n)} label={`${t("quantity")}: ${line.name}`} />
                </div>
              </li>
            ))}
          </ul>

          {!adding ? (
            <div className="space-y-4 rounded-card bg-secondary p-4">
              {allowNotes ? (
                <div className="space-y-2">
                  <label htmlFor="order-note" className="font-semibold text-foreground">
                    {t("orderNote")} <span className="text-meta font-normal text-muted-foreground">({t("optional")})</span>
                  </label>
                  <Textarea
                    id="order-note"
                    value={details.orderNote}
                    maxLength={200}
                    rows={2}
                    placeholder={t("orderNotePlaceholder")}
                    onChange={(e) => onDetails({ ...details, orderNote: e.target.value })}
                    className="min-h-14 resize-none"
                  />
                </div>
              ) : null}
              {showContact ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="guest-name" className="text-meta font-semibold text-foreground">
                      {t("yourName")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
                    </label>
                    <Input
                      id="guest-name"
                      value={details.name}
                      maxLength={60}
                      autoComplete="given-name"
                      onChange={(e) => onDetails({ ...details, name: e.target.value })}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="guest-phone" className="text-meta font-semibold text-foreground">
                      {t("yourPhone")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
                    </label>
                    <Input
                      id="guest-phone"
                      type="tel"
                      inputMode="tel"
                      value={details.phone}
                      maxLength={20}
                      autoComplete="tel"
                      onChange={(e) => onDetails({ ...details, phone: e.target.value })}
                      className="h-11"
                    />
                  </div>
                  <p className="text-meta text-muted-foreground sm:col-span-2">{t("nameHint")}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowContact(true)}
                  className="inline-flex h-11 items-center gap-2 text-meta font-semibold text-primary hover:underline focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
                  <UserRoundIcon className="size-4" aria-hidden />
                  {t("yourName")} ({t("optional")})
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
