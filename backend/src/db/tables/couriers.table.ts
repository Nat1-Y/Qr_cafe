import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "./_tenant";

// Owner-configured courier profiles a branch regularly hands deliveries to
// (e.g. a named in-house rider or a regular contractor). Mirrors
// delivery_methods.table.ts — same tenant-scoped CRUD shape, same
// settings-module pattern. Nothing else references this table by foreign
// key: picking a profile from the cashier's delivery dialog just prefills
// delivery_order_details.courier_name/courier_phone, so renaming or
// disabling a profile later never rewrites already-delivered order history.
export const couriers = pgTable(
  "couriers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    notes: text("notes"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    activeIdx: index("couriers_active_idx").on(table.is_active),
    branchNameIdx: uniqueIndex("couriers_branch_name_idx").on(
      table.branch_id,
      table.name,
    ),
  })
);
