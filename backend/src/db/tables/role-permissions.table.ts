import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { businesses } from "./businesses.table";
import type { PermissionMatrix } from "../../common/permissions/permissions.constants";

// Per-business permission matrix for a role. One row per (business, role); the
// absence of a row means "all allowed" (see RolePermissionsService). Permissions
// are business-scoped (configured once by the owner), not branch-scoped, so this
// table carries business_id only — no branch_id.
//
// `permissions` shape:
//   { "<resource>": { "read": bool, "write": bool, "update": bool, "delete": bool,
//                      "locations"?: string[] }, ... }
// `locations` only appears on location-scoped resources ("inventory",
// "transfers" — see LOCATION_SCOPED_RESOURCES in common/permissions) and
// restricts that resource to specific stock_locations ids.
export const role_permissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    business_id: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 64 }).notNull(),
    permissions: jsonb("permissions")
      .$type<PermissionMatrix>()
      .notNull()
      .default({}),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    businessRoleIdx: uniqueIndex("role_permissions_business_role_idx").on(
      table.business_id,
      table.role,
    ),
  }),
);
