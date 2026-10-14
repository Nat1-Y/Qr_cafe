"use client";

import { AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatETB } from "@/lib/format";
import { useI18n } from "@/lib/customer/i18n";
import type { MenuChange } from "@/lib/customer/types";
import { BottomSheet } from "./BottomSheet";

/** "We updated your order": what changed on the menu while the guest chose. */
export default function ChangesDialog({
  changes,
  onDone,
}: {
  changes: MenuChange[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open
      onOpenChange={(o) => !o && onDone()}
      title={t("changedTitle")}
      description={t("changedBody")}
      footer={
        <Button size="charge" className="w-full" onClick={onDone}>
          {t("reviewOrder")}
        </Button>
      }>
      <ul className="space-y-2" role="list">
        {changes.map((c) => (
          <li key={`${c.menu_item_id}-${c.reason}`} className="flex gap-3 rounded-card bg-warning-soft p-3 text-warning">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-meta font-medium">
              {t(`changed_${c.reason}`, {
                name: c.name ?? t("someItem"),
                price: c.price != null ? formatETB(c.price) : "",
              })}
            </span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
