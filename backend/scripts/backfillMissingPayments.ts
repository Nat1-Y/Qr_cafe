// One-off reconciliation for business 64fc581e-3887-4c91-9af2-84dd9655fe7c
// (LebuCafe): 108 orders were flipped to status=done/payment_status=paid
// (in 5 batches sharing identical updated_at timestamps — some bulk
// operation bypassed the normal payment.service.ts create() path) without
// ever getting a row in `payments`. This inserts a payment row for each,
// tagged with meta.backfilled so they stay distinguishable from real
// till-recorded payments. Real method/processed-by/paid-at were never
// captured, so this uses agreed placeholders (see conversation 2026-08-18):
// method="cash", paid_at=order.created_at.
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import { orders, payments } from "../src/db/tables";

const BUSINESS_ID = "64fc581e-3887-4c91-9af2-84dd9655fe7c";

async function backfillMissingPayments() {
  const missing = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      business_id: orders.business_id,
      branch_id: orders.branch_id,
      total_amount: orders.total_amount,
      created_at: orders.created_at,
      cashier_id: orders.cashier_id,
      waiter_id: orders.waiter_id,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.order_id, orders.id))
    .where(
      and(
        eq(orders.business_id, BUSINESS_ID),
        eq(orders.status, "done"),
        eq(orders.payment_status, "paid"),
        isNull(payments.id),
      ),
    );

  console.log(`Backfilling ${missing.length} missing payment rows...`);

  let inserted = 0;
  let totalAmount = 0;
  // Sequential, not db.transaction() — this project's pooled connections
  // don't support transactions reliably (see local-db-no-transactions).
  for (const order of missing) {
    await db.insert(payments).values({
      business_id: order.business_id,
      branch_id: order.branch_id,
      order_id: order.id,
      amount: order.total_amount,
      amount_cents: order.total_amount,
      method: "cash",
      payment_method: "cash",
      status: "paid",
      processed_by: order.cashier_id ?? order.waiter_id ?? null,
      paid_at: order.created_at ?? new Date(),
      description: null,
      meta: {
        backfilled: true,
        reason:
          "Order was status=done/payment_status=paid with no payments row; backfilled by scripts/backfillMissingPayments.ts",
        backfilled_at: new Date().toISOString(),
      },
    });
    inserted += 1;
    totalAmount += order.total_amount ?? 0;
    console.log(`  order #${order.order_number} (${order.id}) -> +${order.total_amount}`);
  }

  console.log(`✅ Inserted ${inserted} payment rows, total amount ${totalAmount}.`);
}

async function run() {
  try {
    await backfillMissingPayments();
  } catch (err) {
    console.error("❌ Error backfilling payments:", err);
  } finally {
    await pool.end();
  }
}

run();
