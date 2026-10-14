// Proves a QR order and a waiter order for the same menu item get the same
// price, section, item type and total: the server's re-pricing (backend) and
// the waiter/guest screens (web) are run on identical inputs.
import * as server from "../src/common/ordering/order-line";
import * as web from "../../web/lib/ordering/order-line";

const prices: unknown[] = ["60.00", "150", "45.50", "12.49", "0.00", 75, "1,000.00", null, "", "abc", "100.005"];

const items = [
  { main_category: "barista" },
  { main_category: "kitchen" },
  { meta: { main_category: "juice" }, main_category: "kitchen" },
  { category: "  Hot Drinks " },
  { category: "" },
  {},
  { main_category: "Barista" },
];

describe("QR vs waiter ordering parity", () => {
  it.each(prices)("unit price %p is identical", (p) => {
    expect(Object.is(server.menuUnitPrice(p), web.menuUnitPrice(p))).toBe(true);
  });

  it("matches the waiter's own formula exactly (parseFloat, no rounding)", () => {
    for (const p of prices) {
      expect(Object.is(server.menuUnitPrice(p), parseFloat(p as string))).toBe(true);
    }
  });

  it.each(items)("section and item type for %p are identical", (item) => {
    const s = server.menuMainCategory(item);
    expect(s).toBe(web.menuMainCategory(item));
    expect(server.itemTypeFor(s)).toBe(web.itemTypeFor(s));
  });

  it("totals are identical, including fractional sums", () => {
    const lines = [
      { unit_price: 45.5, quantity: 3 },
      { unit_price: 0.1, quantity: 3 },
      { unit_price: 60, quantity: 2 },
    ];
    expect(server.orderTotal(lines)).toBe(web.orderTotal(lines));
    // The waiter computes (sum).toFixed(2) then parseFloat.
    const waiter = parseFloat(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0).toFixed(2));
    expect(server.orderTotal(lines)).toBe(waiter);
  });

  it("only whole-birr prices are storable (integer columns)", () => {
    expect(server.isStorablePrice(server.menuUnitPrice("60.00"))).toBe(true);
    expect(server.isStorablePrice(server.menuUnitPrice("45.50"))).toBe(false);
    expect(server.isStorablePrice(server.menuUnitPrice(null))).toBe(false);
  });
});
