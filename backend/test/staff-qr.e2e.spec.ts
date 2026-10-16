import { randomUUID } from "crypto";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { io } from "socket.io-client";
import { db, pool } from "../src/db/drizzle";
import { diningTables } from "../src/db/tables";
import { startApp, resetRateLimits } from "./helpers/app";
import { BranchFixture, seedBranch, setBranchSetting } from "./helpers/fixtures";

let app: INestApplication;
let url: string;
let A: BranchFixture;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  ({ app, url } = await startApp());
  A = await seedBranch();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(() => resetRateLimits(app));

async function tableRow(token: string) {
  const [row] = await db.select().from(diningTables).where(eq(diningTables.qr_token, token));
  return row;
}

describe("owner table QR controls", () => {
  it("making a new QR code kills the old one", async () => {
    const t = await tableRow(A.tableToken);
    const res = await http().post(`/api/tables/${t.id}/rotate-qr`).set("X-Device-Token", A.deviceToken).expect(201);
    const fresh = res.body.data.table.qr_token as string;
    expect(fresh).not.toBe(A.tableToken);
    expect(res.body.data.table.qr_rotated_at).toBeTruthy();
    await http().get(`/api/public/t/${A.tableToken}`).expect(404);
    await http().get(`/api/public/t/${fresh}`).expect(200);
    A.tableToken = fresh;
  });

  it("sets a label and turns QR ordering off for one table", async () => {
    const t = await tableRow(A.tableToken);
    await http()
      .put(`/api/tables/${t.id}`)
      .set("X-Device-Token", A.deviceToken)
      .send({ label: "  <b>Garden</b>  4 ", qr_enabled: false })
      .expect(200);
    const after = await tableRow(A.tableToken);
    expect(after).toMatchObject({ label: "Garden 4", qr_enabled: false, table_number: t.table_number });
    const landing = await http().get(`/api/public/t/${A.tableToken}`).expect(200);
    expect(landing.body.data.ordering.reason).toBe("table_off");
    await http().put(`/api/tables/${t.id}`).set("X-Device-Token", A.deviceToken).send({ qr_enabled: true, label: "" }).expect(200);
    expect((await tableRow(A.tableToken)).label).toBeNull();
  });

  it("the desktop's table sync can't touch tokens", async () => {
    const t = await tableRow(A.tableToken);
    await http()
      .post("/api/tables/sync")
      .set("X-Device-Token", A.deviceToken)
      .send({ tables: [{ id: t.id, table_number: t.table_number, qr_token: "hijack", status: "occupied" }] })
      .expect(201);
    expect((await tableRow(A.tableToken)).status).toBe("occupied");
  });
});

describe("QR settings", () => {
  it("reads defaults, saves changes and validates", async () => {
    const get = await http().get("/api/settings/qr").set("X-Device-Token", A.deviceToken).expect(200);
    expect(get.body.data.settings).toMatchObject({ enabled: true, showPrices: true, maxItemsPerOrder: 30, autoPrint: true });
    expect(get.body.data.providers.map((p: { id: string; enabled: boolean }) => [p.id, p.enabled])).toEqual(
      expect.arrayContaining([["counter", true], ["telebirr", false], ["chapa", false], ["cbe_birr", false]]),
    );

    const put = await http()
      .put("/api/settings/qr")
      .set("X-Device-Token", A.deviceToken)
      .send({ welcomeMessage: "<i>Selam!</i>", maxItemsPerOrder: 12, orderingHours: { open: "07:00", close: "22:30" }, allowNotes: false })
      .expect(200);
    expect(put.body.data.settings).toMatchObject({
      welcomeMessage: "Selam!",
      maxItemsPerOrder: 12,
      orderingHours: { open: "07:00", close: "22:30" },
      allowNotes: false,
    });
    await http().put("/api/settings/qr").set("X-Device-Token", A.deviceToken).send({ maxItemsPerOrder: 0 }).expect(400);
    await http().put("/api/settings/qr").set("X-Device-Token", A.deviceToken).send({ orderingHours: { open: "7am", close: "x" } }).expect(400);
    await http().put("/api/settings/qr").set("X-Device-Token", A.deviceToken).send({ enabled: "yes" }).expect(400);
    await http().put("/api/settings/qr").set("X-Device-Token", A.deviceToken).send({ orderingHours: null, allowNotes: true }).expect(200);
  });

  it("warns about sections with no printer", async () => {
    await setBranchSetting(A, "printer_department_routing", JSON.stringify({ barista: "Barista printer", kitchen: { printer: "", stations: [{ printer: "Kitchen 1" }] } }));
    const res = await http().get("/api/settings/qr").set("X-Device-Token", A.deviceToken).expect(200);
    const byKey = Object.fromEntries(res.body.data.sections.map((s: { key: string; routed: boolean; printer: string | null }) => [s.key, [s.routed, s.printer]]));
    expect(byKey).toEqual({ barista: [true, "Barista printer"], kitchen: [true, "Kitchen 1"], juice: [false, null] });
  });

  it("asks the POS to print a test ticket", async () => {
    const pos = io(`${url}/orders`, { auth: { deviceToken: A.deviceToken }, transports: ["websocket"] });
    await new Promise<void>((resolve) => pos.once("connect", () => resolve()));
    const got = new Promise<{ section: string }>((resolve) => pos.once("qr_test_ticket", resolve));
    await http().post("/api/settings/qr/test-ticket").set("X-Device-Token", A.deviceToken).send({ section: "Juice" }).expect(201);
    expect(await got).toEqual({ section: "juice" });
    pos.close();
  });
});

describe("waiters assigned to tables", () => {
  it("assigns a waiter, rejects another branch's user, and attributes QR orders", async () => {
    const B = await seedBranch({ businessId: A.businessId });
    const t8 = await tableRow(A.offTableToken);
    await http().put(`/api/tables/${t8.id}`).set("X-Device-Token", A.deviceToken).send({ assigned_waiter_id: B.waiterId }).expect(400);
    await http().put(`/api/tables/${t8.id}`).set("X-Device-Token", A.deviceToken).send({ assigned_waiter_id: A.waiterId, qr_enabled: true }).expect(200);

    const list = await http().get("/api/tables").set("X-Device-Token", A.deviceToken).expect(200);
    const row = list.body.data.tables.find((t: { id: string }) => t.id === t8.id);
    expect(row).toMatchObject({ assigned_waiter_id: A.waiterId, assigned_waiter_name: "Waiter W" });

    // Order from it: attributed to the waiter, visible in the cashier queue with their name.
    const s = (await http().get(`/api/public/t/${A.offTableToken}`).expect(200)).body.data.session.token;
    const placed = await http()
      .post(`/api/public/t/${A.offTableToken}/orders`)
      .set("X-Customer-Session", s)
      .send({ client_order_id: randomUUID(), items: [{ menu_item_id: A.items.tea, quantity: 1 }] })
      .expect(201);
    const order = await http().get(`/api/orders/${placed.body.data.order.id}`).set("X-Device-Token", A.deviceToken).expect(200);
    const o = order.body.data?.order ?? order.body.data;
    expect(o).toMatchObject({ source: "qr", waiter_id: A.waiterId, employee_name: "Waiter W" });

    // Unassign: the next QR order has no waiter.
    await http().put(`/api/tables/${t8.id}`).set("X-Device-Token", A.deviceToken).send({ assigned_waiter_id: "" }).expect(200);
    resetRateLimits(app);
    const placed2 = await http()
      .post(`/api/public/t/${A.offTableToken}/orders`)
      .set("X-Customer-Session", s)
      .send({ client_order_id: randomUUID(), items: [{ menu_item_id: A.items.tea, quantity: 1 }] })
      .expect(201);
    const o2 = (await http().get(`/api/orders/${placed2.body.data.order.id}`).set("X-Device-Token", A.deviceToken).expect(200)).body.data;
    expect((o2.order ?? o2).waiter_id).toBeNull();
  });
});
