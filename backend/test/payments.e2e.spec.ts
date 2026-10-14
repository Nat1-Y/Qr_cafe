import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import { orders, payments, paymentIntents } from "../src/db/tables";
import { PaymentProviderRegistry } from "../src/modules/payment/providers/payment-provider.registry";
import { PaymentIntentsService } from "../src/modules/payment/providers/payment-intents.service";
import type {
  CreateIntentInput,
  CreateIntentResult,
  PaymentIntentStatus,
  PaymentProvider,
  RawRequest,
  WebhookResult,
} from "../src/modules/payment/providers/payment-provider";
import { runWithTenant } from "../src/common/tenant/tenant-context";
import { startApp, resetRateLimits } from "./helpers/app";
import { BranchFixture, seedBranch } from "./helpers/fixtures";

const SECRET = "fake-webhook-secret";
const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

/** Stands in for a real adapter: signs webhooks with HMAC like Chapa does. */
class FakeSignedProvider implements PaymentProvider {
  readonly id = "chapa" as const;
  readonly displayName = "Fake Chapa";
  readonly implemented = true;
  readonly external = true;
  calls = 0;
  async isEnabled() {
    return true;
  }
  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    this.calls++;
    return { status: "pending", providerRef: `ref-${input.intentId}`, checkoutUrl: `https://pay.example/${input.intentId}` };
  }
  async getStatus(): Promise<PaymentIntentStatus> {
    return "pending";
  }
  async handleWebhook(req: RawRequest): Promise<WebhookResult | null> {
    const given = String(req.headers["x-fake-signature"] ?? "");
    const raw = req.rawBody?.toString("utf8") ?? "";
    const expected = sign(raw);
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
    const body = JSON.parse(raw) as { ref: string; status: PaymentIntentStatus };
    return { ref: body.ref, by: "provider_ref", status: body.status };
  }
}

let app: INestApplication;
let A: BranchFixture;
const http = () => request(app.getHttpServer());

async function qrOrder(f: BranchFixture) {
  const s = (await http().get(`/api/public/t/${f.tableToken}`).expect(200)).body.data.session.token;
  const res = await http()
    .post(`/api/public/t/${f.tableToken}/orders`)
    .set("X-Customer-Session", s)
    .send({ client_order_id: randomUUID(), items: [{ menu_item_id: f.items.macchiato, quantity: 2 }] })
    .expect(201);
  return res.body.data as { order: { id: string; order_number: number; total: number; paid: boolean }; payment: { options: Array<{ id: string }>; auto: { provider: string; instructions: string } | null } };
}

function webhook(body: Record<string, unknown>, signature?: string) {
  const raw = JSON.stringify(body);
  return http()
    .post("/api/public/payments/chapa/webhook")
    .set("Content-Type", "application/json")
    .set("x-fake-signature", signature ?? sign(raw))
    .send(raw);
}

beforeAll(async () => {
  ({ app } = await startApp());
  A = await seedBranch();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(() => resetRateLimits(app));

describe("payment providers", () => {
  it("only 'Pay at the counter' is on: the pay step is skipped with counter instructions and no money moves", async () => {
    const { order, payment } = await qrOrder(A);
    expect(payment.options).toEqual([{ id: "counter", name: "Pay at the counter" }]);
    expect(payment.auto).toMatchObject({ provider: "counter", intent_id: null, instructions: `Pay at the counter. Show your order number #${order.order_number}.` });
    expect(await db.select().from(paymentIntents).where(eq(paymentIntents.order_id, order.id))).toHaveLength(0);
    expect(await db.select().from(payments).where(eq(payments.order_id, order.id))).toHaveLength(0);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.payment_status).toBeNull();

    const opts = await http().get(`/api/public/t/${A.tableToken}/payment-options`).expect(200);
    expect(opts.body.data.options).toEqual([{ id: "counter", name: "Pay at the counter" }]);
  });

  it("stub providers are disabled and ignore webhooks; unknown providers 404", async () => {
    const reg = app.get(PaymentProviderRegistry);
    const described = await reg.describe(A.branchId);
    expect(described.filter((p) => p.enabled).map((p) => p.id)).toEqual(["counter"]);
    expect(described.find((p) => p.id === "telebirr")).toMatchObject({ available: false, enabled: false });
    const r = await http().post("/api/public/payments/telebirr/webhook").send({ status: "succeeded" });
    expect(r.status).toBe(404); // not implemented → not routable
    await http().post("/api/public/payments/paypal/webhook").send({}).expect(404);
  });

  describe("with a signed provider plugged in", () => {
    const fake = new FakeSignedProvider();
    let original: PaymentProvider | null;

    beforeAll(() => {
      const reg = app.get(PaymentProviderRegistry);
      original = reg.get("chapa");
      reg.register(fake);
    });
    afterAll(() => {
      if (original) app.get(PaymentProviderRegistry).register(original);
    });

    async function startIntent() {
      const { order } = await qrOrder(A);
      const intents = app.get(PaymentIntentsService);
      const started = await runWithTenant(
        { businessId: A.businessId, branchId: A.branchId, scope: "branch" },
        () => intents.start(A.branchId, "chapa", order, "https://cafe.example/t/x"),
      );
      return { order, started };
    }

    it("a replayed webhook never pays twice", async () => {
      const { order, started } = await startIntent();
      expect(started).toMatchObject({ provider: "chapa", status: "pending", checkout_url: expect.stringContaining("pay.example") });
      const ref = `ref-${started.intent_id}`;

      const first = await webhook({ ref, status: "succeeded" }).expect(200);
      expect(first.body).toEqual({ received: true });
      await webhook({ ref, status: "succeeded" }).expect(200);
      await webhook({ ref, status: "failed" }).expect(200); // late contradictory event ignored

      const pays = await db.select().from(payments).where(eq(payments.order_id, order.id));
      expect(pays).toHaveLength(1);
      expect(pays[0]).toMatchObject({ status: "paid", payment_method: "chapa", amount: 120 });
      const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
      expect(o).toMatchObject({ status: "done", payment_status: "paid" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, started.intent_id!));
      expect(intent).toMatchObject({ status: "succeeded", amount_cents: 12000, provider_ref: ref });
    });

    it("five concurrent replays still record exactly one payment", async () => {
      const { order, started } = await startIntent();
      const ref = `ref-${started.intent_id}`;
      await Promise.all(Array.from({ length: 5 }, () => webhook({ ref, status: "succeeded" })));
      expect(await db.select().from(payments).where(eq(payments.order_id, order.id))).toHaveLength(1);
    });

    it("an unsigned or forged webhook changes nothing", async () => {
      const { order, started } = await startIntent();
      const ref = `ref-${started.intent_id}`;
      const forged = await webhook({ ref, status: "succeeded" }, sign("something else"));
      expect(forged.body).toEqual({ received: false });
      expect(await db.select().from(payments).where(eq(payments.order_id, order.id))).toHaveLength(0);
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, started.intent_id!));
      expect(intent.status).toBe("pending");
    });

    it("a cashier paying first makes the provider's success a no-op (no double charge)", async () => {
      const { order, started } = await startIntent();
      await http().post("/api/payments").set("X-Device-Token", A.deviceToken).send({ order_id: order.id, amount: 120, payment_method: "cash", processed_by: A.cashierId }).expect(201);
      await webhook({ ref: `ref-${started.intent_id}`, status: "succeeded" }).expect(200);
      const pays = await db.select().from(payments).where(eq(payments.order_id, order.id));
      expect(pays).toHaveLength(1);
      expect(pays[0].payment_method).toBe("cash");
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, started.intent_id!));
      expect(intent.raw).toMatchObject({ needs_refund: true });
    });
  });
});
