import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { diningTables } from "./dining-tables.table";
import { tenantColumns } from "./_tenant";

// One row per QR scan ("a guest at a table"). No account behind it — the
// browser keeps the raw token, we keep only its hash. Lets a guest see and add
// to *their own* orders after a reload, and gives the rate limiter a key.
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    table_id: uuid("table_id")
      .notNull()
      .references(() => diningTables.id, { onDelete: "cascade" }),
    token_hash: varchar("token_hash", { length: 64 }).notNull(),
    user_agent_hash: varchar("user_agent_hash", { length: 64 }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    last_seen_at: timestamp("last_seen_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("customer_sessions_token_hash_idx").on(t.token_hash),
    index("customer_sessions_branch_table_idx").on(t.branch_id, t.table_id),
  ],
);
