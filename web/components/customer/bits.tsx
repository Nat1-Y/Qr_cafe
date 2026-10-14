"use client";

// Small shared pieces of the guest app: language toggle, offline banner,
// item image with a graceful placeholder, quantity stepper, skeletons.
import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { CoffeeIcon, MinusIcon, PlusIcon, UtensilsCrossedIcon, WifiOffIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/customer/i18n";
import { resolveImageUrl } from "@/lib/customer/api";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "am" : "en")}
      aria-label={t("switchToLabel")}
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card px-3.5 text-meta font-semibold text-foreground transition-colors hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}>
      <span lang={lang === "en" ? "am" : "en"}>{t("switchTo")}</span>
    </button>
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useI18n();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center gap-2 bg-warning-soft px-4 py-2.5 text-meta font-medium text-warning">
      <WifiOffIcon className="size-4 shrink-0" aria-hidden />
      {t("offline")}
    </div>
  );
}

/** Menu photo, or a calm branded placeholder when there's none (or it fails). */
export function ItemImage({
  src,
  name,
  drink,
  sizes,
  className,
  priority = false,
}: {
  src: string | null;
  name: string;
  drink: boolean;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const url = resolveImageUrl(src);
  const Icon = drink ? CoffeeIcon : UtensilsCrossedIcon;
  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      {url && !failed ? (
        <Image
          src={url}
          alt={t("imageOf", { name })}
          fill
          sizes={sizes}
          // Owner photos come from any host; serve them as-is (still lazy).
          unoptimized
          priority={priority}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <div aria-hidden className="flex h-full w-full items-center justify-center text-muted-foreground/60">
          <Icon className="size-1/3 max-h-10 max-w-10" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 50,
  size = "lg",
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "lg" | "sm";
  label: string;
}) {
  const { t } = useI18n();
  const btn = cn(
    "flex items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
    size === "lg" ? "size-12" : "size-11",
  );
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={t("decrease")}>
        <MinusIcon className="size-4" />
      </button>
      <output aria-live="polite" className={cn("min-w-8 text-center font-semibold text-foreground tabular-nums", size === "lg" ? "text-section" : "text-base")}>
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t("increase")}>
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}

export function MenuSkeleton() {
  return (
    <div aria-hidden className="space-y-6 px-4 pt-4">
      <Skeleton className="h-11 w-full rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {[72, 96, 64, 88].map((w) => (
          <Skeleton key={w} className="h-11 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-card border border-border bg-card p-3">
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="size-24 shrink-0 rounded-2xl" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function WelcomeSkeleton() {
  return (
    <div aria-hidden className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-9 w-28 rounded-full" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-6 h-14 w-full max-w-sm rounded-full" />
    </div>
  );
}

/** Announces text to screen readers without showing it. */
export function LiveRegion({ message }: { message: string }) {
  const [shown, setShown] = useState("");
  // Re-set on each new message so repeats are still announced.
  useEffect(() => {
    const id = window.setTimeout(() => setShown(message), 50);
    return () => window.clearTimeout(id);
  }, [message]);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {shown}
    </div>
  );
}
