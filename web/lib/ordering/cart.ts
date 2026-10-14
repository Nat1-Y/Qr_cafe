// Cart math shared by the waiter screen and the guest QR app. Pure and
// immutable: every function returns a new array.
import { itemTypeFor, menuUnitPrice, orderTotal } from "./order-line";

export interface CartLine {
  /** menu item + note: the same item with a different note is its own line. */
  key: string;
  menu_item_id: string;
  name: string;
  /** Price as shown to the guest/waiter; the server re-prices guest orders. */
  unit_price: number;
  quantity: number;
  note: string;
  main_category: string;
}

export const MAX_LINE_QTY = 50;

export function lineKey(menuItemId: string, note: string): string {
  return `${menuItemId}::${note.trim().toLowerCase()}`;
}

/** Add `quantity` of an item (with a note); merges into an identical line. */
export function addToCart(
  lines: CartLine[],
  item: { menu_item_id: string; name: string; unit_price: number; main_category: string },
  quantity = 1,
  note = "",
): CartLine[] {
  const key = lineKey(item.menu_item_id, note);
  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return lines.map((l) =>
      l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QTY, l.quantity + quantity) } : l,
    );
  }
  return [
    ...lines,
    { ...item, key, quantity: Math.min(MAX_LINE_QTY, Math.max(1, quantity)), note: note.trim() },
  ];
}

export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return removeLine(lines, key);
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QTY, quantity) } : l));
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Change a line's note; merges into another line that already has that note. */
export function setLineNote(lines: CartLine[], key: string, note: string): CartLine[] {
  const line = lines.find((l) => l.key === key);
  if (!line) return lines;
  const nextKey = lineKey(line.menu_item_id, note);
  if (nextKey === key) return lines.map((l) => (l.key === key ? { ...l, note } : l));
  const target = lines.find((l) => l.key === nextKey);
  if (target) {
    return lines
      .filter((l) => l.key !== key)
      .map((l) =>
        l.key === nextKey ? { ...l, quantity: Math.min(MAX_LINE_QTY, l.quantity + line.quantity) } : l,
      );
  }
  return lines.map((l) => (l.key === key ? { ...l, key: nextKey, note } : l));
}

export function cartCount(lines: Array<{ quantity: number }>): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function cartTotal(lines: Array<{ unit_price: number; quantity: number }>): number {
  return orderTotal(lines);
}

/** The waiter screen's cart rows (price kept as the menu's raw value). */
export interface WaiterCartItem {
  menu_item_id: string | number;
  menu_item_name: string;
  price: unknown;
  quantity: number | string;
  main_category?: string;
  note?: string;
}

/** Waiter total, as the string the screen displays ("123.00"). */
export function waiterCartTotal(items: WaiterCartItem[]): string {
  return items
    .reduce((sum, item) => sum + menuUnitPrice(item.price) * Number(item.quantity), 0)
    .toFixed(2);
}

/** The order lines the waiter screen sends for create and add-items. */
export function buildWaiterOrderLines(items: WaiterCartItem[]) {
  return items.map((item) => {
    const unitPrice = menuUnitPrice(item.price);
    const quantity = parseInt(String(item.quantity), 10);
    const mainCategory = item.main_category || "barista";
    return {
      menu_item_id: item.menu_item_id,
      menu_item_name: item.menu_item_name,
      quantity,
      unit_price: unitPrice,
      subtotal: unitPrice * quantity,
      main_category: mainCategory,
      item_type: itemTypeFor(item.main_category ?? ""),
      note: item.note?.trim() || undefined,
    };
  });
}
