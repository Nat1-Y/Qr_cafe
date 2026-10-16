import { randomUUID } from "crypto";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { io, Socket } from "socket.io-client";
import { db, pool } from "../src/db/drizzle";
import { orders, order_items, order_item_additions, payments, syncEvents, diningTables } from "../src/db/tables";
import { InventoryService } from "../src/modules/inventory/inventory.service";
import { QR_SETTING_KEYS } from "../src/common/qr/qr-settings";
import { generateQrToken } from "../src/common/qr/qr-token";
import { startApp, resetRateLimits } from "./helpers/app";
import { BranchFixture, seedBranch, setBranchSetting } from "./helpers/fixtures";

let app: INestApplication;
let url: string;
let A: BranchFixture;
let B: BranchFixture;

const http = () => request(app.getHttpServer());
const ORIGIN = "http://localhost:3000";

async function startSession(token: string): Promise<string> {
  const res = await http().get(`/api/public/t/${token}`).expect(200);
  return res.body.data.session.token as string;
}

function placeOrder(token: string, session: string, body: Record<string, unknown>) {
  return http()
    .post(`/api/public/t/${token}/orders`)
    .set("X-Customer-Session", session)
    .send({ client_order_id: randomUUID(), ...body });
}

function once<T>(socket: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

beforeAll(async () => {
  ({ app, url } = await startApp());
  A = await seedBranch({ name: "Café A" });
  B = await seedBranch({ businessId: A.businessId, name: "Café B" });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(() => resetRateLimits(app));
afterEach(() => jest.restoreAllMocks());

describe("QR token → tenant", () => {
  it("resolves the table's own branch and ignores tenant headers and staff tokens", async () => {
    const res = await http()
      .get(`/api/public/t/${A.tableToken}`)
      .set("X-Branch-Id", B.branchId)
      .set("X-Business-Id", B.businessId)
      .set("Authorization", "Bearer not-a-real-jwt")
      .set("X-Device-Token", B.deviceToken)
      .expect(200);
    expect(res.body.data.cafe.name).toBe("Café A");
    expect(res.body.data.table).toEqual({ number: 7, label: "Terrace 7" });
    expect(res.body.data.ordering).toMatchObject({ open: true, reason: null });
    expect(res.body.data.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("serves server-renderable welcome info without starting a session", async () => {
    const res = await http().get(`/api/public/t/${A.tableToken}/info`).expect(200);
    expect(res.body.data).toMatchObject({ cafe: { name: "Café A" }, table: { number: 7 }, ordering: { open: true } });
    expect(res.body.data.session).toBeUndefined();
    expect(res.headers["cache-control"]).toMatch(/max-age=30/);
    await http().get(`/api/public/t/${generateQrToken()}/info`).expect(404);
  });

  it("returns a friendly 404 for unknown or malformed tokens", async () => {
    const res = await http().get(`/api/public/t/${generateQrToken()}`).expect(404);
    expect(res.body.message).toMatch(/QR code isn't working/);
    await http().get(`/api/public/t/short`).expect(404);
  });

  it("rotating a token kills the old one immediately", async () => {
    const f = await seedBranch({ businessId: A.businessId });
    await http().get(`/api/public/t/${f.tableToken}`).expect(200);
    const fresh = generateQrToken();
    await db.update(diningTables).set({ qr_token: fresh }).where(eq(diningTables.qr_token, f.tableToken));
    await http().get(`/api/public/t/${f.tableToken}`).expect(404);
    await http().get(`/api/public/t/${fresh}`).expect(200);
  });

  it("resumes the same session on reload", async () => {
    const s = await startSession(A.tableToken);
    const again = await http().get(`/api/public/t/${A.tableToken}`).set("X-Customer-Session", s).expect(200);
    expect(again.body.data.session.token).toBe(s);
    // ...but a session from another table is never reused
    const other = await http().get(`/api/public/t/${B.tableToken}`).set("X-Customer-Session", s).expect(200);
    expect(other.body.data.session.token).not.toBe(s);
  });

  it("explains why ordering is closed", async () => {
    const off = await http().get(`/api/public/t/${A.offTableToken}`).expect(200);
    expect(off.body.data.ordering).toMatchObject({ open: false, reason: "table_off" });
    expect(off.body.data.cafe.phone).toBe("+251 911 000 000");

    const closed = await seedBranch({ businessId: A.businessId, qrEnabled: false });
    const r = await http().get(`/api/public/t/${closed.tableToken}`).expect(200);
    expect(r.body.data.ordering.reason).toBe("not_available");
    const s = r.body.data.session.token;
    const res = await placeOrder(closed.tableToken, s, { items: [{ menu_item_id: closed.items.tea, quantity: 1 }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ordering_closed");
  });

  it("CORS on /api/public only allows the web origin", async () => {
    const ok = await http().options(`/api/public/t/${A.tableToken}`).set("Origin", ORIGIN).set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const bad = await http().options(`/api/public/t/${A.tableToken}`).set("Origin", "https://evil.example").set("Access-Control-Request-Method", "GET");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    // Staff routes keep their existing policy.
    const staff = await http().options(`/api/orders`).set("Origin", "https://pos.example").set("Access-Control-Request-Method", "GET");
    expect(staff.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("menu", () => {
  it("is grouped, guest-safe and cacheable", async () => {
    const res = await http().get(`/api/public/t/${A.tableToken}/menu`).expect(200);
    const menu = res.body.data;
    expect(menu.sections.map((s: { name: string }) => s.name)).toEqual(["Drinks", "Food", "Juice"]);
    const drinks = menu.sections[0];
    expect(drinks.groups[0].name).toBe("Hot drinks");
    const macchiato = drinks.groups[0].items.find((i: { name: string }) => i.name === "Macchiato");
    expect(macchiato).toEqual({
      id: A.items.macchiato,
      name: "Macchiato",
      description: "Espresso with a little foam",
      price: 60,
      image_url: null,
      prep_minutes: 5,
      availability: "in_stock",
      popular: false,
      note_presets: ["No sugar", "Extra hot"],
    });
    const all = JSON.stringify(menu);
    expect(all).not.toContain("Old special"); // unavailable items are hidden
    expect(all).not.toMatch(/"sku"|"barcode"|"cost"|"recipe"|"makeable"|"branch_id"|"business_id"/);

    const etag = res.headers.etag;
    expect(etag).toBeTruthy();
    await http().get(`/api/public/t/${A.tableToken}/menu`).set("If-None-Match", etag).expect(304);
  });

  it("never returns another branch's menu, even when the headers ask for it", async () => {
    const res = await http()
      .get(`/api/public/t/${A.tableToken}/menu`)
      .set("X-Branch-Id", B.branchId)
      .set("X-Device-Token", B.deviceToken)
      .expect(200);
    const ids = JSON.stringify(res.body.data);
    for (const id of Object.values(B.items)) expect(ids).not.toContain(id);
    expect(ids).toContain(A.items.macchiato);
  });

  it("shows sold-out and low stock from inventory", async () => {
    jest.spyOn(app.get(InventoryService), "menuAvailability").mockResolvedValue([
      { menu_item_id: A.items.firfir, makeable: 0, status: "out" },
      { menu_item_id: A.items.tea, makeable: 2, status: "low" },
    ] as never);
    const res = await http().get(`/api/public/t/${A.tableToken}/menu`).expect(200);
    const items = res.body.data.sections.flatMap((s: { groups: Array<{ items: unknown[] }> }) => s.groups.flatMap((g) => g.items));
    expect(items.find((i: { id: string }) => i.id === A.items.firfir).availability).toBe("out");
    expect(items.find((i: { id: string }) => i.id === A.items.tea).availability).toBe("low");
  });

  it("hides prices when the owner turns them off", async () => {
    const f = await seedBranch({ businessId: A.businessId });
    await setBranchSetting(f, QR_SETTING_KEYS.showPrices, "false");
    const res = await http().get(`/api/public/t/${f.tableToken}/menu`).expect(200);
    expect(JSON.stringify(res.body.data)).not.toMatch(/"price":\d/);
  });
});

describe("placing an order", () => {
  it("recomputes every price on the server and creates a normal pending QR order", async () => {
    const s = await startSession(A.tableToken);
    const res = await placeOrder(A.tableToken, s, {
      items: [
        { menu_item_id: A.items.macchiato, quantity: 2, note: "<b>No sugar</b>", unit_price: 1, subtotal: 2 },
        { menu_item_id: A.items.firfir, quantity: 1, note: "Extra spicy" },
      ],
      total_amount: 3,
      order_note: "We're in a hurry",
      customer_name: "Abebe",
      customer_phone: "+251 911 234 567",
    }).expect(201);

    const o = res.body.data.order;
    expect(o).toMatchObject({ table_number: 7, stage: "sent", paid: false, total: 270, customer_name: "Abebe", can_add_items: true });
    expect(o.order_number).toBeGreaterThan(0);
    expect(res.body.data.payment.auto).toMatchObject({ provider: "counter", instructions: `Pay at the counter. Show your order number #${o.order_number}.` });

    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row).toMatchObject({
      source: "qr",
      status: "pending",
      table_number: 7,
      total_amount: 270,
      waiter_id: null,
      employee_id: null,
      branch_id: A.branchId,
      notes: "We're in a hurry",
    });
    expect(row.payment_status).toBeNull();
    expect(row.meta).toMatchObject({ customer_name: "Abebe", customer_phone: "+251 911 234 567", qr_table_label: "Terrace 7" });
    const lines = await db.select().from(order_items).where(eq(order_items.order_id, o.id));
    const mac = lines.find((l) => l.menu_item_id === A.items.macchiato)!;
    expect(mac).toMatchObject({ unit_price: 60, subtotal: 120, quantity: 2, main_category: "barista", item_type: "beverage", note: "No sugar" });
    const food = lines.find((l) => l.menu_item_id === A.items.firfir)!;
    expect(food).toMatchObject({ unit_price: 150, main_category: "kitchen", item_type: "food", note: "Extra spicy" });
  });

  it("prices a QR order exactly like a waiter order for the same items", async () => {
    const s = await startSession(A.tableToken);
    const qr = await placeOrder(A.tableToken, s, {
      items: [{ menu_item_id: A.items.macchiato, quantity: 3 }, { menu_item_id: A.items.tea, quantity: 1 }],
    }).expect(201);

    // What the waiter screen sends today (parseFloat(menu.price), toFixed total).
    const waiter = await http()
      .post("/api/orders/cafe")
      .set("X-Device-Token", A.deviceToken)
      .send({
        employee_id: A.waiterId,
        waiter_id: A.waiterId,
        created_by_id: A.waiterId,
        type: "cafe",
        table_number: 3,
        items: [
          { menu_item_id: A.items.macchiato, menu_item_name: "Macchiato", quantity: 3, unit_price: parseFloat("60.00"), subtotal: 180, main_category: "barista", item_type: "beverage" },
          { menu_item_id: A.items.tea, menu_item_name: "Spris tea", quantity: 1, unit_price: parseFloat("35.00"), subtotal: 35, main_category: "barista", item_type: "beverage" },
        ],
        total_amount: parseFloat((180 + 35).toFixed(2)),
      })
      .expect(201);

    const pick = async (orderId: string) =>
      (await db.select().from(order_items).where(eq(order_items.order_id, orderId)))
        .map((l) => [l.menu_item_id, l.unit_price, l.subtotal, l.main_category, l.item_type])
        .sort();
    expect(await pick(qr.body.data.order.id)).toEqual(await pick(waiter.body.data.order.id));
    expect(qr.body.data.order.total).toBe(waiter.body.data.order.total_amount);
    expect(waiter.body.data.order.source).toBe("waiter");
  });

  it("is idempotent on client_order_id for the same session", async () => {
    const s = await startSession(A.tableToken);
    const body = { client_order_id: randomUUID(), items: [{ menu_item_id: A.items.tea, quantity: 1 }] };
    const first = await placeOrder(A.tableToken, s, body).expect(201);
    const second = await placeOrder(A.tableToken, s, body).expect(201);
    expect(second.body.data.replay).toBe(true);
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect(second.body.data.order.order_number).toBe(first.body.data.order.order_number);
    const rows = await db.select().from(orders).where(eq(orders.id, body.client_order_id));
    expect(rows).toHaveLength(1);
  });

  it("concurrent double-submit creates exactly one order", async () => {
    const s = await startSession(A.tableToken);
    const body = { client_order_id: randomUUID(), items: [{ menu_item_id: A.items.tea, quantity: 1 }] };
    const [r1, r2] = await Promise.all([placeOrder(A.tableToken, s, body), placeOrder(A.tableToken, s, body)]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.body.data.order.id).toBe(r2.body.data.order.id);
    expect(await db.select().from(orders).where(eq(orders.id, body.client_order_id))).toHaveLength(1);
  });

  it("treats a client_order_id from another session or branch as an error, never a replay", async () => {
    const s1 = await startSession(A.tableToken);
    const s2 = await startSession(A.tableToken);
    const body = { client_order_id: randomUUID(), items: [{ menu_item_id: A.items.tea, quantity: 1 }] };
    await placeOrder(A.tableToken, s1, body).expect(201);
    const other = await placeOrder(A.tableToken, s2, body);
    expect(other.status).toBe(409);
    expect(JSON.stringify(other.body)).not.toContain(body.client_order_id);

    const sB = await startSession(B.tableToken);
    const cross = await placeOrder(B.tableToken, sB, { ...body, items: [{ menu_item_id: B.items.tea, quantity: 1 }] });
    expect(cross.status).toBe(409);

    // An existing staff order id can't be "replayed" by a guest either.
    const [staff] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.branch_id, A.branchId), eq(orders.source, "waiter"))).limit(1);
    const hijack = await placeOrder(A.tableToken, s1, { client_order_id: staff.id, items: [{ menu_item_id: A.items.tea, quantity: 1 }] });
    expect(hijack.status).toBe(409);
  });

  it("rejects bad input with plain messages", async () => {
    const s = await startSession(A.tableToken);
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ client_order_id: "not-a-uuid", items: [{ menu_item_id: A.items.tea, quantity: 1 }] }, /try again/],
      [{ items: [{ menu_item_id: A.items.tea, quantity: 0 }] }, /between 1 and 50/],
      [{ items: [{ menu_item_id: A.items.tea, quantity: 51 }] }, /between 1 and 50/],
      [{ items: [{ menu_item_id: A.items.tea, quantity: 1, note: "x".repeat(201) }] }, /200/],
      [{ items: [] }, /at least one item/],
    ];
    for (const [body, msg] of cases) {
      const res = await placeOrder(A.tableToken, s, body);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(msg);
    }
    // Every POST counts toward the per-session order limit, rejected or not.
    resetRateLimits(app);
    await setBranchSetting(A, QR_SETTING_KEYS.maxItemsPerOrder, "3");
    try {
      const big = await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.tea, quantity: 4 }] });
      expect(big.status).toBe(400);
      expect(big.body.message).toMatch(/up to 3/);
    } finally {
      await setBranchSetting(A, QR_SETTING_KEYS.maxItemsPerOrder, "30");
    }
  });

  it("refuses unavailable, other-branch, sold-out and fractional-price items as one diff", async () => {
    const s = await startSession(A.tableToken);
    jest.spyOn(app.get(InventoryService), "menuAvailability").mockResolvedValue([
      { menu_item_id: A.items.firfir, makeable: 0, status: "out" },
    ] as never);
    const res = await placeOrder(A.tableToken, s, {
      items: [
        { menu_item_id: A.items.hidden, quantity: 1 },
        { menu_item_id: B.items.macchiato, quantity: 1 },
        { menu_item_id: A.items.firfir, quantity: 1 },
        { menu_item_id: A.items.juice, quantity: 1 },
        { menu_item_id: A.items.macchiato, quantity: 1, seen_price: 55 },
        { menu_item_id: A.items.tea, quantity: 1, seen_price: 35 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("menu_changed");
    const reasons = Object.fromEntries(res.body.changes.map((c: { menu_item_id: string; reason: string }) => [c.menu_item_id, c.reason]));
    expect(reasons).toEqual({
      [A.items.hidden]: "unavailable",
      [B.items.macchiato]: "unavailable",
      [A.items.firfir]: "sold_out",
      [A.items.juice]: "unavailable",
      [A.items.macchiato]: "price_changed",
    });
    expect(res.body.changes.find((c: { reason: string }) => c.reason === "price_changed").price).toBe(60);
    // B's item name never leaks through the diff
    expect(JSON.stringify(res.body)).not.toContain("Café B");
  });

  it("needs a valid session for this table", async () => {
    const res = await placeOrder(A.tableToken, "bogus-session-token-xxxxxxxxx", { items: [{ menu_item_id: A.items.tea, quantity: 1 }] });
    expect(res.status).toBe(401);
    const sB = await startSession(B.tableToken);
    const wrongTable = await placeOrder(A.tableToken, sB, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] });
    expect(wrongTable.status).toBe(401);
  });

  it("rate-limits orders per session with a friendly 429", async () => {
    const s = await startSession(A.tableToken);
    for (let i = 0; i < 5; i++) {
      await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] }).expect(201);
    }
    const res = await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/wait a few minutes/);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rate-limits menu reads per IP", async () => {
    for (let i = 0; i < 30; i++) await http().get(`/api/public/t/${A.tableToken}/menu`).expect(200);
    await http().get(`/api/public/t/${A.tableToken}/menu`).expect(429);
  });
});

describe("the guest's own orders", () => {
  it("lists only this session's orders", async () => {
    const s1 = await startSession(A.tableToken);
    const s2 = await startSession(A.tableToken);
    const mine = await placeOrder(A.tableToken, s1, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] }).expect(201);
    await placeOrder(A.tableToken, s2, { items: [{ menu_item_id: A.items.tea, quantity: 2 }] }).expect(201);
    const res = await http().get(`/api/public/t/${A.tableToken}/orders`).set("X-Customer-Session", s1).expect(200);
    expect(res.body.data.orders.map((o: { id: string }) => o.id)).toEqual([mine.body.data.order.id]);
  });

  it("adds items idempotently, keeps their notes, and records only the new items", async () => {
    const s = await startSession(A.tableToken);
    const created = await placeOrder(A.tableToken, s, {
      items: [{ menu_item_id: A.items.macchiato, quantity: 1, note: "Extra hot" }],
    }).expect(201);
    const orderId = created.body.data.order.id;
    const additionId = randomUUID();
    const add = () =>
      http()
        .post(`/api/public/t/${A.tableToken}/orders/${orderId}/items`)
        .set("X-Customer-Session", s)
        .send({
          addition_id: additionId,
          items: [
            { menu_item_id: A.items.macchiato, quantity: 1, note: "No sugar" },
            { menu_item_id: A.items.macchiato, quantity: 2, note: "Extra hot" },
          ],
        });
    const r1 = await add().expect(201);
    const r2 = await add().expect(201);
    expect(r2.body.data.order.total).toBe(r1.body.data.order.total);
    expect(r1.body.data.order.total).toBe(240);

    const lines = await db.select().from(order_items).where(eq(order_items.order_id, orderId));
    const byNote = Object.fromEntries(lines.map((l) => [l.note, l.quantity]));
    expect(byNote).toEqual({ "Extra hot": 3, "No sugar": 1 });

    const additions = await db.select().from(order_item_additions).where(eq(order_item_additions.order_id, orderId));
    expect(additions).toHaveLength(1);
    expect(additions[0].items).toEqual([
      expect.objectContaining({ menu_item_id: A.items.macchiato, quantity: 1, note: "No sugar", main_category: "barista" }),
      expect.objectContaining({ menu_item_id: A.items.macchiato, quantity: 2, note: "Extra hot" }),
    ]);
  });

  it("can't add to someone else's order, reuse an addition id elsewhere, or add to a paid order", async () => {
    const s1 = await startSession(A.tableToken);
    const s2 = await startSession(A.tableToken);
    const o1 = (await placeOrder(A.tableToken, s1, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] })).body.data.order;
    const o2 = (await placeOrder(A.tableToken, s2, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] })).body.data.order;
    const addTo = (session: string, id: string, additionId = randomUUID()) =>
      http()
        .post(`/api/public/t/${A.tableToken}/orders/${id}/items`)
        .set("X-Customer-Session", session)
        .send({ addition_id: additionId, items: [{ menu_item_id: A.items.tea, quantity: 1 }] });

    await addTo(s1, o2.id).expect(404);
    const shared = randomUUID();
    await addTo(s2, o2.id, shared).expect(201);
    await addTo(s1, o1.id, shared).expect(409);

    // Cashier settles o1 exactly as today; the guest can no longer add to it.
    await http().post("/api/payments").set("X-Device-Token", A.deviceToken).send({ order_id: o1.id, amount: 35, payment_method: "cash", processed_by: A.cashierId }).expect(201);
    const closed = await addTo(s1, o1.id);
    expect(closed.status).toBe(409);
    expect(closed.body.message).toMatch(/closed/);
    const list = await http().get(`/api/public/t/${A.tableToken}/orders`).set("X-Customer-Session", s1).expect(200);
    expect(list.body.data.orders[0]).toMatchObject({ stage: "served", paid: true, can_add_items: false });
  });
});

describe("reaching the cashier and the POS", () => {
  it("pushes new QR orders to the branch socket and the POS sync pull — and only that branch", async () => {
    const posA = io(`${url}/orders`, { auth: { deviceToken: A.deviceToken }, transports: ["websocket"] });
    const posB = io(`${url}/orders`, { auth: { deviceToken: B.deviceToken }, transports: ["websocket"] });
    await Promise.all([connected(posA), connected(posB)]);
    const leaked: unknown[] = [];
    posB.on("new_order", (p) => leaked.push(p));

    const before = await http().get("/api/sync/changes?since=0&limit=1000").set("X-Device-Token", A.deviceToken).expect(200);
    const cursor = before.body.nextCursor;

    const s = await startSession(A.tableToken);
    const pushed = once<{ order: { id: string; source: string; order_source: string; table_number: number; customer_session_id: string } }>(posA, "new_order");
    const res = await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.firfir, quantity: 1 }] }).expect(201);
    const { order } = await pushed;
    expect(order).toMatchObject({ id: res.body.data.order.id, source: "qr", order_source: "qr", table_number: 7 });

    const pull = await http().get(`/api/sync/changes?since=${cursor}&limit=1000`).set("X-Device-Token", A.deviceToken).expect(200);
    const created = pull.body.events.find((e: { entityId: string; eventType: string }) => e.entityId === order.id && e.eventType === "ORDER_CREATED");
    expect(created.payload).toMatchObject({ source: "qr", status: "pending", table_number: 7 });
    const pullB = await http().get(`/api/sync/changes?since=${cursor}&limit=1000`).set("X-Device-Token", B.deviceToken).expect(200);
    expect(pullB.body.events.some((e: { entityId: string }) => e.entityId === order.id)).toBe(false);

    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toHaveLength(0);
    posA.close();
    posB.close();
  });

  it("shows up in the cashier queue and settles exactly as today", async () => {
    const s = await startSession(A.tableToken);
    const o = (await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.firfir, quantity: 2 }] }).expect(201)).body.data.order;
    const queue = await http().get("/api/orders/cashier-queue").set("X-Device-Token", A.deviceToken).expect(200);
    const list = queue.body.data?.orders ?? queue.body.data;
    expect(JSON.stringify(list)).toContain(o.id);

    await http().post("/api/payments").set("X-Device-Token", A.deviceToken).send({ order_id: o.id, amount: 1, payment_method: "cash", processed_by: A.cashierId }).expect(201);
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row).toMatchObject({ status: "done", payment_status: "paid" });
    const pays = await db.select().from(payments).where(eq(payments.order_id, o.id));
    expect(pays).toHaveLength(1);
    expect(pays[0].amount).toBe(300); // server total, not the 1 the client sent
  });

  it("live-updates only the ordering guest: sent → in the kitchen → served & paid", async () => {
    const s = await startSession(A.tableToken);
    const other = await startSession(A.tableToken);
    const guest = io(`${url}/customer`, { auth: { qrToken: A.tableToken, session: s }, transports: ["websocket"], extraHeaders: { Origin: ORIGIN } });
    const stranger = io(`${url}/customer`, { auth: { qrToken: A.tableToken, session: other }, transports: ["websocket"], extraHeaders: { Origin: ORIGIN } });
    await Promise.all([connected(guest), connected(stranger)]);
    const leaked: unknown[] = [];
    stranger.on("order_updated", (p) => leaked.push(p));

    const firstPush = once<{ order: { stage: string } }>(guest, "order_updated");
    const o = (await placeOrder(A.tableToken, s, { items: [{ menu_item_id: A.items.tea, quantity: 1 }] }).expect(201)).body.data.order;
    expect((await firstPush).order.stage).toBe("sent");

    const printed = once<{ order: { stage: string } }>(guest, "order_updated");
    await http().post(`/api/orders/${o.id}/printed-ack`).set("X-Device-Token", A.deviceToken).expect(201);
    expect((await printed).order.stage).toBe("in_kitchen");
    // A second ack keeps the first timestamp.
    const [{ meta: m1 }] = await db.select({ meta: orders.meta }).from(orders).where(eq(orders.id, o.id));
    await http().post(`/api/orders/${o.id}/printed-ack`).set("X-Device-Token", A.deviceToken).expect(201);
    const [{ meta: m2 }] = await db.select({ meta: orders.meta }).from(orders).where(eq(orders.id, o.id));
    expect((m2 as { printed_at: string }).printed_at).toBe((m1 as { printed_at: string }).printed_at);

    const paid = once<{ order: { stage: string; paid: boolean; items: unknown[] } }>(guest, "order_updated");
    await http().post("/api/payments").set("X-Device-Token", A.deviceToken).send({ order_id: o.id, amount: 35, payment_method: "cash", processed_by: A.cashierId }).expect(201);
    const final = (await paid).order;
    expect(final).toMatchObject({ stage: "served", paid: true });
    expect(JSON.stringify(final)).not.toMatch(/employee|cashier|waiter/);

    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toHaveLength(0);

    // A bad session can't connect at all.
    const intruder = io(`${url}/customer`, { auth: { qrToken: A.tableToken, session: "nope-nope-nope-nope-nope" }, transports: ["websocket"], extraHeaders: { Origin: ORIGIN } });
    await new Promise((r) => intruder.once("disconnect", r));
    guest.close();
    stranger.close();
    intruder.close();
  });

  it("holds QR orders for acceptance when the owner turns that on", async () => {
    const f = await seedBranch({ businessId: A.businessId });
    await setBranchSetting(f, QR_SETTING_KEYS.requireCashierAccept, "true");
    const s = await startSession(f.tableToken);
    const o = (await placeOrder(f.tableToken, s, { items: [{ menu_item_id: f.items.tea, quantity: 1 }] }).expect(201)).body.data.order;
    expect(o.waiting_for_staff).toBe(true);
    const [row] = await db.select({ meta: orders.meta }).from(orders).where(eq(orders.id, o.id));
    expect(row.meta).toMatchObject({ awaiting_accept: true });
    const accepted = await http().post(`/api/orders/${o.id}/accept`).set("X-Device-Token", f.deviceToken).expect(201);
    expect(accepted.body.data.order.meta.awaiting_accept).toBeUndefined();
    expect(accepted.body.data.order.meta.accepted_at).toBeTruthy();
    const events = await db.select().from(syncEvents).where(and(eq(syncEvents.entity_id, o.id), eq(syncEvents.event_type, "ORDER_UPDATED")));
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("assist requests", () => {
  it("reaches the branch, de-duplicates per table, and is rate-limited per session", async () => {
    const pos = io(`${url}/orders`, { auth: { deviceToken: A.deviceToken }, transports: ["websocket"] });
    await connected(pos);
    const s = await startSession(A.tableToken);
    const got = once<{ request: { type: string; table_number: number; table_label: string } }>(pos, "assist_request");
    await http().post(`/api/public/t/${A.tableToken}/assist`).set("X-Customer-Session", s).send({ type: "request_bill" }).expect(200);
    expect((await got).request).toMatchObject({ type: "request_bill", table_number: 7, table_label: "Terrace 7" });

    const again = await http().post(`/api/public/t/${A.tableToken}/assist`).set("X-Customer-Session", s).send({ type: "request_bill" });
    expect(again.status).toBe(429);
    expect(again.body.message).toMatch(/let the staff know/);

    const list = await http().get("/api/orders/assist-requests").set("X-Device-Token", A.deviceToken).expect(200);
    const mine = list.body.data.requests.filter((r: { table_number: number; type: string }) => r.table_number === 7 && r.type === "request_bill");
    expect(mine).toHaveLength(1);
    const dismissed = once<{ id: string }>(pos, "assist_dismissed");
    await http().post(`/api/orders/assist-requests/${mine[0].id}/dismiss`).set("X-Device-Token", A.deviceToken).expect(201);
    expect((await dismissed).id).toBe(mine[0].id);

    const listB = await http().get("/api/orders/assist-requests").set("X-Device-Token", B.deviceToken).expect(200);
    expect(listB.body.data.requests).toHaveLength(0);
    pos.close();
  });
});

describe("waiter flow regression", () => {
  it("add-items by a waiter still merges same-note lines and keeps different notes apart", async () => {
    const created = await http()
      .post("/api/orders/cafe")
      .set("X-Device-Token", A.deviceToken)
      .send({
        employee_id: A.waiterId,
        waiter_id: A.waiterId,
        created_by_id: A.waiterId,
        type: "cafe",
        table_number: 2,
        items: [{ menu_item_id: A.items.macchiato, menu_item_name: "Macchiato", quantity: 1, unit_price: 60, subtotal: 60, main_category: "barista", item_type: "beverage" }],
        total_amount: 60,
      })
      .expect(201);
    const id = created.body.data.order.id;
    expect(created.body.data.order).toMatchObject({ source: "waiter", order_source: "waiter", status: "pending" });

    const add = (note: string | undefined, additionId = randomUUID()) =>
      http()
        .post(`/api/orders/${id}/items`)
        .set("X-Device-Token", A.deviceToken)
        .send({
          updated_by: A.waiterId,
          addition_id: additionId,
          items: [{ menu_item_id: A.items.macchiato, menu_item_name: "Macchiato", quantity: 1, unit_price: 60, subtotal: 60, main_category: "barista", item_type: "beverage", note }],
        });
    await add(undefined).expect(201);
    const rid = randomUUID();
    await add("No sugar", rid).expect(201);
    await add("No sugar", rid).expect(201); // replay
    const lines = await db.select().from(order_items).where(eq(order_items.order_id, id));
    const byNote = Object.fromEntries(lines.map((l) => [l.note ?? "", l.quantity]));
    expect(byNote).toEqual({ "": 2, "No sugar": 1 });
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    expect(row.total_amount).toBe(180);
  });

  it("a cashier-placed order is tagged cashier", async () => {
    const res = await http()
      .post("/api/orders/cafe")
      .set("X-Device-Token", A.deviceToken)
      .send({
        employee_id: A.waiterId,
        waiter_id: A.waiterId,
        created_by_id: A.cashierId,
        type: "cafe",
        table_number: 4,
        items: [{ menu_item_id: A.items.tea, quantity: 1, unit_price: 35, subtotal: 35, main_category: "barista" }],
        total_amount: 35,
      })
      .expect(201);
    expect(res.body.data.order).toMatchObject({ source: "cashier", order_source: "cashier" });
  });

  it("a staff client can't forge source=qr through the normal endpoint", async () => {
    const res = await http()
      .post("/api/orders/cafe")
      .set("X-Device-Token", A.deviceToken)
      .send({ employee_id: A.waiterId, waiter_id: A.waiterId, type: "cafe", table_number: 5, source: "qr", customer_session_id: randomUUID(), items: [], total_amount: 0 })
      .expect(201);
    expect(res.body.data.order.source).toBe("waiter");
    expect(res.body.data.order.customer_session_id).toBeNull();
  });
});
