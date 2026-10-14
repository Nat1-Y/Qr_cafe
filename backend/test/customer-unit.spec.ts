import { randomUUID } from "crypto";
import { BadRequestException } from "@nestjs/common";
import {
  cleanText,
  parseGuestOrder,
  parseAssist,
} from "../src/modules/customer/customer.validation";
import { RateLimiter } from "../src/modules/customer/rate-limiter";
import { isWithinOrderingHours, parseQrSettings } from "../src/common/qr/qr-settings";
import { generateQrToken, isWellFormedToken } from "../src/common/qr/qr-token";
import { guestStage, toGuestOrder } from "../src/common/ordering/guest-order";

const opts = { allowNotes: true, maxItems: 10 };
const line = (extra: Record<string, unknown> = {}) => ({ menu_item_id: randomUUID(), quantity: 1, ...extra });
const order = (extra: Record<string, unknown> = {}) => ({ client_order_id: randomUUID(), items: [line()], ...extra });

describe("guest input validation", () => {
  it("strips HTML and control characters, keeps Amharic", () => {
    expect(cleanText("<b>ስኳር</b> የለም<script>x</script>\u0007 ok")).toBe("ስኳር የለምx ok");
  });

  it("rejects a client_order_id that isn't a UUID", () => {
    expect(() => parseGuestOrder(order({ client_order_id: "123" }), opts)).toThrow(BadRequestException);
    expect(() => parseGuestOrder(order({ client_order_id: "'; drop table orders;--" }), opts)).toThrow(BadRequestException);
  });

  it.each([0, 51, 1.5, -1, "2"])("rejects quantity %p outside 1–50 / non-integer", (q) => {
    if (q === "2") {
      // numeric strings are fine
      expect(parseGuestOrder(order({ items: [line({ quantity: q })] }), opts).items[0].quantity).toBe(2);
      return;
    }
    expect(() => parseGuestOrder(order({ items: [line({ quantity: q })] }), opts)).toThrow(BadRequestException);
  });

  it("rejects notes over 200 characters and strips HTML from accepted notes", () => {
    expect(() => parseGuestOrder(order({ items: [line({ note: "x".repeat(201) })] }), opts)).toThrow(/200/);
    const ok = parseGuestOrder(order({ items: [line({ note: "<i>No sugar</i>" })] }), opts);
    expect(ok.items[0].note).toBe("No sugar");
  });

  it("drops notes when the owner turned notes off", () => {
    const r = parseGuestOrder(order({ items: [line({ note: "hi" })], order_note: "x" }), { ...opts, allowNotes: false });
    expect(r.items[0].note).toBeNull();
    expect(r.order_note).toBeNull();
  });

  it("enforces the max items per order across quantities", () => {
    expect(() => parseGuestOrder(order({ items: [line({ quantity: 6 }), line({ quantity: 5 })] }), opts)).toThrow(/up to 10/);
  });

  it("validates the optional phone and name", () => {
    expect(() => parseGuestOrder(order({ customer_phone: "call me" }), opts)).toThrow(BadRequestException);
    const r = parseGuestOrder(order({ customer_phone: "+251 911 234 567", customer_name: " <b>Abebe</b> " }), opts);
    expect(r.customer_name).toBe("Abebe");
    expect(r.customer_phone).toBe("+251 911 234 567");
  });

  it("only accepts the two assist types", () => {
    expect(parseAssist({ type: "call_waiter" })).toBe("call_waiter");
    expect(() => parseAssist({ type: "free_coffee" })).toThrow(BadRequestException);
  });
});

describe("rate limiter", () => {
  it("allows the limit, then blocks with a retry time, then recovers", () => {
    let now = 1_000_000;
    const rl = new RateLimiter(() => now);
    const rule = { limit: 2, windowMs: 60_000 };
    expect(rl.hit("k", rule)).toBe(0);
    expect(rl.hit("k", rule)).toBe(0);
    expect(rl.hit("k", rule)).toBeGreaterThan(0);
    expect(rl.hit("other", rule)).toBe(0);
    now += 60_001;
    expect(rl.hit("k", rule)).toBe(0);
  });
});

describe("QR settings", () => {
  it("defaults: ordering off, prices and notes on, 30 items", () => {
    const s = parseQrSettings({});
    expect(s).toMatchObject({ enabled: false, showPrices: true, allowNotes: true, maxItemsPerOrder: 30, autoPrint: true });
  });

  it("ordering hours, including a window past midnight", () => {
    const day = { open: "08:00", close: "22:00" };
    expect(isWithinOrderingHours(day, 7 * 60 + 59)).toBe(false);
    expect(isWithinOrderingHours(day, 8 * 60)).toBe(true);
    expect(isWithinOrderingHours(day, 22 * 60)).toBe(false);
    const night = { open: "18:00", close: "02:00" };
    expect(isWithinOrderingHours(night, 23 * 60)).toBe(true);
    expect(isWithinOrderingHours(night, 60)).toBe(true);
    expect(isWithinOrderingHours(night, 12 * 60)).toBe(false);
    expect(isWithinOrderingHours(null, 0)).toBe(true);
  });
});

describe("tokens", () => {
  it("QR tokens are 256-bit, URL-safe and unique", () => {
    const set = new Set(Array.from({ length: 2000 }, generateQrToken));
    expect(set.size).toBe(2000);
    for (const t of set) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(isWellFormedToken(t)).toBe(true);
    }
    expect(isWellFormedToken("1")).toBe(false);
    expect(isWellFormedToken("../../etc/passwd")).toBe(false);
  });
});

describe("guest order view", () => {
  it("maps lifecycle to the 3-step tracker and hides staff data", () => {
    expect(guestStage({ status: "pending", meta: {} })).toBe("sent");
    expect(guestStage({ status: "pending", meta: { printed_at: "x" } })).toBe("in_kitchen");
    expect(guestStage({ status: "done", meta: {} })).toBe("served");
    expect(guestStage({ status: "cancelled" })).toBe("cancelled");
    const view = toGuestOrder({
      id: "o1",
      status: "done",
      payment_status: "paid",
      total_amount: 120,
      employee_name: "Secret Waiter",
      cashier_name: "Secret Cashier",
      waiter_id: "u1",
      meta: { customer_phone: "+251..." },
      items: [{ menu_item_name: "Macchiato", quantity: 2, subtotal: 120, unit_price: 60, menu_item_id: "m" }],
    });
    expect(view.paid).toBe(true);
    expect(view.can_add_items).toBe(false);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/Secret|waiter_id|customer_phone|menu_item_id/);
  });
});
