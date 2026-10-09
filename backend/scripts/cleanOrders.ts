import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import { orders, payments } from "../src/db/tables";

async function cleanOrders() {
  try {
    // amount_mismatch is written into payments.meta (see order.service.ts /
    // payment.service.ts create()), not orders.meta — an order never gets
    // this key, so filtering on `orders.meta` always came back empty.
    const flagged = await db
      .select({ order: orders, payment: payments })
      .from(payments)
      .innerJoin(orders, eq(payments.order_id, orders.id))
      .where(
        sql`${orders.total_amount} <> ${payments.amount_cents} AND ${orders.business_id} = ${"64fc581e-3887-4c91-9af2-84dd9655fe7c"}`,
      );

    console.log(flagged[0], flagged.length);

    // await db.transaction(async (tx) => {
    //   for (const { payment, order } of flagged) {
    //     await tx
    //       .update(payments)
    //       .set({
    //         amount_cents: order.total_amount,
    //         amount: order.total_amount,
    //       })
    //       .where(eq(payments.id, payment.id));
    //   }
    // });
    // console.log("✅ Deleted flagged orders.");
  } catch (err) {
    console.error("❌ Error cleaning orders:", err);
  }
}

async function run() {
  try {
    await cleanOrders();
  } finally {
    await pool.end();
  }
}

run();
