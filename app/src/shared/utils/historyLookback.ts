// Per-role history lookback (client mirror of backend/src/common/history/lookback.ts).
//
// The owner configures, per branch, how many days of past payment/order history
// each role may view. The resolved value rides down on login, but it is also
// mirrored into the local `system_settings` table under `role_history_lookback`
// on every sync loop — so a change the owner makes takes effect without the
// cashier having to log out and back in. Resolving locally from that synced
// setting keeps the desktop and the backend in agreement.

export const HISTORY_LOOKBACK_SETTING_KEY = "role_history_lookback";

// Roles that always see the full history regardless of configuration.
const UNLIMITED_HISTORY_ROLES = new Set([
  "admin",
  "owner",
  "business_admin",
  "super_admin",
]);

// Default lookback (days back from today) for a restricted role with no explicit
// configuration. 1 = today plus yesterday.
export const DEFAULT_HISTORY_LOOKBACK_DAYS = 1;

export type LookbackMap = Record<string, number>;

// Parse the stored JSON blob into a {role: days} map, dropping anything invalid.
export const parseLookbackMap = (
  raw: string | null | undefined,
): LookbackMap => {
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
    // Corrupt/legacy value — treat as empty.
  }
  return {};
};

// Resolve the lookback (days) for a role. Returns null for "unlimited"
// (back-office roles, or a role explicitly configured with a negative value).
export const resolveLookbackDays = (
  role: string | null | undefined,
  map: LookbackMap,
): number | null => {
  const r = String(role ?? "").toLowerCase();
  if (!r || UNLIMITED_HISTORY_ROLES.has(r)) return null;
  const configured = map[r];
  if (configured === undefined) return DEFAULT_HISTORY_LOOKBACK_DAYS;
  if (configured < 0) return null; // negative sentinel = unlimited
  return configured;
};
