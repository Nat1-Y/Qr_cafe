import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the Buna type scale, radii and shadow so e.g.
// "text-eyebrow text-success" keeps both the size and the colour.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["title", "section", "kpi", "meta", "eyebrow"],
      radius: ["card", "field"],
      shadow: ["pop"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a UUID to a shorter integer number for display purposes.
 * Generates a positive 32-bit integer hash from the UUID string.
 */
export function uuidToDisplayId(uuid: string | null | undefined): number {
  if (!uuid) return 0;

  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

/**
 * Display label for an order's tracking number. Prefers the per-branch serial
 * (`order_number` — backend-assigned, or the provisional one stamped on
 * offline orders); legacy orders with no serial at all fall back to a short
 * UUID-derived number so a raw UUID is never rendered.
 */
export function formatOrderNumber(
  order:
    | {
        order_number?: number | null;
        id?: string | null;
      }
    | null
    | undefined,
): string {
  const serial = order?.order_number;
  if (serial != null && Number(serial) > 0) return `#${serial}`;
  return `#${uuidToDisplayId(order?.id)}`;
}

// Unified display vocabulary for order + payment status across the app, matching
// the web: deleted (cancelled/voided), paid (confirmed/completed), pending
// (anything still in process). Keeps the stored value intact — display only.
export type DisplayStatus = "deleted" | "pending" | "paid";

export function displayStatus(status?: string | null): DisplayStatus {
  const s = String(status ?? "").trim().toLowerCase();
  if (["cancelled", "canceled", "voided", "deleted", "refunded"].includes(s))
    return "deleted";
  if (["paid", "completed", "done"].includes(s)) return "paid";
  return "pending";
}

export type DisplayStatusVariant = "success" | "warning" | "destructive";

export function statusBadgeVariant(status?: string | null): DisplayStatusVariant {
  const d = displayStatus(status);
  if (d === "paid") return "success";
  if (d === "deleted") return "destructive";
  return "warning";
}

export type OrderSource = "cashier" | "waiter" | "owner";

/**
 * Determines how an order was placed: rung up by a cashier on a waiter's behalf
 * ("cashier"), created straight from the back-office web dashboard by an
 * owner/admin ("owner"), or placed directly on the floor by the waiter
 * ("waiter"). Prefers the backend-provided `order_source`; otherwise infers a
 * cashier from the creator differing from the attributed waiter (cashier flows
 * send a distinct `created_by_id`/`cashier_id`).
 */
export function getOrderSource(order: any): OrderSource {
  if (
    order?.order_source === "cashier" ||
    order?.order_source === "waiter" ||
    order?.order_source === "owner"
  ) {
    return order.order_source;
  }
  const waiterId = order?.waiter_id || order?.employee_id;
  const creatorId = order?.cashier_id || order?.created_by_id;
  if (creatorId && waiterId && String(creatorId) !== String(waiterId)) {
    return "cashier";
  }
  return "waiter";
}

// Back-office roles whose members place orders from the web dashboard rather
// than the POS floor. Mirrors the backend's BACK_OFFICE_ROLES.
const BACK_OFFICE_ROLES = new Set(["owner", "business_admin", "super_admin"]);

/**
 * The label to prefix the attributed person's name with in order/payment views
 * (e.g. "Waiter: Sarah" vs "Owner: Business Owner"). Owner/admin-placed orders
 * have no real waiter, so calling the owner a "Waiter" is wrong. Checks the
 * explicit source first, then falls back to the employee's role so it still
 * works on order objects that carry `employee_role` but not `order_source`.
 */
export function getOrderPlacerLabel(order: any): "Owner" | "Waiter" {
  if (order?.order_source === "owner") return "Owner";
  if (BACK_OFFICE_ROLES.has(order?.employee_role)) return "Owner";
  return "Waiter";
}

/**
 * When an order was placed by someone other than the attributed waiter (a
 * cashier ringing it up, or an owner placing it from the back office), returns
 * how to label that placer ("Owner" vs "Cashier") plus their name, so the UI
 * can show the source alongside the mapped waiter. Returns null when the waiter
 * placed their own order (nothing extra to show).
 */
export function getOrderCreator(
  order: any,
): { label: "Owner" | "Cashier"; name: string } | null {
  const name = order?.cashier_name;
  if (!name) return null;
  const label = BACK_OFFICE_ROLES.has(order?.cashier_role) ? "Owner" : "Cashier";
  return { label, name };
}
