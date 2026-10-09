export const PRINTED_ORDERS_STORAGE_KEY = "cashier_printed_orders_v1";

/**
 * Durable per-station record of every order this device has physically
 * printed. It exists to make auto-printing at-most-once: the local DB's
 * `is_printed` flag can be raced or clobbered (stale unprinted lists in the
 * poll loop, a socket/pull upsert rewriting the row, a markPrinted write that
 * fails after the ticket already came out), and any of those turns into a
 * duplicate ticket. This registry is written the moment a print physically
 * succeeds and is consulted before every automatic print, so no matter what
 * happens to the DB flag the same station never auto-prints an order twice.
 *
 * Deliberate manual reprints bypass it (see `force` in printOrderImmediately).
 */

// Ids older than this are pruned — an order's print window is same-day; three
// days comfortably covers restarts and lookback without unbounded growth.
const ENTRY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

type RegistryMap = Record<string, number>;

const normalizeId = (orderId: unknown): string => String(orderId ?? "").trim();

const readRegistry = (): RegistryMap => {
  try {
    const raw = localStorage.getItem(PRINTED_ORDERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as RegistryMap;
  } catch {
    return {};
  }
};

const writeRegistry = (map: RegistryMap) => {
  try {
    localStorage.setItem(PRINTED_ORDERS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full/unavailable — the in-DB is_printed flag still guards the
    // common path; losing the backstop must never block printing itself.
  }
};

const prune = (map: RegistryMap): RegistryMap => {
  const now = Date.now();
  let entries = Object.entries(map).filter(
    ([, at]) => Number.isFinite(at) && now - at < ENTRY_TTL_MS,
  );
  if (entries.length > MAX_ENTRIES) {
    entries = entries
      .sort((a, b) => b[1] - a[1]) // newest first
      .slice(0, MAX_ENTRIES);
  }
  return Object.fromEntries(entries);
};

/** True when this station has already physically printed the order. */
export const hasOrderBeenPrintedHere = (orderId: unknown): boolean => {
  const id = normalizeId(orderId);
  if (!id) return false;
  return readRegistry()[id] !== undefined;
};

/**
 * Record a physically-successful print. Call this immediately after the
 * native print resolves, BEFORE markPrinted — so even if the DB write fails,
 * the ticket that already came out of the printer can never auto-print again.
 */
export const recordOrderPrintedHere = (orderId: unknown) => {
  const id = normalizeId(orderId);
  if (!id) return;
  const map = prune(readRegistry());
  map[id] = Date.now();
  writeRegistry(map);
};
