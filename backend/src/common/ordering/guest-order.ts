import {
  normalizeOrderStatus,
  normalizePaymentStatus,
} from "../status/order-status.constants";

// The guest-facing view of an order (QR self-ordering). Shared by the public
// API and the order sockets, which push it to the guest's own session room.

/** Tracker stage. "Order sent" → "In the kitchen" → "Served"; paid is its own flag. */
export type GuestStage = "sent" | "in_kitchen" | "served" | "cancelled";

/** An order as its guest sees it: no staff names, ids, costs or other tables. */
export interface GuestOrder {
  id: string;
  order_number: number | null;
  table_number: number | null;
  stage: GuestStage;
  paid: boolean;
  waiting_for_staff: boolean;
  created_at: string | null;
  total: number;
  note: string | null;
  customer_name: string | null;
  can_add_items: boolean;
  items: Array<{ name: string; quantity: number; note: string | null; subtotal: number }>;
}

type OrderMeta = {
  printed_at?: string;
  awaiting_accept?: boolean;
  customer_name?: string;
} & Record<string, unknown>;

export function guestStage(order: { status?: unknown; meta?: unknown }): GuestStage {
  const status = normalizeOrderStatus(order.status);
  if (status === "cancelled") return "cancelled";
  if (status === "done") return "served";
  const meta = (order.meta ?? {}) as OrderMeta;
  return meta.printed_at ? "in_kitchen" : "sent";
}

/** Build the guest view from an OrderService.findById() result. */
export function toGuestOrder(full: Record<string, unknown>): GuestOrder {
  const meta = (full.meta ?? {}) as OrderMeta;
  const status = normalizeOrderStatus(full.status);
  const paid = normalizePaymentStatus(full.payment_status) === "paid";
  const items = Array.isArray(full.items) ? (full.items as Array<Record<string, unknown>>) : [];
  return {
    id: String(full.id),
    order_number: (full.order_number as number | null) ?? null,
    table_number: (full.table_number as number | null) ?? null,
    stage: guestStage(full),
    paid,
    waiting_for_staff: meta.awaiting_accept === true,
    created_at: full.created_at ? new Date(full.created_at as string).toISOString() : null,
    total: Number(full.total_amount ?? 0),
    note: (full.notes as string | null) ?? null,
    customer_name: typeof meta.customer_name === "string" ? meta.customer_name : null,
    can_add_items: status === "pending" && !paid,
    items: items.map((it) => ({
      name: String(it.menu_item_name ?? it.name ?? ""),
      quantity: Number(it.quantity ?? 0),
      note: (it.note as string | null) ?? null,
      subtotal: Number(it.subtotal ?? 0),
    })),
  };
}
