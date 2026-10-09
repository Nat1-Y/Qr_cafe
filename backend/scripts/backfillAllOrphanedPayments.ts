// Platform-wide reconciliation: every business/branch with orders marked
// status=done/payment_status=paid but zero backing payments row. See
// order.service.ts reconcileOrphanPaidOrders / the LebuCafe incidents this
// mirrors, and scripts/backfillMissingPayments.ts (the single-business
// version this generalizes). Root cause: app/'s local SQLite writes a
// payment row and flips the order to paid as two non-atomic steps; a crash
// or silent write failure between them leaves the order locally "paid" with
// no payment ever created, and that state syncs to the backend permanently.
//
// Same placeholders as the LebuCafe backfill (2026-08-18 conversation):
// method="cash", paid_at=order.created_at. Every row is tagged
// meta.backfilled=true for traceability.
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import { orders, payments, businesses, branches } from "../src/db/tables";

async function backfillAllOrphanedPayments() {
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
        eq(orders.status, "done"),
        eq(orders.payment_status, "paid"),
        isNull(payments.id),
      ),
    );

  const bizRows = await db.select().from(businesses);
  const bizById = new Map(bizRows.map((b) => [b.id, b]));
  const branchRows = await db.select().from(branches);
  const branchById = new Map(branchRows.map((b) => [b.id, b]));

  console.log(`Backfilling ${missing.length} missing payment rows across all businesses...`);

  let inserted = 0;
  let totalAmount = 0;
  const perBranch = new Map<string, { count: number; amount: number }>();

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
          "Order was status=done/payment_status=paid with no payments row; backfilled by scripts/backfillAllOrphanedPayments.ts",
        backfilled_at: new Date().toISOString(),
      },
    });
    inserted += 1;
    totalAmount += order.total_amount ?? 0;
    const key = `${order.business_id}::${order.branch_id}`;
    const agg = perBranch.get(key) ?? { count: 0, amount: 0 };
    agg.count += 1;
    agg.amount += order.total_amount ?? 0;
    perBranch.set(key, agg);
  }

  console.log(`\n✅ Inserted ${inserted} payment rows, total amount ${totalAmount}.\n`);
  console.log("Per business/branch:");
  for (const [key, agg] of perBranch) {
    const [businessId, branchId] = key.split("::");
    const bizName = bizById.get(businessId)?.name ?? "(unknown)";
    const branchName = branchById.get(branchId)?.name ?? "(unknown)";
    console.log(`  ${bizName} / ${branchName}: ${agg.count} orders, ${agg.amount}`);
  }
}

async function run() {
  try {
    await backfillAllOrphanedPayments();
  } catch (err) {
    console.error("❌ Error backfilling payments:", err);
  } finally {
    await pool.end();
  }
}

run();
