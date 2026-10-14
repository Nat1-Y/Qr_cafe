import {
  pgTable,
  uuid,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantColumns } from "./_tenant";
import { generateQrToken } from "../../common/qr/qr-token";

export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    table_number: integer("table_number").notNull(),
    status: varchar("status", { length: 50 }).default("available").notNull(),
    // Printed on the table's QR card; the public customer API resolves the
    // branch from this alone. Rotating it (qr_rotated_at) kills old cards.
    // The SQL default (two random UUIDs, 244 random bits) covers rows inserted
    // outside Drizzle and backfilled existing tables; app inserts use
    // generateQrToken() instead.
    qr_token: varchar("qr_token", { length: 64 })
      .notNull()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`)
      .$defaultFn(generateQrToken),
    qr_enabled: boolean("qr_enabled").default(true).notNull(),
    qr_rotated_at: timestamp("qr_rotated_at"),
    // Optional guest-facing name, e.g. "Terrace 4". Falls back to the number.
    label: varchar("label", { length: 80 }),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tableNumberIdx: index("dining_tables_table_number_idx").on(table.table_number),
    statusIdx: index("dining_tables_status_idx").on(table.status),
    qrTokenIdx: uniqueIndex("dining_tables_qr_token_idx").on(table.qr_token),
  }),
);
