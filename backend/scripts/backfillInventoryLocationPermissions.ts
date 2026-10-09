import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db/drizzle";
import { businesses, branches, stockLocations, users, role_permissions } from "../src/db/schema";
import {
  CONFIGURABLE_ROLES,
  LOCATION_SCOPED_RESOURCES,
  PermissionMatrix,
  withDefaults,
} from "../src/common/permissions/permissions.constants";

const CONFIGURABLE = new Set<string>(CONFIGURABLE_ROLES as readonly string[]);

// One-off backfill for the location-scoped inventory/transfers permission
// change. Before this, a role's `inventory`/`transfers` permission applied to
// every stock location; going forward, an empty/missing `locations` list
// means NO locations (deny), unlike every other permission flag (which
// defaults open). Without this backfill, every role currently in use would
// silently lose all inventory/transfer access the moment this ships.
//
// For every business, for every configurable role that's actually in use
// (has a role_permissions row already, or ≥1 user with that role), grant
// explicit access to every one of that business's current active stock
// locations — but only for resources that don't already carry an explicit
// `locations` array, so re-running this script (or running it after an owner
// has already configured locations by hand) is a no-op.
async function backfill() {
  console.log("🔄 Backfilling inventory/transfers location permissions ...");

  const allBusinesses = await db
    .select({ id: businesses.id, name: businesses.name })
    .from(businesses);

  let grantedRows = 0;
  let skippedRows = 0;

  for (const biz of allBusinesses) {
    const bizBranches = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.business_id, biz.id));
    const branchIds = bizBranches.map((b) => b.id);

    const locations = branchIds.length
      ? await db
          .select({ id: stockLocations.id })
          .from(stockLocations)
          .where(
            and(
              inArray(stockLocations.branch_id, branchIds),
              eq(stockLocations.is_active, true),
            ),
          )
      : [];
    const locationIds = locations.map((l) => l.id);

    const existingRows = await db
      .select()
      .from(role_permissions)
      .where(eq(role_permissions.business_id, biz.id));
    const rowByRole = new Map(existingRows.map((r) => [r.role, r]));

    const userRoles = await db
      .selectDistinct({ role: users.role })
      .from(users)
      .where(eq(users.business_id, biz.id));

    const rolesInUse = new Set<string>();
    for (const role of rowByRole.keys()) rolesInUse.add(role);
    for (const u of userRoles) {
      if (u.role && CONFIGURABLE.has(u.role)) rolesInUse.add(u.role);
    }

    for (const role of rolesInUse) {
      if (!CONFIGURABLE.has(role)) continue;
      const existing = rowByRole.get(role);
      const rawStored = (existing?.permissions as PermissionMatrix) ?? null;
      const next = withDefaults(rawStored);

      let changed = false;
      for (const resource of LOCATION_SCOPED_RESOURCES) {
        const alreadyExplicit = Array.isArray(rawStored?.[resource]?.locations);
        if (!alreadyExplicit) {
          next[resource] = { ...next[resource], locations: locationIds };
          changed = true;
        }
      }

      if (!changed) {
        skippedRows++;
        continue;
      }

      await db
        .insert(role_permissions)
        .values({ business_id: biz.id, role, permissions: next })
        .onConflictDoUpdate({
          target: [role_permissions.business_id, role_permissions.role],
          set: { permissions: next, updated_at: new Date() },
        });
      grantedRows++;
      console.log(
        `  ✅ ${biz.name} / ${role}: granted ${locationIds.length} location(s)`,
      );
    }
  }

  console.log(
    `✅ Backfilled ${grantedRows} role row(s); ${skippedRows} already had explicit locations.`,
  );
}

async function run() {
  try {
    await backfill();
  } catch (err) {
    console.error("❌ Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
