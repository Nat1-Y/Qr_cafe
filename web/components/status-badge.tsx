import { CheckIcon, ClockIcon, PlusIcon, XIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { displayStatus } from "@/lib/format";

export type StatusKind =
  | "order"
  | "payment"
  | "delivery"
  | "transfer"
  | "stock"
  | "table"
  | "device"
  | "generic";

type Tone = "success" | "warning" | "info" | "destructive" | "brand" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  destructive: "bg-destructive-soft text-destructive",
  brand: "bg-highlight text-highlight-foreground",
  neutral: "bg-muted text-muted-foreground",
};

type Resolved = { tone: Tone; label: string; icon?: LucideIcon };

const humanize = (s: string) => {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
};

function resolve(kind: StatusKind, raw: string): Resolved {
  const s = raw.trim().toLowerCase();
  switch (kind) {
    case "order":
    case "payment": {
      if (s === "ready") return { tone: "info", label: "Ready", icon: CheckIcon };
      const d = displayStatus(s);
      if (d === "paid") return { tone: "success", label: "Paid", icon: CheckIcon };
      if (d === "done") return { tone: "success", label: "Served", icon: CheckIcon };
      if (d === "deleted") return { tone: "destructive", label: "Cancelled", icon: XIcon };
      return { tone: "warning", label: "Pending", icon: ClockIcon };
    }
    case "delivery":
      if (s === "delivered" || s === "completed") return { tone: "success", label: "Delivered", icon: CheckIcon };
      if (["out", "out_for_delivery", "dispatched", "in_transit", "on_the_way", "picked_up"].includes(s))
        return { tone: "info", label: "Out for delivery", icon: ClockIcon };
      if (["cancelled", "canceled", "failed", "returned"].includes(s))
        return { tone: "destructive", label: humanize(s), icon: XIcon };
      return { tone: "warning", label: humanize(s || "pending"), icon: ClockIcon };
    case "transfer":
      if (s === "received" || s === "completed") return { tone: "success", label: "Received", icon: CheckIcon };
      if (s === "approved" || s === "in_transit") return { tone: "info", label: humanize(s), icon: ClockIcon };
      if (["rejected", "cancelled", "canceled"].includes(s)) return { tone: "destructive", label: humanize(s), icon: XIcon };
      return { tone: "warning", label: "Pending", icon: ClockIcon };
    case "stock":
      if (["out", "out_of_stock", "empty"].includes(s)) return { tone: "destructive", label: "Out of stock", icon: XIcon };
      if (s === "low" || s === "low_stock") return { tone: "warning", label: "Low stock", icon: ClockIcon };
      return { tone: "success", label: "In stock", icon: CheckIcon };
    case "table":
      if (s === "available" || s === "free") return { tone: "success", label: "Free", icon: CheckIcon };
      if (s === "occupied") return { tone: "brand", label: "Occupied", icon: ClockIcon };
      return { tone: "neutral", label: humanize(s) };
    case "device":
      if (["approved", "active", "enrolled"].includes(s)) return { tone: "success", label: humanize(s), icon: CheckIcon };
      if (["rejected", "revoked", "disabled", "blocked"].includes(s)) return { tone: "destructive", label: humanize(s), icon: XIcon };
      if (s === "pending") return { tone: "warning", label: "Pending", icon: ClockIcon };
      return { tone: "neutral", label: humanize(s) };
    default:
      if (["paid", "done", "completed", "approved", "received", "delivered", "active", "success"].includes(s))
        return { tone: "success", label: humanize(s), icon: CheckIcon };
      if (["pending", "waiting", "processing", "preparing", "low"].includes(s))
        return { tone: "warning", label: humanize(s), icon: ClockIcon };
      if (["new", "open"].includes(s)) return { tone: "info", label: humanize(s), icon: PlusIcon };
      if (["cancelled", "canceled", "rejected", "failed", "voided", "deleted", "error", "inactive"].includes(s))
        return { tone: "destructive", label: humanize(s), icon: XIcon };
      return { tone: "neutral", label: humanize(s) };
  }
}

/** The one status pill: soft background, darker text, small leading icon. */
export function StatusBadge({
  status,
  kind = "generic",
  label,
  className,
}: {
  status?: string | null;
  kind?: StatusKind;
  /** Override the label while keeping the colour and icon. */
  label?: React.ReactNode;
  className?: string;
}) {
  const r = resolve(kind, String(status ?? ""));
  const Icon = r.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-eyebrow",
        TONE_CLASS[r.tone],
        className,
      )}>
      {Icon && <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />}
      {label ?? r.label}
    </span>
  );
}
