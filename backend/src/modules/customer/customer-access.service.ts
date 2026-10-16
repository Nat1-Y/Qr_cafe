import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { diningTables } from "../../db/tables/dining-tables.table";
import { branches } from "../../db/tables/branches.table";
import { businesses } from "../../db/tables/businesses.table";
import { users } from "../../db/tables/users.table";
import { systemSettings } from "../../db/tables/system-settings.table";
import { isWellFormedToken } from "../../common/qr/qr-token";
import {
  QR_SETTING_KEYS,
  QrSettings,
  isWithinOrderingHours,
  parseQrSettings,
} from "../../common/qr/qr-settings";
import { runWithTenant } from "../../common/tenant/tenant-context";
import { DEFAULT_BUSINESS_TIMEZONE } from "../../common/time/branch-timezone";

/** Everything a guest request needs about the table it scanned. */
export interface TableAccess {
  tableId: string;
  tableNumber: number;
  label: string | null;
  qrEnabled: boolean;
  branchId: string;
  businessId: string;
  branchName: string;
  phone: string | null;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  /** The waiter assigned to this table (active staff only), or null. */
  assignedWaiterId: string | null;
  assignedWaiterName: string | null;
}

export type ClosedReason = "not_available" | "table_off" | "closed_now";

export interface OrderingState {
  open: boolean;
  reason: ClosedReason | null;
}

export const QR_NOT_FOUND_MESSAGE =
  "This QR code isn't working. Please ask a member of staff for help.";

function logoFrom(...metas: unknown[]): string | null {
  for (const m of metas) {
    const url = (m as { logo_url?: unknown } | null)?.logo_url;
    if (typeof url === "string" && /^(https?:\/\/|\/)/.test(url)) return url;
  }
  return null;
}

/** How staff names show elsewhere: first + last, else name, else username. */
function staffName(u: { first_name: string | null; last_name: string | null; name: string; username: string | null }): string {
  const composed = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return composed || u.name || u.username || "";
}

function minutesNowIn(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * Resolves a table QR token to its branch — the ONLY way a public request gets
 * a tenant. The lookup is deliberately not tenant-scoped (the token is what
 * picks the tenant); everything after it runs inside that branch's context.
 */
@Injectable()
export class CustomerAccessService {
  async resolve(token: string): Promise<TableAccess> {
    if (!isWellFormedToken(token)) throw new NotFoundException(QR_NOT_FOUND_MESSAGE);

    const [row] = await db
      .select({ table: diningTables, branch: branches, business: businesses, waiter: users })
      .from(diningTables)
      .innerJoin(branches, eq(diningTables.branch_id, branches.id))
      .innerJoin(businesses, eq(diningTables.business_id, businesses.id))
      .leftJoin(
        users,
        and(
          eq(diningTables.assigned_waiter_id, users.id),
          eq(users.branch_id, diningTables.branch_id),
          eq(users.is_active, true),
        ),
      )
      .where(
        and(
          eq(diningTables.qr_token, token),
          eq(branches.is_active, true),
          eq(businesses.is_active, true),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException(QR_NOT_FOUND_MESSAGE);

    return {
      tableId: row.table.id,
      tableNumber: row.table.table_number,
      label: row.table.label ?? null,
      assignedWaiterId: row.waiter?.id ?? null,
      assignedWaiterName: row.waiter ? staffName(row.waiter) : null,
      qrEnabled: row.table.qr_enabled,
      branchId: row.branch.id,
      businessId: row.table.business_id,
      branchName: row.branch.name,
      phone: row.branch.phone ?? null,
      currency: row.branch.currency || "ETB",
      timezone: row.branch.timezone || DEFAULT_BUSINESS_TIMEZONE,
      logoUrl: logoFrom(row.branch.meta, row.business.meta),
    };
  }

  /** Run `fn` inside the resolved table's branch context (no user, no role). */
  run<T>(access: TableAccess, fn: () => Promise<T>): Promise<T> {
    return runWithTenant(
      {
        businessId: access.businessId,
        branchId: access.branchId,
        scope: "branch",
        userId: null,
        username: null,
        role: null,
      },
      fn,
    );
  }

  async settings(branchId: string): Promise<QrSettings> {
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.branch_id, branchId),
          inArray(systemSettings.key, Object.values(QR_SETTING_KEYS)),
        ),
      );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return parseQrSettings(map);
  }

  orderingState(access: TableAccess, settings: QrSettings, now = new Date()): OrderingState {
    if (!settings.enabled) return { open: false, reason: "not_available" };
    if (!access.qrEnabled) return { open: false, reason: "table_off" };
    if (!isWithinOrderingHours(settings.orderingHours, minutesNowIn(access.timezone, now))) {
      return { open: false, reason: "closed_now" };
    }
    return { open: true, reason: null };
  }
}
