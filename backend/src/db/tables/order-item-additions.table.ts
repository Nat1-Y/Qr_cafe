import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { orders } from "./orders.table";
import { users } from "./users.table";
import { tenantColumns } from "./_tenant";

// Audit trail for items added to an order after it was first created. Kept
// separate from order_items because addOrderItems merges a repeat menu_item_id
// into its existing row (bumps quantity in place) — this table is the only
// record of what was actually added, by whom, and when. `id` doubles as the
// client-supplied idempotency key for addOrderItems (see order.service.ts).
export const order_item_additions = pgTable("order_item_additions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...tenantColumns(),
  order_id: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  added_by: uuid("added_by").references(() => users.id, {
    onDelete: "set null",
  }),
  // Snapshot of what was added: [{menu_item_id, menu_item_name, quantity,
  // unit_price, subtotal, item_type, main_category}]. Snapshotted (not just
  // referenced by id) so renamed/deleted menu items don't corrupt history, and
  // so printing can reproduce exactly what was added without re-deriving it
  // from order_items' post-merge state.
  items: jsonb("items").notNull(),
  added_at: timestamp("added_at").defaultNow(),
});
