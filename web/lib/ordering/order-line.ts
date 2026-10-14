// How a menu item becomes an order line — price, section, item type, total.
// Used by the waiter's create-order screen and the guest QR app, and mirrored
// on the server (backend/src/common/ordering/order-line.ts) which re-prices
// every guest order. backend/test/ordering-parity.spec.ts runs both files on
// the same inputs, so the two can never drift into charging different prices.
// Keep this file dependency-free.

export interface MenuItemLike {
  price?: unknown;
  main_category?: unknown;
  category?: unknown;
  meta?: unknown;
}

/** parseFloat of the menu's numeric price, unrounded — what the waiter sends. */
export function menuUnitPrice(price: unknown): number {
  return parseFloat(String(price));
}

function normalizeMainCategory(value: unknown): string {
  const v = String(value || "").trim().toLowerCase();
  return v || "other";
}

/** The item's section ("where it prints"). */
export function menuMainCategory(item: MenuItemLike): string {
  const meta = (item.meta ?? {}) as { main_category?: unknown };
  const value =
    meta.main_category || item.main_category || normalizeMainCategory(item.category);
  return String(value || "barista");
}

/** Barista lines are beverages; everything else is food. */
export function itemTypeFor(mainCategory: string): "beverage" | "food" {
  return mainCategory === "barista" ? "beverage" : "food";
}

/** Sum of unit price × quantity, then toFixed(2) → number. */
export function orderTotal(lines: Array<{ unit_price: number; quantity: number }>): number {
  const sum = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  return parseFloat(sum.toFixed(2));
}
