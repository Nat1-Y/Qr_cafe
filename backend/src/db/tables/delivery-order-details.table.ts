import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "./_tenant";
import { orders } from "./orders.table";
import { deliveryMethods } from "./delivery_methods.table";

// 1:1 extension of `orders` for delivery-specific data. Kept off the core
// orders table so the order/payment/inventory/sync pipeline stays untouched —
// this row only exists for orders tagged with a delivery method and carries
// the fields that pipeline has no use for (courier, address, fee, and the
// delivery's own two-stage progress, separate from orders.status).
export const deliveryOrderDetails = pgTable(
  "delivery_order_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    delivery_method_id: uuid("delivery_method_id")
      .notNull()
      .references(() => deliveryMethods.id, { onDelete: "restrict" }),
    // Snapshot of the method's display name at order time, so renaming or
    // disabling a method later never rewrites history (same reasoning as
    // orders.meta on the core table).
    delivery_method_name: varchar("delivery_method_name", { length: 128 }),
    courier_name: varchar("courier_name", { length: 128 }),
    courier_phone: varchar("courier_phone", { length: 32 }),
    address: text("address"),
    fee_cents: integer("fee_cents").default(0),
    // pending | delivered | cancelled — independent of orders.status (kitchen
    // completion) and payments.status (money collected).
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    notes: text("notes"),
    delivered_at: timestamp("delivered_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    orderIdx: uniqueIndex("delivery_order_details_order_idx").on(
      table.order_id,
    ),
    branchStatusIdx: index("delivery_order_details_branch_status_idx").on(
      table.branch_id,
      table.status,
    ),
    methodIdx: index("delivery_order_details_method_idx").on(
      table.delivery_method_id,
    ),
  })
);
