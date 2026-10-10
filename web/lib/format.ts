const wholeEtb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const centsEtb = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// The one money formatter: "18,420 ETB" or "517.50 ETB".
export function formatETB(amount: number | string | null | undefined): string {
  const n = typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? 0));
  const value = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return `${(Number.isInteger(value) ? wholeEtb : centsEtb).format(value)} ETB`;
}

// Unified display vocabulary for order + payment status across the app. Maps the
// canonical axes — orders.status {pending, done, cancelled}, payment_status &
// payments.status {pending, paid, cancelled} — onto display labels:
//   deleted  → cancelled order or voided payment (legacy voided/refunded too)
//   paid     → confirmed payment / paid order
//   done     → fulfilled/served order (lifecycle)
//   pending  → anything still in process
export type DisplayStatus = "deleted" | "pending" | "paid" | "done";

export function displayStatus(status?: string | null): DisplayStatus {
  const s = String(status ?? "").trim().toLowerCase();
  if (["cancelled", "canceled", "voided", "deleted", "refunded"].includes(s))
    return "deleted";
  if (["paid", "completed"].includes(s)) return "paid";
  if (["done", "ready", "served"].includes(s)) return "done";
  return "pending";
}

export function statusBadgeVariant(
  status?: string | null,
): "success" | "warning" | "destructive" {
  const d = displayStatus(status);
  if (d === "paid" || d === "done") return "success";
  if (d === "deleted") return "destructive";
  return "warning";
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Readable label for a stored key: "dine_in" → "Dine-in", "cbe_birr" → "CBE Birr".
const KNOWN_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  "dine-in": "Dine-in",
  take_away: "Takeaway",
  takeaway: "Takeaway",
  take_out: "Takeaway",
  cbe_birr: "CBE Birr",
  cbe: "CBE",
  telebirr: "telebirr",
  pos: "POS",
  cafe_waiter: "Waiter",
  cafe_cashier: "Cashier",
  fb_manager: "F&B manager",
};

export function humanize(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const known = KNOWN_LABELS[raw.toLowerCase()];
  if (known) return known;
  const text = raw.replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
