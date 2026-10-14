// Menu helpers shared by the waiter's create-order screen and the guest QR app.
// Pure functions only — no React, no fetching.

/** Lower-cased, trimmed section name; "other" when empty. */
export function normalizeMainCategory(value: unknown): string {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v || "other";
}

type RawMenuItem = Record<string, unknown> & {
  meta?: { main_category?: unknown; sub_category?: unknown } | null;
};

/**
 * The waiter screen's menu row shape: section/sub-category resolved the same
 * way everywhere, and unavailable items dropped.
 */
export function normalizeMenuItems<T extends RawMenuItem>(rawItems: unknown): Array<
  T & { main_category: unknown; category: unknown; sub_category: unknown; is_available: boolean }
> {
  if (!Array.isArray(rawItems)) return [];
  return (rawItems as T[])
    .map((item) => ({
      ...item,
      main_category:
        item.meta?.main_category || item.main_category || normalizeMainCategory(item.category),
      category: item.category,
      sub_category: item.meta?.sub_category || item.sub_category || item.category || "",
      is_available:
        typeof item.is_available === "boolean"
          ? item.is_available
          : ((item.available as boolean | undefined) ?? true),
    }))
    .filter((item) => item.is_available);
}

/** The menu array from any of the shapes the menu endpoints have returned. */
export function extractMenuItemsFromResponse(response: unknown): unknown[] {
  const payload = (response as { data?: unknown } | null)?.data as
    | (Record<string, unknown> & { data?: Record<string, unknown> | unknown[] })
    | unknown[]
    | undefined;
  const p = payload as Record<string, unknown> | undefined;
  const d = p?.data as Record<string, unknown> | undefined;
  const candidates = [d?.menuItems, p?.menuItems, d?.items, p?.items, p?.data, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * Search key: lower-case with accents stripped, so "cafe" finds "Café" and
 * "macchiato" finds "Macchíato". Ethiopic letters pass through unchanged.
 */
export function searchKey(text: unknown): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Every word of the query appears somewhere in the haystack fields. */
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.map(searchKey).join(" ");
  return words.every((w) => hay.includes(w));
}
