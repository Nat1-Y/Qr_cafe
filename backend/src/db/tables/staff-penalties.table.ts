import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "./_tenant";
import { users } from "./users.table";

// Disciplinary log entries an owner records against an employee (progressive
// discipline: verbal warning → written warning → fine → suspension). `amount`
// is optional since not every entry is monetary — only fines/cost deductions
// (e.g. cash shortage, breakage) carry one. Branch-scoped like every other
// operational table.
export const staff_penalties = pgTable(
  "staff_penalties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns(),
    employee_id: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employee_name: varchar("employee_name", { length: 120 }),
    severity: varchar("severity", { length: 30 }).notNull(),
    reason: text("reason").notNull(),
    amount: integer("amount"),
    amount_cents: integer("amount_cents").default(0),
    occurred_at: timestamp("occurred_at").defaultNow().notNull(),
    recorded_by: uuid("recorded_by"),
    recorded_by_name: varchar("recorded_by_name", { length: 120 }),
    version: integer("version").default(1).notNull(),
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    branchDateIdx: index("staff_penalties_branch_date_idx").on(
      table.branch_id,
      table.occurred_at,
    ),
    branchEmployeeIdx: index("staff_penalties_branch_employee_idx").on(
      table.branch_id,
      table.employee_id,
    ),
  }),
);
