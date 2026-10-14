import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/drizzle";
import { paymentIntents } from "../../../db/tables/payment-intents.table";
import { orders } from "../../../db/tables/orders.table";
import { runWithTenant } from "../../../common/tenant/tenant-context";
import { PaymentService } from "../payment.service";
import { PaymentProviderRegistry, ProviderOption } from "./payment-provider.registry";
import {
  PaymentIntentStatus,
  RawRequest,
  TERMINAL_INTENT_STATUS,
  birrToCents,
} from "./payment-provider";

export interface CheckoutStart {
  provider: string;
  status: PaymentIntentStatus;
  intent_id: string | null;
  checkout_url: string | null;
  instructions: string | null;
}

/** What the guest's confirmation screen needs about paying. */
export interface CheckoutOptions {
  options: ProviderOption[];
  /** Set when there's exactly one option — the pay step is skipped. */
  auto: CheckoutStart | null;
}

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly registry: PaymentProviderRegistry,
    private readonly payments: PaymentService,
  ) {}

  /** Runs in the order's branch context. */
  async checkoutOptions(
    branchId: string,
    order: { id: string; order_number: number | null; total: number; paid: boolean },
    returnUrl = "",
  ): Promise<CheckoutOptions> {
    const options = await this.registry.enabledOptions(branchId);
    if (order.paid || options.length !== 1) return { options, auto: null };
    const auto = await this.start(branchId, options[0].id, order, returnUrl);
    return { options, auto };
  }

  /** Begin paying an order with one provider. Counter: instructions only, no row. */
  async start(
    branchId: string,
    providerId: string,
    order: { id: string; order_number: number | null; total: number },
    returnUrl: string,
    customer?: { name?: string | null; phone?: string | null },
  ): Promise<CheckoutStart> {
    const provider = this.registry.get(providerId);
    if (!provider || !provider.implemented || !(await provider.isEnabled(branchId))) {
      throw new BadRequestException("That way of paying isn't available here.");
    }
    const amountCents = birrToCents(order.total);
    if (!provider.external) {
      const r = await provider.createIntent({
        intentId: "",
        orderId: order.id,
        orderNumber: order.order_number,
        amountCents,
        currency: "ETB",
        customer,
        returnUrl,
      });
      return { provider: provider.id, status: r.status, intent_id: null, checkout_url: null, instructions: r.instructions ?? null };
    }

    const [orderRow] = await db
      .select({ business_id: orders.business_id })
      .from(orders)
      .where(and(eq(orders.id, order.id), eq(orders.branch_id, branchId)))
      .limit(1);
    if (!orderRow) throw new NotFoundException("We couldn't find that order.");

    const [intent] = await db
      .insert(paymentIntents)
      .values({
        business_id: orderRow.business_id,
        branch_id: branchId,
        order_id: order.id,
        provider: provider.id,
        amount_cents: amountCents,
        currency: "ETB",
        status: "created",
      })
      .returning();
    const r = await provider.createIntent({
      intentId: intent.id,
      orderId: order.id,
      orderNumber: order.order_number,
      amountCents,
      currency: "ETB",
      customer,
      returnUrl,
    });
    await db
      .update(paymentIntents)
      .set({
        status: r.status,
        provider_ref: r.providerRef ?? null,
        checkout_url: r.checkoutUrl ?? null,
        raw: (r.raw ?? null) as object | null,
        updated_at: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id));
    return {
      provider: provider.id,
      status: r.status,
      intent_id: intent.id,
      checkout_url: r.checkoutUrl ?? null,
      instructions: r.instructions ?? null,
    };
  }

  /**
   * Provider webhook. The adapter verifies the signature; anything it can't
   * verify is dropped. Returns whether an intent changed — a replay never does.
   */
  async handleWebhook(providerId: string, req: RawRequest): Promise<{ accepted: boolean; changed: boolean }> {
    const provider = this.registry.get(providerId);
    if (!provider || !provider.implemented) throw new NotFoundException("Unknown payment provider.");
    const result = await provider.handleWebhook(req);
    if (!result) return { accepted: false, changed: false };

    const [intent] = await db
      .select({ id: paymentIntents.id })
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.provider, provider.id),
          result.by === "intent_id"
            ? eq(paymentIntents.id, result.ref)
            : eq(paymentIntents.provider_ref, result.ref),
        ),
      )
      .limit(1);
    if (!intent) return { accepted: false, changed: false };
    const changed = await this.applyStatus(intent.id, result.status, result.raw);
    return { accepted: true, changed };
  }

  /**
   * Move an intent to a new status, at most once into a terminal state. On
   * `succeeded` the money is recorded through PaymentService.create — the
   * cashier's own settle path — so the payments row, payment_status, reports,
   * Z-report and sync all behave exactly like a till payment. Idempotent:
   *   - the intent row is locked and a terminal status is never left, so a
   *     replayed webhook is a no-op;
   *   - PaymentService.create itself refuses a second full payment for an
   *     order, so even a crash between the two writes can't double-pay.
   */
  async applyStatus(intentId: string, status: PaymentIntentStatus, raw?: unknown): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [intent] = await tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, intentId))
        .for("update");
      if (!intent) return false;
      if (TERMINAL_INTENT_STATUS.has(intent.status as PaymentIntentStatus)) return false;
      if (intent.status === status) return false;

      let extraRaw: Record<string, unknown> = {};
      if (status === "succeeded") {
        const [order] = await tx
          .select({
            total: orders.total_amount,
            business_id: orders.business_id,
            payment_status: orders.payment_status,
          })
          .from(orders)
          .where(eq(orders.id, intent.order_id))
          .limit(1);
        if (order?.payment_status === "paid") {
          // Paid at the till before the provider confirmed: the ledger keeps
          // one payment (PaymentService.create no-ops), but the guest was
          // charged twice — flag it so the owner can refund.
          extraRaw = { needs_refund: true, reason: "order_already_paid" };
          this.logger.warn(`Intent ${intentId} succeeded on an already-paid order ${intent.order_id}; flagged for refund.`);
        }
        await runWithTenant(
          {
            businessId: intent.business_id,
            branchId: intent.branch_id,
            scope: "branch",
            userId: null,
            username: null,
            role: null,
          },
          () =>
            this.payments.create({
              order_id: intent.order_id,
              amount: Number(order?.total ?? 0),
              payment_method: intent.provider,
              processed_by: null,
              description: `Paid online (${this.registry.get(intent.provider)?.displayName ?? intent.provider})`,
            }),
        );
      }

      await tx
        .update(paymentIntents)
        .set({
          status,
          raw: {
            ...((raw ?? intent.raw ?? {}) as Record<string, unknown>),
            ...extraRaw,
          },
          updated_at: new Date(),
        })
        .where(eq(paymentIntents.id, intentId));
      this.logger.log(`Payment intent ${intentId}: ${intent.status} → ${status}`);
      return true;
    });
  }
}
