// Per-role history lookback.
//
// The owner configures, per branch, how many days of *past* data each staff role
// may view in the payment / order history screens. Front-of-house roles
// (cashier, waiter) are capped so they only ever see recent activity; back-office
// roles (admin/owner) always see the full history.
//
// The resolved value for the logged-in user's role is returned on the login
// response so every client (offline desktop POS, web cashier, web waiter) can
// apply the same window, and it is also enforced server-side on the history
// endpoints for JWT-authenticated callers.

export const HISTORY_LOOKBACK_SETTING_KEY = "role_history_lookback";

// Roles that always see the full history regardless of configuration.
export const UNLIMITED_HISTORY_ROLES = new Set([
  "admin",
  "owner",
  "business_admin",
  "super_admin",
]);

// Roles the owner can configure in the dashboard. Any other restricted role
// falls back to the default below.
export const CONFIGURABLE_HISTORY_ROLES = [
  "cashier",
  "cafe_waiter",
  "kitchen_staff",
];

// Default lookback (in days back from today) for a restricted role with no
// explicit configuration. 1 = today plus yesterday.
export const DEFAULT_HISTORY_LOOKBACK_DAYS = 1;

export type LookbackMap = Record<string, number>;

// Parse the stored JSON blob into a {role: days} map, dropping anything invalid.
export function parseLookbackMap(raw: string | null | undefined): LookbackMap {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const out: LookbackMap = {};
      for (const [key, val] of Object.entries(value)) {
        const n = Number(val);
        if (Number.isFinite(n)) out[String(key).toLowerCase()] = Math.trunc(n);
      }
      return out;
    }
  } catch {
    // Corrupt/legacy value — treat as empty rather than failing the request.
  }
  return {};
}

// Resolve the lookback (in days) for a role. Returns null for "unlimited"
// (back-office roles, or a role explicitly configured with a negative value).
export function resolveLookbackDays(
  role: string | null | undefined,
  map: LookbackMap,
): number | null {
  const r = String(role ?? "").toLowerCase();
  if (!r || UNLIMITED_HISTORY_ROLES.has(r)) return null;
  const configured = map[r];
  if (configured === undefined) return DEFAULT_HISTORY_LOOKBACK_DAYS;
  if (configured < 0) return null; // negative sentinel = unlimited
  return configured;
}

// Start-of-day Date for the earliest visible record given a lookback in days.
// Built from the local server clock. Returns null when unlimited.
export function historyLowerBoundDate(
  days: number | null,
  now: Date = new Date(),
): Date | null {
  if (days === null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}
