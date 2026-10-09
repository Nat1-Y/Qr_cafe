import {
  pgTable,
  uuid,
  numeric,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.table";
import { org_credit_payments } from "./org-credit-payments.table";
import { orders } from "./orders.table";
import { tenantColumns } from "./_tenant";

/**
 * Records service-usage deductions from an organization's credit balance.
 * `services` is a JSON array of { description: string; cost: number } objects.
 */
export const org_credit_transactions = pgTable(
  "org_credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Optional: link this transaction to a specific payment top-up */
    payment_id: uuid("payment_id").references(() => org_credit_payments.id, {
      onDelete: "set null",
    }),
    /**
     * Set only for transactions auto-generated when the owner confirms a real
     * POS order attributed to this organization (order.service.ts's
     * confirmOrganizationOrderPayment) — never for manual/ad-hoc service-usage
     * entries recorded by an admin. The order itself carries organization_id
     * from the moment it's placed, but this row — and the credit_balance
     * deduction it represents — is only created once the owner confirms, not
     * at order creation. Unique so confirming the same order twice (a retry,
     * a race) can't double-charge it.
     */
    order_id: uuid("order_id")
      .references(() => orders.id, { onDelete: "set null" })
      .unique(),
    transaction_date: timestamp("transaction_date").defaultNow().notNull(),
    notes: text("notes"),
    /**
     * Array of services consumed: [{ description: string, cost: number }, ...]
     */
    services: jsonb("services").default([]).notNull(),
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    orgIdx: index("org_credit_txn_org_idx").on(table.organization_id),
    paymentIdx: index("org_credit_txn_payment_idx").on(table.payment_id),
    orderIdx: index("org_credit_txn_order_idx").on(table.order_id),
  }),
);
