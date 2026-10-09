import { eq } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { branches } from "../../db/tables/branches.table";

// Every branch on the platform is in this zone today (see branches.timezone
// default); used as the fallback for a missing/unresolvable branch row and
// for the platform-wide (cross-branch) analytics window, which can't pin a
// single branch's timezone when it spans several.
export const DEFAULT_BUSINESS_TIMEZONE = "Africa/Addis_Ababa";

/**
 * `branches.timezone` for the given branch, falling back to the platform
 * default. Also falls back on a failed lookup (dropped/reset pooled
 * connection, transient DB error) rather than throwing — this runs inline in
 * order listing, payment listing, and Z-report generation, and every branch
 * on the platform is in `DEFAULT_BUSINESS_TIMEZONE` today anyway, so a
 * best-effort timezone shouldn't be able to 500 those endpoints.
 */
export async function resolveBranchTimezone(branchId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    return row?.timezone || DEFAULT_BUSINESS_TIMEZONE;
  } catch (err) {
    console.error(
      `resolveBranchTimezone(${branchId}) failed, falling back to ${DEFAULT_BUSINESS_TIMEZONE}:`,
      err,
    );
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

/** Offset of `timeZone` from UTC at instant `at`, in minutes (UTC+3 → 180). */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(at)) parts[type] = value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60_000;
}

/**
 * Converts a wall-clock day boundary ("YYYY-MM-DD", start or end of day) in
 * `timeZone` to the UTC instant it actually represents. Two passes so the
 * result still lands correctly right at a DST transition — moot for
 * Africa/Addis_Ababa (no DST) but keeps this correct for any future branch
 * in a zone that has one.
 */
export function zonedDayBoundaryToUtc(
  dateOnly: string,
  timeZone: string,
  end: boolean,
): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const wallTimeMs = end
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let instant = new Date(wallTimeMs);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(instant, timeZone);
    instant = new Date(wallTimeMs - offset * 60_000);
  }
  return instant;
}

/** Today's calendar date ("YYYY-MM-DD") as read on a wall clock in `timeZone`. */
export function todayInZone(timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD.
  return dtf.format(new Date());
}

/**
 * Drop-in replacement for the naive `new Date(`${value}T00:00:00`)` pattern
 * duplicated across order/payment/platform services. A plain "YYYY-MM-DD" is
 * resolved against `timeZone`; anything already timezone-qualified (a full
 * ISO string) is passed straight to `new Date`, unchanged.
 */
export function parseDateBoundInZone(
  value: string,
  timeZone: string,
  end: boolean,
): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return zonedDayBoundaryToUtc(value, timeZone, end);
  }
  return new Date(value);
}
