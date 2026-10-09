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

// Owner-configured delivery channels a branch works with (e.g. "Beu", "Own
// driver"). Mirrors payment_methods.table.ts — same tenant-scoped CRUD shape,
// same settings-module pattern.
export const deliveryMethods = pgTable(
  "delivery_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    name: varchar("name", { length: 64 }).notNull(),
    display_name: varchar("display_name", { length: 128 }).notNull(),
    icon: varchar("icon", { length: 64 }),
    description: text("description"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    activeIdx: index("delivery_methods_active_idx").on(table.is_active),
    branchNameIdx: uniqueIndex("delivery_methods_branch_name_idx").on(
      table.branch_id,
      table.name,
    ),
  })
);
