import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orders } from "./orders.table";
import { tenantColumns } from "./_tenant";

// An attempt to collect an order's money through a payment provider (Telebirr,
// Chapa, ...). Unused while only "pay at the counter" is enabled. When an intent
// succeeds, the normal `payments` row is still written through
// PaymentService.create — this table is the provider-side audit trail, never
// the ledger.
//
// amount_cents is real cents (1 ETB = 100). Orders/payments store whole birr,
// so convert at the boundary.
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    amount_cents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("ETB").notNull(),
    // created | pending | succeeded | failed | cancelled | expired
    status: varchar("status", { length: 20 }).default("created").notNull(),
    provider_ref: varchar("provider_ref", { length: 128 }),
    checkout_url: text("checkout_url"),
    raw: jsonb("raw"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // NULL provider_refs don't collide (Postgres treats NULLs as distinct).
    uniqueIndex("payment_intents_provider_ref_idx").on(t.provider, t.provider_ref),
    index("payment_intents_order_id_idx").on(t.order_id),
  ],
);
