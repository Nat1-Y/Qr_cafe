// How a menu item becomes an order line. These MUST match the waiter flow
// exactly (web/lib/ordering/order-line.ts — the waiter's create-order screen
// uses that file), so a QR order and a waiter order for the same item can never
// carry different prices, sections or item types. A cross-package test
// (test/ordering-parity.spec.ts) runs both implementations on the same inputs.

export interface MenuItemLike {
  price?: unknown;
  main_category?: unknown;
  category?: unknown;
  meta?: unknown;
}

/** Unit price as the waiter sends it: parseFloat of the menu's numeric price, unrounded. */
export function menuUnitPrice(price: unknown): number {
  return parseFloat(String(price));
}

/**
 * Orders/order_items store whole birr (integer columns). A fractional menu
 * price is rejected by Postgres for every order path today, so callers check
 * this up front and turn it into a clear error instead of a failed insert.
 */
export function isStorablePrice(unitPrice: number): boolean {
  return Number.isFinite(unitPrice) && Number.isInteger(unitPrice) && unitPrice >= 0;
}

function normalizeMainCategory(value: unknown): string {
  const v = String(value || "").trim().toLowerCase();
  return v || "other";
}

/** The item's section ("where it prints"), same precedence as the waiter screen. */
export function menuMainCategory(item: MenuItemLike): string {
  const meta = (item.meta ?? {}) as { main_category?: unknown };
  const value =
    meta.main_category || item.main_category || normalizeMainCategory(item.category);
  return String(value || "barista");
}

/** Barista lines are beverages; everything else is food — as the waiter sends it. */
export function itemTypeFor(mainCategory: string): "beverage" | "food" {
  return mainCategory === "barista" ? "beverage" : "food";
}

/** Order total the way the waiter computes it: sum, then toFixed(2) → number. */
export function orderTotal(lines: Array<{ unit_price: number; quantity: number }>): number {
  const sum = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  return parseFloat(sum.toFixed(2));
}
