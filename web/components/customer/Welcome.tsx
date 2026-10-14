"use client";

import { useState } from "react";
import Image from "next/image";
import { ClockIcon, PhoneIcon, QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/customer/i18n";
import type { Landing } from "@/lib/customer/types";
import { LanguageToggle } from "./bits";
import { TableChip } from "./MenuScreen";

function CafeMark({ landing }: { landing: Landing }) {
  const [failed, setFailed] = useState(false);
  const initial = landing.cafe.name.trim().charAt(0).toUpperCase() || "☕";
  if (landing.cafe.logo_url && !failed) {
    return (
      <span className="relative block size-20 overflow-hidden rounded-full border border-border bg-card shadow-pop">
        <Image src={landing.cafe.logo_url} alt="" fill sizes="80px" unoptimized priority onError={() => setFailed(true)} className="object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-primary text-[2rem] font-semibold text-primary-foreground shadow-pop">
      {initial}
    </span>
  );
}

/** First screen after scanning: who, where, and one big button. */
export function Welcome({
  landing,
  onStart,
}: {
  landing: Landing;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const closed = !landing.ordering.open;
  return (
    <main className="relative flex min-h-dvh flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        <CafeMark landing={landing} />
        <h1 className="text-title text-foreground">{t("welcomeTitle", { cafe: landing.cafe.name })}</h1>
        <TableChip landing={landing} />
        {closed ? (
          <div role="status" className="w-full space-y-3 rounded-card border border-border bg-card p-5 text-left">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <ClockIcon className="size-4 shrink-0 text-warning" aria-hidden />
              {t("closedTitle")}
            </p>
            <p className="text-body">{landing.ordering.reason ? t(`closed_${landing.ordering.reason}`) : null}</p>
            {landing.ordering.reason === "closed_now" && landing.ordering.hours ? (
              <p className="text-meta text-muted-foreground">
                {t("closedHours", { open: landing.ordering.hours.open, close: landing.ordering.hours.close })}
              </p>
            ) : null}
            {landing.cafe.phone ? (
              <Button asChild variant="outline" size="lg" className="w-full">
                <a href={`tel:${landing.cafe.phone.replace(/\s+/g, "")}`}>
                  <PhoneIcon aria-hidden />
                  {t("callCafe")} · {landing.cafe.phone}
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-body">{landing.cafe.welcome_message || t("welcomeSub")}</p>
        )}
      </div>
      <div className="mx-auto w-full max-w-sm">
        <Button size="charge" variant={closed ? "outline" : "default"} className="w-full" onClick={onStart}>
          {closed ? t("lookAtMenu") : t("seeMenu")}
        </Button>
      </div>
    </main>
  );
}

/** Unknown, rotated or disabled-at-the-root QR codes. */
export function BrokenQr() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <QrCodeIcon className="size-9" aria-hidden />
        </span>
        <h1 className="text-title text-foreground">{t("qrBrokenTitle")}</h1>
        <p className="text-body">{t("qrBrokenBody")}</p>
      </div>
    </main>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-body">{message}</p>
      <Button size="lg" onClick={onRetry}>
        {t("tryAgain")}
      </Button>
    </main>
  );
}
