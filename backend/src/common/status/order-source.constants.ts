/**
 * Where an order was placed (orders.source). Orthogonal to ORDER_STATUS /
 * PAYMENT_STATUS — it never changes after create, and reports split sales on it.
 *
 *  - waiter  : a waiter placed it for a guest (web PWA or desktop)
 *  - cashier : a cashier rang it up (orders.cashier_id set)
 *  - qr      : the guest ordered themselves by scanning the table's QR code
 *  - pos     : reserved for orders the desktop POS creates on its own; nothing
 *              writes it yet — existing POS orders resolve to waiter/cashier.
 */
export const ORDER_SOURCE = ["waiter", "cashier", "qr", "pos"] as const;
export type OrderSource = (typeof ORDER_SOURCE)[number];

export function isOrderSource(v: unknown): v is OrderSource {
  return ORDER_SOURCE.includes(String(v) as OrderSource);
}

/** Staff-placed orders: cashier when a cashier rang it up, else waiter. */
export function staffOrderSource(cashierId: unknown): OrderSource {
  return cashierId ? "cashier" : "waiter";
}
