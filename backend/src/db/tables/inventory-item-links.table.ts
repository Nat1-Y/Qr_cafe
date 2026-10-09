import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { inventoryItems } from "./inventory-items.table";
import { tenantColumns } from "./_tenant";

// One-to-many transfer links: many *source* items may point at one *target*
// item. A transfer line whose item is a link source is received as the target
// item at the destination location (quantity × conversion_factor) instead of
// as itself. A source can feed only one target (unique per branch), so
// resolution during a transfer is unambiguous. Items without a link keep the
// default one-to-one behavior (received as themselves).
export const inventoryItemLinks = pgTable(
  "inventory_item_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    source_item_id: uuid("source_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    target_item_id: uuid("target_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    // Target base units credited per source base unit transferred.
    conversion_factor: integer("conversion_factor").default(1).notNull(),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    sourceIdx: uniqueIndex("inventory_item_links_source_idx").on(
      table.branch_id,
      table.source_item_id,
    ),
  }),
);
