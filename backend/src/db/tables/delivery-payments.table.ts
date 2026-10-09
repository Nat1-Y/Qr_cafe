import {
  pgTable,
  uuid,
  integer,
  text,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { orders } from "./orders.table";
import { deliveryMethods } from "./delivery_methods.table";
import { users } from "./users.table";
import { tenantColumns } from "./_tenant";

// Money tracking for delivery orders — deliberately its own table, mirroring
// `payments`, rather than rows in the shared payments table. A delivery order
// never touches `payments` (no Z-report entry, doesn't count toward cashier
// collected/outstanding totals): money for it is what the courier/platform
// owes or has remitted to the business, which is a different ledger with its
// own settlement timeline. Tracked and reconciled from the Deliveries
// interface only. One order may carry several rows (e.g. a partial cash
// hand-off plus a later platform remittance).
export const deliveryPayments = pgTable(
  "delivery_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    delivery_method_id: uuid("delivery_method_id").references(
      () => deliveryMethods.id,
      { onDelete: "set null" },
    ),
    amount_cents: integer("amount_cents").notNull().default(0),
    // pending | paid | cancelled — same vocabulary as payments.status.
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    // Free-text source of the money (e.g. "Courier cash", "Beu remittance"),
    // distinct from the branch's configured payment_methods — a delivery
    // platform's settlement isn't one of the cashier's in-house methods.
    method: varchar("method", { length: 100 }),
    processed_by: uuid("processed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    paid_at: timestamp("paid_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    branchIdx: index("delivery_payments_branch_id_idx").on(t.branch_id),
    orderIdx: index("delivery_payments_order_id_idx").on(t.order_id),
    paidAtIdx: index("delivery_payments_paid_at_idx").on(t.paid_at),
  })
);
