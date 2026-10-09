// Per-branch list of inventory item ids the owner has chosen to expose to
// waiters (e.g. on the sign-in page's Inventory tab). Stored as a JSON array
// under a single system_settings key, mirroring the role-history-lookback
// pattern in ../history/lookback.ts.

export const WAITER_VISIBLE_INVENTORY_SETTING_KEY = "waiter_visible_inventory_items";

// Validate/clean a live input (e.g. a PUT body) into a deduped list of id strings.
export function cleanItemIdList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// Parse the stored JSON blob into an id list, dropping anything invalid.
export function parseItemIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return cleanItemIdList(JSON.parse(raw));
  } catch {
    return [];
  }
}
