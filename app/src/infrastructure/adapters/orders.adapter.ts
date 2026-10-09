// @ts-nocheck
import {
  generateLocalId,
  getLocalDb,
  localDbTables,
  LocalOrder,
} from "@/db/localDb";
import {
  api,
  isOnline,
  generateEscPosBase64,
  FAST_PROBE_TIMEOUT_MS,
} from "@/infrastructure/api/http-client";
import {
  getPrinterForDepartment,
  getDepartmentStations,
  getActivePrinterName,
  getSimplePrintMode,
  getTicketShowPrices,
  getPrintCopies,
} from "@/infrastructure/printing/printer-config";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
} from "drizzle-orm";
import {
  findById,
  findByIdOrRemote,
  readRows,
  readRowsWhere,
  readUnsyncedRows,
  upsertRow,
} from "@/infrastructure/database/local-db-query";
import {
  getApproximateServerDate,
  getApproximateServerIsoString,
} from "@/shared/utils/serverTime";
import { checkOrderInventoryAvailability } from "@/application/inventory/order-inventory.service";
import { settingsAdapter } from "@/infrastructure/adapters/settings.adapter";
import { renderReceiptImages, ReceiptBlock } from "@/utils/receiptImage";
import { formatOrderNumber } from "@/lib/utils";
import { getSessionUser } from "@/shared/utils/sessionUser";

// How far back a cancelled order is still eligible for its void ticket. The
// query below can only narrow on the indexed status/is_printed columns —
// those stay true forever for a cancelled order — so without this window
// EVERY cancelled order this device has ever synced is "pending" again the
// moment the printed-registry (localStorage, see printed-registry.ts) ages
// its `cancel:{id}` entry out via TTL/eviction, and the whole backlog
// reprints at once. A void ticket is only useful minutes after the
// cancellation anyway, so bounding the query here is the real fix — the
// registry stays a same-day duplicate guard, not the source of truth.
const CANCEL_PRINT_WINDOW_MS = 24 * 60 * 60 * 1000;

const DEFAULT_ORDER_STATUS = "pending";
const DEFAULT_PAYMENT_STATUS = "pending";
const DEFAULT_TABLE_COLUMN_WIDTHS = [12, 36];
const DEFAULT_TABLE_COLUMN_ALIGNS: ("left" | "right")[] = ["left", "right"];

// Kitchen ticket lines: quantity and item name each centered within their column,
// matching the centered header/meta lines on the rest of the ticket.
const ORDER_TICKET_COLUMN_WIDTHS = [8, 40];
const ORDER_TICKET_COLUMN_ALIGNS: ("left" | "right" | "center")[] = [
  "center",
  "center",
];

/**
 * Word-wrap free text (e.g. an order note) into lines that fit an 80mm ticket.
 * The receipt `text` block doesn't wrap — it ellipsis-truncates — so a long note
 * would otherwise be cut off. ~40 chars/line is conservative for the bold font.
 */
const wrapTicketText = (text: string, maxChars = 40): string[] => {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // Hard-break a single token longer than the line width.
    line = word;
    while (line.length > maxChars) {
      lines.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
  }
  if (line) lines.push(line);
  return lines;
};

const findOrder = async (id: string) => {
  return findByIdOrRemote(localDbTables.orders, id);
};

const findUser = async (id: string) => {
  return findById(localDbTables.users, id);
};

const DEFAULT_WAITER_NAME = "Unknown";

const orderWaiterId = (order: any): string | null => {
  const id = order?.waiter_id ?? order?.employee_id ?? order?.created_by_id;
  return id ? String(id) : null;
};

const nameFromUserRow = (waiterUser: any): string =>
  [waiterUser?.first_name, waiterUser?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() ||
  waiterUser?.full_name ||
  waiterUser?.name ||
  waiterUser?.username ||
  DEFAULT_WAITER_NAME;

const resolveWaiterName = async (order: any): Promise<string> => {
  const waiterId = orderWaiterId(order);
  if (!waiterId) return DEFAULT_WAITER_NAME;
  const waiterUser = await findUser(waiterId);
  if (!waiterUser) return DEFAULT_WAITER_NAME;
  return nameFromUserRow(waiterUser);
};

/**
 * Bulk version of resolveWaiterName for order lists (getOrdersForPayment,
 * getOccupiedTables). Those loop over every order in the list; resolving one
 * waiter at a time meant one local-DB IPC round trip per order. This loads the
 * users table once and joins in memory instead.
 */
const resolveWaiterNamesFor = async (
  orders: any[],
): Promise<Map<string, string>> => {
  const neededIds = new Set<string>();
  for (const order of orders) {
    const id = orderWaiterId(order);
    if (id) neededIds.add(id);
  }
  const names = new Map<string, string>();
  if (neededIds.size === 0) return names;

  const allUsers = await readRows(localDbTables.users);
  const usersById = new Map<string, any>(
    allUsers.map((u: any) => [String(u.id), u]),
  );
  for (const id of neededIds) {
    const waiterUser = usersById.get(id);
    names.set(
      id,
      waiterUser ? nameFromUserRow(waiterUser) : DEFAULT_WAITER_NAME,
    );
  }
  return names;
};

const extractMenuMainCategory = (menuItem: any) =>
  String((menuItem as any)?.main_category || "")
    .trim()
    .toLowerCase();

const resolveItemCategory = async (
  item: any,
  fallback: string,
): Promise<string> => {
  const menuItemId = item?.menu_item_id ? String(item.menu_item_id) : "";
  if (menuItemId) {
    const menuItem = await findByIdOrRemote(
      localDbTables.menuItems,
      menuItemId,
    );
    const menuMain = extractMenuMainCategory(menuItem);
    if (menuMain) return menuMain;
  }

  const explicitMain = String(item?.main_category || "")
    .trim()
    .toLowerCase();
  if (explicitMain) return explicitMain;

  const legacyType = String(item?.item_type || "")
    .trim()
    .toLowerCase();
  if (legacyType) return legacyType;

  return fallback;
};

const KITCHEN_PRINT_STATUSES = new Set(["pending", "preparing", "ready"]);

const buildResponse = (data: any, status: number = 200) => ({
  data: { status: "success", ...data },
  status,
  statusText: status === 200 ? "OK" : "Error",
  headers: {},
  config: {} as any,
});

const buildErrorResponse = (message: string, status: number = 404) =>
  ({
    data: { status: "error", message },
    status,
    statusText: status === 404 ? "Not Found" : "Error",
    headers: {},
    config: {} as any,
  }) as any;

const updateOrderWithChanges = async (id: string, changes: any) => {
  const order = await findOrder(id);
  if (order && order.id) {
    await upsertOrder({
      ...order,
      ...changes,
      updated_at: getApproximateServerIsoString(),
      synced: 0,
    });
  }
  return buildResponse({});
};

const printerDisplayName = (p: any): string =>
  typeof p === "string" ? p : String(p?.name || p?.address || "").trim();

/** Names of the printers CUPS currently knows about (trimmed, non-empty). */
const listAvailablePrinters = async (): Promise<string[]> => {
  const { list_thermal_printers } =
    await import("tauri-plugin-thermal-printer");
  const printers = ((await list_thermal_printers()) as any[]) || [];
  return printers.map(printerDisplayName).filter(Boolean);
};

/**
 * Resolve a desired printer name to one that actually exists in CUPS.
 *
 * `lp -d <name> -o raw` exits non-zero ("The printer or class does not exist")
 * when handed a name CUPS doesn't have — which the thermal-printer plugin
 * surfaces as the opaque "lp command failed" error. A stale/typo'd entry in the
 * department→printer map (read via getActivePrinterName / getPrinterForDepartment)
 * is the usual cause. Only honor the requested name if it's live; otherwise fall
 * back to the first available printer so the job still prints.
 */
const resolvePrinter = (
  desired: string | undefined,
  available: string[],
): string => {
  const requested = String(desired || "").trim();
  if (requested && available.includes(requested)) return requested;
  if (requested && available.length > 0) {
    console.warn(
      `[print] Printer "${requested}" not found in CUPS; falling back to "${available[0]}". Available: ${available.join(", ") || "(none)"}`,
    );
  }
  return available[0] || requested;
};

const selectPrinter = async (printerName?: string): Promise<string> => {
  const available = await listAvailablePrinters();
  return resolvePrinter(printerName, available);
};

// One ticket = its image strips (tall tickets are split so a single raster
// command never exceeds what printer firmware accepts) + feed + cut.
const ticketSections = (imageDatas: string[]) => [
  ...imageDatas.map((data) => ({
    Image: {
      data,
      max_width: 0,
      align: "center",
      dithering: false,
      size: "normal",
    },
  })),
  { Feed: { feed_type: "lines", value: 3 } },
  { Cut: { mode: "partial", feed: 0 } },
];

const createPrintJob = (imageDatas: string[], printer: string) => ({
  printer,
  paper_size: "Mm80",
  options: {
    code_page: 6,
    encode: "WINDOWS_1252",
  },
  sections: ticketSections(imageDatas),
});

// Filter local orders by the query params the UI passes (employee/waiter, type).
// The cashier "Employees" page relies on employee_id to scope orders to the
// selected waiter, so an order matches when either employee_id or waiter_id
// equals the requested id.
const filterOrdersByParams = (orders: any[], params?: any) => {
  if (!params) return orders;

  let result = orders;

  const employeeId = params.employee_id ?? params.waiter_id;
  if (employeeId != null && employeeId !== "") {
    const id = String(employeeId);
    result = result.filter(
      (o) =>
        String(o?.employee_id || "") === id ||
        String(o?.waiter_id || "") === id,
    );
  }

  if (params.type) {
    const type = String(params.type).toLowerCase();
    result = result.filter((o) => String(o?.type || "").toLowerCase() === type);
  }

  // Opt-in, used by OrderManagement's main list: delivery orders are tracked
  // on their own Deliveries page (own status, own payments ledger) and never
  // belong in the normal Orders history. Other callers of getAll() don't set
  // this and keep seeing the full history, delivery included.
  if (params.exclude_delivery) {
    result = result.filter((o) => String(o?.type || "").toLowerCase() !== "delivery");
  }

  // Same opt-in shape: organization orders are tracked on their own Orders
  // tab under Organizations (own confirm flow, own credit ledger) and never
  // belong in the normal Orders history either.
  if (params.exclude_organization) {
    result = result.filter((o) => !o?.organization_id);
  }

  // Date window (inclusive, local calendar day). Used to floor the list to a
  // role's history lookback so the offline fallback matches the online path.
  const toLocalDay = (value: any): string => {
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  if (params.date_from) {
    const from = String(params.date_from);
    result = result.filter((o) => toLocalDay(o?.created_at) >= from);
  }
  if (params.date_to) {
    const to = String(params.date_to);
    result = result.filter((o) => toLocalDay(o?.created_at) <= to);
  }

  return result;
};

const shiftIsoDate = (dateStr: string, deltaDays: number): string | null => {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
};

/**
 * Read local orders, narrowed to a date_from/date_to window in SQL when the
 * caller passed one (the common case — every role's history lookback sets
 * date_from). Without this, getAll() pulled a till's ENTIRE order history
 * through the IPC boundary on every call, even though the network fetch and
 * the final JS filter were both already bounded to the window.
 *
 * The SQL bound is intentionally padded a day on each side: created_at is
 * stored as a UTC ISO timestamp while filterOrdersByParams compares LOCAL
 * calendar days, so a tight bound could exclude a row near midnight that the
 * exact JS filter (still applied afterward) would keep. This is purely a scan
 * reducer — filterOrdersByParams stays the source of truth for correctness.
 */
const readLocalOrdersForParams = async (params?: any) => {
  const conditions: any[] = [];
  if (params?.date_from) {
    const padded = shiftIsoDate(params.date_from, -1);
    if (padded) conditions.push(gte(localDbTables.orders.created_at, padded));
  }
  if (params?.date_to) {
    const padded = shiftIsoDate(params.date_to, 1);
    if (padded) {
      conditions.push(
        lte(localDbTables.orders.created_at, `${padded}T23:59:59.999Z`),
      );
    }
  }
  if (conditions.length === 0) return readRows(localDbTables.orders);
  return readRowsWhere(
    localDbTables.orders,
    conditions.length > 1 ? and(...conditions) : conditions[0],
  );
};

const isOrderMarkedPrinted = (order: any) =>
  Number(order?.is_printed) === 1 || Number(order?.meta?.is_printed) === 1;

const shouldAutoPrintOrder = (order: any) => {
  const status = String(order?.status || "")
    .trim()
    .toLowerCase();
  const paymentStatus = String(order?.payment_status || "")
    .trim()
    .toLowerCase();
  if (!KITCHEN_PRINT_STATUSES.has(status)) return false;
  if (paymentStatus === "paid") return false;
  if (isOrderMarkedPrinted(order)) return false;
  return true;
};

const upsertOrder = async (order: any) => {
  noteOrderNumber(order?.order_number);
  return upsertRow(localDbTables.orders, order);
};

/**
 * Read-merge-write a partial update onto a local itemAdditions row. Never
 * blind-overwrites the full row — `printed` and `synced` are each written by
 * independent paths (local-first apply, the immediate online push, the retry
 * push task, the socket echo, the catch-up pull) and must stay sticky: a call
 * that only means to flip one flag must not stomp whatever the other one
 * currently is, or a race can re-arm `printed` and cause a duplicate ticket —
 * the exact bug class already fixed for orders' `is_printed`.
 */
const patchItemAddition = async (
  additionId: string,
  patch: Record<string, any>,
) => {
  const fresh = await findById(localDbTables.itemAdditions, additionId);
  if (!fresh) return;
  await upsertRow(localDbTables.itemAdditions, { ...fresh, ...patch });
};

/** Export for push-tasks.ts so a retried push marks the same row synced without touching `printed`. */
export const markItemAdditionSynced = async (additionId: string) => {
  await patchItemAddition(additionId, { synced: 1 });
};

/**
 * Export for push-tasks.ts, called only after the /items/reconcile retry
 * (see itemAdditionsPushTask's attemptReconcile) has already been tried and
 * failed for a permanent (4xx) reason — e.g. the ownership check reconcile
 * still enforces. `reconcile_attempted: true` is what tells the sweep at the
 * top of itemAdditionsPushTask.push() this row already got its shot, so it
 * isn't picked up and retried every single cycle. Still marks `synced: 1`
 * (stops it clogging the normal unsynced query) while keeping the row and
 * its items around, tagged, instead of the addition just silently vanishing.
 */
export const markItemAdditionRejected = async (
  additionId: string,
  reason: string,
) => {
  await patchItemAddition(additionId, {
    synced: 1,
    rejected: true,
    rejected_reason: reason,
    reconcile_attempted: true,
  });
};

/** Shape a backend order row into the local-DB order record. */
const mapServerOrderToLocal = (remote: any, cached?: any) => ({
  id: remote.id,
  order_number: remote.order_number ?? cached?.order_number ?? null,
  employee_id: remote.employee_id,
  waiter_id: remote.waiter_id,
  created_by_id: remote.created_by_id,
  order_source: remote.order_source,
  // Keep the server-resolved names/role so back-office-placed orders (owner/
  // admin) display the creator even when that user isn't in the local users
  // map. Falls back to usersMap lookups when absent (locally-created orders).
  employee_name: remote.employee_name,
  employee_role: remote.employee_role,
  cashier_name: remote.cashier_name,
  cashier_role: remote.cashier_role,
  organization_id: remote.organization_id,
  type: remote.type,
  status: remote.status,
  payment_status: remote.payment_status,
  total_amount: remote.total_amount,
  notes: remote.notes,
  table_number: remote.table_number,
  items: remote.items || [],
  synced: 1,
  // Keep the local print flag so a pull/socket refresh never re-queues an
  // order we've already printed at this station.
  is_printed: cached?.is_printed || 0,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
});

/**
 * Persist backend order rows into the local DB. Used by the realtime socket
 * (instant path) and the orders pull sync task (catch-up path) so orders
 * created on other devices — e.g. the web waiter app — show up in the local
 * cashier list, which reads exclusively from the local DB.
 */
// A cancellation/void is terminal and authoritative wherever it originates (e.g.
// the web cashier). When the server reports one of these states it must override
// the local copy even if that copy has unsynced edits — otherwise a stale local
// "paid" row would resurrect the order on the next push/pull.
const TERMINAL_VOID_STATUSES = new Set([
  "cancelled",
  "canceled",
  "voided",
  "deleted",
  "refunded",
]);

// Fields that decide whether a remote order differs from what's already cached
// locally. Mirrors payments.adapter's paymentRowChanged: re-upserting an
// unchanged row is pure overhead (an IPC round-trip per row, every pull), and
// on a repeatedly-polled "today's orders" list most rows are unchanged between
// ticks. `items` is compared separately (order/line-item edits must still win).
const ORDER_COMPARE_FIELDS = [
  "status",
  "payment_status",
  "total_amount",
  "table_number",
  "notes",
  "order_number",
  "updated_at",
];

const orderRowChanged = (existing: any, incoming: any): boolean => {
  if (!existing) return true;
  // A local row not yet marked synced must still be reconciled to the server copy.
  if (Number(existing.synced ?? 0) !== 1) return true;
  for (const field of ORDER_COMPARE_FIELDS) {
    if (String(existing[field] ?? "") !== String(incoming[field] ?? "")) {
      return true;
    }
  }
  const existingItems = JSON.stringify(existing.items ?? []);
  const incomingItems = JSON.stringify(incoming.items ?? []);
  return existingItems !== incomingItems;
};

export const persistServerOrders = async (remoteOrders: any[]) => {
  if (!Array.isArray(remoteOrders) || remoteOrders.length === 0) return 0;
  // Scoped to just the ids in this batch — every caller (getAll, the realtime
  // socket, the pull-sync task) already passes a day-scoped or single-order
  // batch, so there's no need to pull the till's entire order history through
  // the IPC boundary just to look up a handful of rows by id.
  const remoteIds = remoteOrders
    .map((o) => (o?.id != null ? String(o.id) : null))
    .filter((id): id is string => id !== null);
  const localOrders =
    remoteIds.length > 0
      ? await readRowsWhere(
          localDbTables.orders,
          inArray(localDbTables.orders.id, remoteIds),
        )
      : [];
  const localOrdersById = new Map<string, any>(
    localOrders.map((o: any) => [String(o.id), o]),
  );
  // Grouped once (not re-filtered per voided order) so a batch with several
  // voided orders doesn't rescan the whole payments table for each one.
  let localPaymentsByOrderId: Map<string, any[]> | null = null;
  let count = 0;
  for (const remote of remoteOrders) {
    if (!remote?.id) continue;
    const cached = localOrdersById.get(String(remote.id));
    const remoteVoided = TERMINAL_VOID_STATUSES.has(
      String(remote?.status || "").toLowerCase(),
    );
    // Never clobber a locally-created order that hasn't been pushed yet — UNLESS
    // the server says it's cancelled/voided, which always wins and stops the
    // local copy from being re-pushed (mapServerOrderToLocal marks it synced).
    if (cached && Number(cached.synced ?? 0) === 0 && !remoteVoided) continue;

    // The printed flag is sticky (monotonic): once set it never reverts. If the
    // snapshot already shows it set, that's final — no need to re-read. Only
    // when the snapshot shows it unset do we re-read the freshest local row
    // immediately before writing, because `localOrders` was read before this
    // batch's network GET and the auto-print engine may have flipped 0→1
    // (markPrinted) in the meantime; writing the stale 0 back would cause the
    // next poll to re-print the same ticket.
    let stickyPrinted = Number(cached?.is_printed) === 1 ? 1 : 0;
    if (!stickyPrinted) {
      const fresh = await findById(localDbTables.orders, remote.id);
      stickyPrinted = Number(fresh?.is_printed) === 1 ? 1 : 0;
    }

    const mapped = mapServerOrderToLocal(remote, {
      ...cached,
      is_printed: stickyPrinted,
    });

    // Skip the write entirely when nothing actually changed — the common case
    // for a repeatedly-polled order list.
    if (!remoteVoided && !orderRowChanged(cached, mapped)) continue;

    await upsertOrder(mapped);
    count += 1;

    // Mirror the desktop's own cancel workflow: a voided order's local payments
    // are voided too, so a stale paid/pending record can't re-assert "paid" on
    // the next sync and the ledger shows the order as deleted.
    if (remoteVoided) {
      if (localPaymentsByOrderId === null) {
        const allPayments = await readRowsWhere(
          localDbTables.payments,
          inArray(localDbTables.payments.order_id, remoteIds),
        );
        localPaymentsByOrderId = new Map();
        for (const p of allPayments) {
          const key = String(p?.order_id);
          const list = localPaymentsByOrderId.get(key);
          if (list) list.push(p);
          else localPaymentsByOrderId.set(key, [p]);
        }
      }
      const paymentsForOrder =
        localPaymentsByOrderId.get(String(remote.id)) ?? [];
      for (const p of paymentsForOrder) {
        if (
          !TERMINAL_VOID_STATUSES.has(String(p?.status || "").toLowerCase())
        ) {
          await upsertRow(localDbTables.payments, {
            ...p,
            status: "cancelled",
            synced: 1,
          });
          p.status = "cancelled";
        }
      }
    }
  }
  return count;
};

/**
 * Persist a single backend item-addition event into the local mirror. Used by
 * both the realtime socket (instant path, in useCashierPrinting.ts) and the
 * catch-up pull task (item_additions_pull) — the same order/table/socket-vs-poll
 * duplication risk `persistServerOrders` guards against, so `printed` is sticky
 * here too: never reverted from 1 back to 0 by a later-arriving copy of the
 * same addition.
 */
export const persistServerItemAddition = async (remote: any) => {
  if (!remote?.id) return;
  const existing = await findById(localDbTables.itemAdditions, remote.id);
  const printed = Number(existing?.printed) === 1 ? 1 : 0;
  await upsertRow(localDbTables.itemAdditions, {
    id: remote.id,
    order_id: remote.order_id,
    added_by: remote.added_by,
    added_at: remote.added_at,
    items: remote.items,
    printed,
    synced: 1,
  });
};

/**
 * Given a `/orders/sync` response, return the set of order ids the backend
 * confirms it actually persisted (created or already-present). Returns null for
 * older backends that don't report this — callers then treat the whole pushed
 * batch as accepted (legacy behaviour). Anything pushed but NOT in this set was
 * skipped server-side and must stay unsynced so it retries instead of being
 * silently lost.
 */
export const extractPersistedOrderIds = (resp: any): Set<string> | null => {
  const body = resp?.data?.data ?? resp?.data ?? {};
  const ids = body?.persisted_ids;
  if (!Array.isArray(ids)) return null;
  return new Set(ids.map((id: any) => String(id)));
};

/**
 * Same contract as extractPersistedOrderIds, for the `payments` half of a
 * `/orders/sync` response. A payment reaching this endpoint doesn't
 * guarantee the server actually recorded it — syncPayment silently drops a
 * payment whose order hasn't landed yet (still mid-sync, or skipped this
 * same cycle), and the outer bulk request still replies 200 OK regardless.
 * Without checking this, the caller has no way to tell "pushed" from
 * "server actually holds it" and ends up marking a silently-dropped payment
 * synced anyway — never retrying it again. That gap is exactly how
 * 2026-08-06's 13 orphaned "paid" orders (paid on the backend, zero payment
 * rows behind them) happened. Returns null for older backends that don't
 * report this yet — callers then treat the whole pushed batch as accepted
 * (legacy behaviour, the same blind trust that produced the bug).
 */
export const extractPersistedPaymentIds = (resp: any): Set<string> | null => {
  const body = resp?.data?.data ?? resp?.data ?? {};
  const ids = body?.payments_persisted_ids;
  if (!Array.isArray(ids)) return null;
  return new Set(ids.map((id: any) => String(id)));
};

/**
 * Given a `/orders/sync` response, map order id → the serial the backend
 * assigned when it created that order. Used to replace any provisional local
 * serial with the official one as soon as a push succeeds.
 */
export const extractAssignedOrderNumbers = (resp: any): Map<string, number> => {
  const body = resp?.data?.data ?? resp?.data ?? {};
  const assigned = new Map<string, number>();
  for (const o of Array.isArray(body?.orders) ? body.orders : []) {
    if (o?.id != null && o?.order_number != null) {
      assigned.set(String(o.id), Number(o.order_number));
    }
  }
  return assigned;
};

/**
 * Highest per-branch serial seen locally this session. Seeded from the local
 * mirror on first use, then maintained in memory: handing out a provisional
 * number is O(1) instead of rescanning every order row, and two burst creates
 * can never read the same max. Stays fresh because every order write funnels
 * through `upsertOrder` (creates, pulls, status updates) or calls
 * `noteOrderNumber` directly (sync push adoption).
 */
let cachedMaxOrderNumber: number | null = null;
let seedMaxPromise: Promise<number> | null = null;

/** Record a serial observed on any order write so the cached max keeps up. */
export const noteOrderNumber = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  if (cachedMaxOrderNumber !== null && n > cachedMaxOrderNumber) {
    cachedMaxOrderNumber = n;
  }
};

const seedMaxOrderNumber = async (): Promise<number> => {
  const localOrders = await readRows(localDbTables.orders);
  let max = 0;
  for (const order of localOrders) {
    const n = Number((order as any)?.order_number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};

/**
 * Next per-branch serial to stamp on an order the backend couldn't number
 * (offline, or the immediate push failed). Continues from the highest serial
 * the local mirror has seen so offline orders keep counting up instead of
 * falling back to a UUID display. The backend counter stays authoritative —
 * its number replaces this provisional one when the order syncs.
 */
export const nextLocalOrderNumber = async (): Promise<number> => {
  if (cachedMaxOrderNumber === null) {
    // Concurrent first calls share one seeding pass; the synchronous increment
    // after the await still hands each caller a distinct number.
    seedMaxPromise ??= seedMaxOrderNumber();
    const seeded = await seedMaxPromise;
    cachedMaxOrderNumber = Math.max(cachedMaxOrderNumber ?? 0, seeded);
  }
  cachedMaxOrderNumber += 1;
  return cachedMaxOrderNumber;
};

export const normalizeOrderPayload = (
  order: any,
  itemAdditions: any[] = [],
) => ({
  id: order.id,
  // Serial stamped locally while offline. The backend honors it permanently
  // (renumbering any web order that took it meanwhile), so tickets printed
  // offline keep their number. Absent for orders the backend numbers itself.
  order_number: order.order_number ?? undefined,
  employee_id: order.employee_id,
  waiter_id: order.waiter_id || "",
  // Carries who actually placed the order. When it differs from waiter_id the
  // backend records it as the cashier so the order is marked "placed by cashier".
  created_by_id: order.created_by_id || "",
  customer_id: order.customer_id,
  table_number: order.table_number || "",
  order_type_label: order.order_type_label || "",
  type: order.type || "cafe",
  // Owner-configured delivery channel this order was placed through, if any.
  // The backend re-validates it (and the waiter allow-list) on sync — see
  // OrderService.resolveDeliveryMethod / assertWaiterAllowedForDelivery.
  delivery_method_id: order.delivery_method_id ?? undefined,
  status: order.status,
  payment_status: order.payment_status,
  created_at: order.created_at,
  is_printed: order.is_printed,
  notes: order.notes || undefined,
  organization_id: order.organization_id ?? undefined,
  org_customer_name: order.org_customer_name || undefined,
  org_customer_phone: order.org_customer_phone || undefined,
  org_customer_notes: order.org_customer_notes || undefined,
  is_price_override: Boolean(order.is_price_override),
  items:
    order.items?.map((item: any) => ({
      id: item.id || generateLocalId(),
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      item_type: item.item_type || "food",
      main_category: item.main_category,
      note: item.note || undefined,
    })) || [],
  total_amount: order.total_amount,
  // Local item-addition audit records for this order, however far along
  // their own separate sync they are. The backend only actually reads this
  // for an order syncing here for the FIRST time (see bulkSync's syncOrder)
  // — for an order that already exists there it's ignored, so it's safe to
  // always include the full set rather than track which ones still need it.
  // Without this, an order that was created AND had items added to it while
  // fully offline would have those additions' deltas baked into `items`
  // above by this sync, AND separately re-applied when that same addition's
  // own dedicated push (POST /orders/:id/items, which every local addition
  // independently retries) lands afterward — silently doubling the quantity.
  item_additions: itemAdditions.map((a: any) => ({
    id: a.id,
    items: a.items,
    added_by: a.added_by,
    added_at: a.added_at,
  })),
});

const syncUnsyncedOrders = async () => {
  const unsyncedOrders = await readUnsyncedRows(localDbTables.orders);
  if (unsyncedOrders.length === 0) return;

  const BATCH_SIZE = 50;

  for (let i = 0; i < unsyncedOrders.length; i += BATCH_SIZE) {
    const batch = unsyncedOrders.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((o: any) => String(o.id));
    const additionsRows =
      batchIds.length > 0
        ? await readRowsWhere(
            localDbTables.itemAdditions,
            inArray(localDbTables.itemAdditions.order_id, batchIds),
          )
        : [];
    const additionsByOrderId = new Map<string, any[]>();
    for (const row of additionsRows as any[]) {
      const key = String((row as any).order_id);
      const list = additionsByOrderId.get(key);
      if (list) list.push(row);
      else additionsByOrderId.set(key, [row]);
    }
    const orderPayloads = batch.map((o: any) =>
      normalizeOrderPayload(o, additionsByOrderId.get(String(o.id)) || []),
    );

    try {
      const resp = await api.post("/orders/sync", {
        orders: orderPayloads,
        payments: [],
      });
      const persisted = extractPersistedOrderIds(resp);
      const assignedNumbers = extractAssignedOrderNumbers(resp);
      const confirmed = persisted
        ? batch.filter((o: any) => persisted.has(String(o.id)))
        : batch;
      for (const order of confirmed) {
        await upsertOrder({
          ...order,
          order_number:
            assignedNumbers.get(String(order.id)) ?? order.order_number,
          synced: 1,
        });
      }
      const skipped = batch.length - confirmed.length;
      console.log(
        "[Orders Sync] Pushed",
        confirmed.length,
        "unsynced orders" + (skipped > 0 ? `; ${skipped} kept for retry` : ""),
      );
    } catch (error) {
      const status = Number((error as any)?.response?.status);
      if (status !== 409) throw error;

      console.warn("[Orders Sync] Batch conflict, retrying individually");
      for (const order of batch) {
        try {
          const singleResp = await api.post("/orders/sync", {
            orders: [
              normalizeOrderPayload(
                order,
                additionsByOrderId.get(String(order.id)) || [],
              ),
            ],
            payments: [],
          });
          await upsertOrder({
            ...order,
            order_number:
              extractAssignedOrderNumbers(singleResp).get(String(order.id)) ??
              order.order_number,
            synced: 1,
          });
        } catch (singleError) {
          const singleStatus = Number((singleError as any)?.response?.status);
          if (singleStatus === 409) {
            console.warn("[Orders Sync] Skipping conflicted order", {
              orderId: order.id,
            });
            await upsertRow(localDbTables.orders, { ...order, synced: 1 });
            continue;
          }
          throw singleError;
        }
      }
    }
  }
};

/**
 * Background push for a just-created order. Not awaited by createCafe — the
 * caller already has its response and the order is visible locally. On
 * success, adopts the backend-assigned serial and marks the row synced;
 * re-reads the current local copy first (rather than reusing the snapshot
 * passed in) since another write — addItems, a status change — may have
 * touched the row while this was in flight. On failure the row stays
 * synced:0 and the generic ordersPushTask/syncUnsyncedOrders retry (same
 * batching used for offline-created orders) picks it up on the next cycle.
 */
const pushCreatedOrder = async (orderId: string, orderPayload: any) => {
  try {
    const resp = await api.post("/orders/sync", {
      orders: [normalizeOrderPayload(orderPayload)],
      payments: [],
    });
    const persisted = extractPersistedOrderIds(resp);
    if (persisted && !persisted.has(String(orderId))) {
      console.warn(
        "[Orders Create] Backend skipped order; keeping it unsynced for retry",
        orderId,
      );
      return;
    }
    const assignedNumbers = extractAssignedOrderNumbers(resp);
    const current = await findOrder(orderId);
    if (!current) return;
    await upsertOrder({
      ...current,
      order_number:
        assignedNumbers.get(String(orderId)) ?? current.order_number,
      synced: 1,
    });
  } catch (err) {
    console.warn(
      "[Orders Create] Background sync failed; queued for retry",
      err,
    );
  }
};

/** Background push for a status change — see pushCreatedOrder for the
 * re-read-before-marking-synced rationale. */
const pushOrderStatus = async (id: string, statusData: any) => {
  try {
    await api.put(`/orders/${id}/status`, statusData);
    const current = await findOrder(id);
    if (current?.id) {
      await upsertOrder({ ...current, synced: 1 });
    }
  } catch (err) {
    console.warn(
      "[Orders UpdateStatus] Background sync failed; queued for retry",
      err,
    );
  }
};

/** Background push for an item addition — see pushCreatedOrder for the
 * re-read-before-marking-synced rationale. */
const pushAddedItems = async (
  orderId: string,
  additionId: string,
  items: any[],
  addedBy: string | number | null,
) => {
  try {
    await api.post(`/orders/${orderId}/items`, {
      items,
      updated_by: addedBy,
      addition_id: additionId,
    });
    await markItemAdditionSynced(additionId);
    // Clear the order's synced flag only once the push confirmed, or the
    // generic ordersPushTask keeps re-pushing this order every sync tick.
    const current = await findOrder(orderId);
    if (current?.id) {
      await upsertOrder({ ...current, synced: 1 });
    }
  } catch (err) {
    console.warn(
      "[Orders AddItems] Background push failed; queued for retry",
      err,
    );
    // Stays synced: 0 — itemAdditionsPushTask retries it (same
    // addition_id, so the backend's idempotency check makes a retry safe).
  }
};

/**
 * Retry additions recorded in `order.meta.pending_additions` — the ones
 * whose local `itemAdditions` audit-row write kept failing even after
 * addItems()'s own retries (see the catch block there). Called by
 * ordersPushTask before it's willing to mark an order `synced: 1`.
 *
 * This matters because the backend's bulk `/orders/sync` — what
 * ordersPushTask normally uses — only updates status/payment_status for an
 * order that already exists there; it never touches `items`. Without this
 * check, ordersPushTask would happily mark the order synced once that bulk
 * call succeeds, even though the added items were never actually
 * communicated — silently and *permanently* losing them, since nothing would
 * ever retry an order already flagged synced.
 *
 * Returns the order (updated in place locally if any entries resolved) so
 * the caller can decide the synced flag from its own fresh copy.
 */
export const pushPendingItemAdditions = async (order: any): Promise<any> => {
  const pending: any[] = Array.isArray(order?.meta?.pending_additions)
    ? order.meta.pending_additions
    : [];
  if (pending.length === 0) return order;

  const stillPending: any[] = [];
  for (const entry of pending) {
    try {
      await api.post(`/orders/${order.id}/items`, {
        items: entry.items,
        updated_by: entry.added_by,
        addition_id: entry.id,
      });
      // Backend confirmed it — self-heal the local audit row too. Best
      // effort: the addition already reached the backend either way, so a
      // failure here just means the local kitchen ticket/audit trail stays
      // thin until the next catch-up pull repopulates it from the server.
      try {
        await upsertRow(localDbTables.itemAdditions, {
          id: entry.id,
          order_id: order.id,
          added_by: entry.added_by,
          added_at: entry.added_at,
          items: entry.items,
          printed: 0,
          synced: 1,
        });
      } catch (auditErr) {
        console.warn(
          "[Orders PendingAdditions] Repair push succeeded but local audit row still failed to write",
          { orderId: order.id, additionId: entry.id },
          auditErr,
        );
      }
    } catch (err) {
      console.warn(
        "[Orders PendingAdditions] Repair push failed; kept pending for next cycle",
        { orderId: order.id, additionId: entry.id },
        err,
      );
      stillPending.push(entry);
    }
  }

  if (stillPending.length === pending.length) return order;

  // Re-read rather than reuse the passed-in snapshot — items/total_amount
  // may have moved on (another addition) since the caller read this order.
  const latest = (await findOrder(order.id)) || order;
  const updated = {
    ...latest,
    meta: {
      ...(latest.meta && typeof latest.meta === "object" ? latest.meta : {}),
      pending_additions: stillPending,
    },
  };
  try {
    await upsertOrder(updated);
  } catch (err) {
    console.warn(
      "[Orders PendingAdditions] Failed to persist repair progress; will retry the same entries next cycle",
      err,
    );
    return latest;
  }
  return updated;
};

/**
 * Retry a local-DB write a few times with a short backoff. The Tauri SQLite
 * connection has no transactions and is shared with several background
 * timers (sync push tasks, auto-print polling), so a write can occasionally
 * hit transient lock contention — this rides that out instead of surfacing
 * an error for what's usually a momentary blip.
 */
const withLocalDbRetries = async <T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 150,
): Promise<T> => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
};

const normalizeOrderItemsForPrinting = async (items: any[]) => {
  return Promise.all(
    (items || []).map(async (item: any) => {
      const mainCategory = await resolveItemCategory(item);
      return {
        ...item,
        id: item.id || generateLocalId(),
        main_category: mainCategory,
        item_type:
          String(item?.item_type || "")
            .trim()
            .toLowerCase() || mainCategory,
      };
    }),
  );
};

const ordersAdapterImpl = {
  getAll: async (params?: any) => {
    if (isOnline()) {
      try {
        await syncUnsyncedOrders();
        // Local data is already the fallback a few lines down — fail fast
        // under a degraded-but-"online" connection instead of riding the
        // default 12s timeout before this page shows anything.
        const response = await api.get("/orders", {
          params,
          timeout: FAST_PROBE_TIMEOUT_MS,
        });
        const remoteOrders =
          response.data?.data?.orders ?? response.data?.orders ?? [];

        if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
          const upserted = await persistServerOrders(remoteOrders);
          console.log("[Orders Sync] Upserting", upserted, "orders");

          const freshLocalOrders = await readLocalOrdersForParams(params);
          const filtered = filterOrdersByParams(freshLocalOrders, params);
          return {
            data: { status: "success", data: filtered },
            status: 200,
            statusText: "OK",
            headers: {},
            config: {} as any,
          };
        }
      } catch (err) {
        console.error("[Orders Sync] Failed to fetch from backend:", err);
      }
    }

    // Fallback to local data
    const localOrders = await readLocalOrdersForParams(params);
    const filtered = filterOrdersByParams(localOrders, params);

    return {
      data: { status: "success", data: filtered },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  getById: async (id: string) => {
    let order = await findOrder(id);

    // The local cashier list only pulls active orders, so a completed/paid
    // order (or one created on another device) may be missing locally, or
    // present but stripped of its items. When online, fetch the full order
    // from the backend and cache it so the detail view has its items.
    const hasItems = Array.isArray(order?.items) && order.items.length > 0;
    if ((!order || !hasItems) && isOnline()) {
      try {
        const resp = await api.get(`/orders/${id}`, {
          timeout: FAST_PROBE_TIMEOUT_MS,
        });
        const remote = resp.data?.data?.order ?? resp.data?.order ?? null;
        if (remote?.id) {
          await persistServerOrders([remote]);
          order = await findOrder(id);
        }
      } catch (err) {
        console.warn("[Orders getById] Backend fetch failed:", err);
      }
    }

    if (order) {
      const waiterName = await resolveWaiterName(order);
      order = { ...order, waiter_name: waiterName, employee_name: waiterName };
      return {
        data: {
          status: "success",
          data: { order: order },
          order: order,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
    }

    return {
      data: { status: "error", message: "Order not found offline" },
      status: 404,
      statusText: "Not Found",
      headers: {},
      config: {} as any,
    } as any;
  },

  syncBulk: async (data: any) => {
    if (isOnline()) {
      return api.post("/orders/sync", data, { timeout: 650000 });
    }

    throw new Error("Offline");
  },

  create: (orderData: any) => ordersAdapterImpl.createCafe(orderData),

  createCafe: async (orderData: any) => {
    const orderId = generateLocalId();
    const normalizedItems = await normalizeOrderItemsForPrinting(
      orderData.items || [],
    );

    const { allow_low_stock_orders } =
      await settingsAdapter.getLocalInventorySettings();
    const { force_table_selection } =
      await settingsAdapter.getLocalTableSelectionSettings();

    // A delivery order or an explicit Take Away both carry no table by
    // design — force_table_selection only blocks placing a dine-in order with
    // no choice made at all, same as the backend's online create() path.
    if (
      force_table_selection &&
      !orderData.delivery_method_id &&
      !orderData.is_takeaway &&
      (!orderData.table_number ||
        isNaN(parseInt(String(orderData.table_number), 10)))
    ) {
      return Promise.reject({
        response: {
          status: 400,
          data: {
            status: "error",
            error: "table_required",
            message: "Table selection is required to create an order.",
          },
        },
      });
    }

    if (!allow_low_stock_orders) {
      const inventoryCheck = await checkOrderInventoryAvailability(
        normalizedItems.map((item) => ({
          ...item,
          menu_item_id: String(item.menu_item_id),
          quantity: Number(item.quantity),
        })),
      );

      if (!inventoryCheck.available) {
        return Promise.reject({
          response: {
            status: 409,
            data: {
              status: "error",
              error: "insufficient_inventory",
              message: "Not enough inventory to create this order.",
              details: inventoryCheck.shortfalls,
            },
          },
        });
      }
    }

    const localOrder: LocalOrder = {
      id: orderId,
      synced: 0,
      is_printed: 0,
      employee_id: orderData.employee_id,
      waiter_id: orderData.waiter_id || orderData.employee_id,
      created_by_id: orderData.created_by_id || orderData.employee_id,
      type: orderData.delivery_method_id ? "delivery" : orderData.type,
      delivery_method_id: orderData.delivery_method_id ?? null,
      status: DEFAULT_ORDER_STATUS,
      // Delivery orders are paid through delivery_payments, never the normal
      // payments table — leave the payment axis untouched for them, same as
      // the backend's online create()/syncOrder paths.
      payment_status: orderData.delivery_method_id
        ? null
        : DEFAULT_PAYMENT_STATUS,
      total_amount: orderData.total_amount,
      organization_id: orderData.organization_id ?? null,
      // Display-only context for who at the organization this order is for
      // — never read for billing. Carried through normalizeOrderPayload on
      // sync so the backend can stash it on the order's `meta`.
      org_customer_name: orderData.org_customer_name || undefined,
      org_customer_phone: orderData.org_customer_phone || undefined,
      org_customer_notes: orderData.org_customer_notes || undefined,
      is_price_override: Boolean(orderData.is_price_override),
      notes: orderData.notes || "",
      table_number: orderData.delivery_method_id
        ? null
        : orderData.table_number || null,
      created_at: getApproximateServerIsoString(),
      updated_at: getApproximateServerIsoString(),
      items: normalizedItems,
    };

    // Stamp a provisional serial up front so the order never shows up as a
    // UUID. The backend honors this permanently (renumbering any web order
    // that took it meanwhile) once the background push below lands — the
    // same scheme already used for offline-created orders — so it's safe to
    // do unconditionally instead of only when the immediate push fails.
    localOrder.order_number = await nextLocalOrderNumber();

    // Local-first: write and return immediately so order creation never waits
    // on the network, regardless of connection quality. The push runs in the
    // background; ordersPushTask retries it if it fails.
    await upsertOrder(localOrder);
    void pushCreatedOrder(orderId, localOrder);

    return {
      data: { status: "success", data: { id: orderId, ...localOrder } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  updateStatus: async (id: string, statusData: any) => {
    if (!id) return buildResponse({});
    // Local-first: write and return immediately so a status change (e.g.
    // marking an order done) never waits on the network. The push runs in
    // the background; ordersPushTask retries it if it fails.
    const response = await updateOrderWithChanges(id, {
      status: statusData.status,
    });
    void pushOrderStatus(id, statusData);
    return response;
  },

  updateItems: async (id: string, itemsData: any) => {
    return updateOrderWithChanges(id, { items: itemsData.items });
  },
  addItems: async (id: string, itemsData: any) => {
    const order = await findOrder(id);
    if (!order || !order.id) {
      return {
        data: { status: "error", message: "Order not found locally" },
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: {} as any,
      } as any;
    }

    const normalizedNewItems = await normalizeOrderItemsForPrinting(
      itemsData.items || [],
    );
    if (normalizedNewItems.length === 0) {
      return {
        data: { status: "success" },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
    }

    // Idempotent replay guard: callers (the cashier "add items" screen, the
    // admin order dialog) generate this id once per submit attempt and reuse
    // it if the user retries after an error, rather than minting a fresh one
    // on every call. `applied_addition_ids` lives in the order's own `meta`
    // and is written in the SAME call as the items merge below, so the two
    // can never disagree — unlike a separate `itemAdditions` audit-row write,
    // which can independently fail and leave no record to check on retry
    // (that gap is what let a retry re-merge the items a second time).
    // Callers that don't pass an addition_id (older code paths) fall back to
    // a fresh one each call, which just disables this guard for them.
    const additionId = itemsData.addition_id || generateLocalId();
    const appliedAdditionIds: string[] = Array.isArray(
      order.meta?.applied_addition_ids,
    )
      ? order.meta.applied_addition_ids
      : [];
    if (appliedAdditionIds.includes(additionId)) {
      // Already merged into order.items by an earlier call. If that earlier
      // call's audit-row write or backend push never landed, nudge it again
      // — but never re-merge the items themselves.
      const existingAddition = await findById(
        localDbTables.itemAdditions,
        additionId,
      );
      if (!existingAddition || Number(existingAddition.synced ?? 0) === 0) {
        void pushAddedItems(
          id,
          additionId,
          existingAddition?.items || normalizedNewItems,
          existingAddition?.added_by ??
            itemsData.updated_by ??
            getSessionUser()?.id ??
            null,
        );
      }
      return {
        data: { status: "success", data: { addition_id: additionId } },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };
    }

    const addedBy = itemsData.updated_by ?? getSessionUser()?.id ?? null;
    const addedAt = getApproximateServerIsoString();

    // Local-first apply: the on-screen order and the kitchen ticket must not
    // wait on the network. The push below runs in the background so this
    // function returns as soon as the local write lands, regardless of
    // connection quality.
    //
    // Merge by menu_item_id to mirror the backend's addOrderItems (see
    // order.service.ts): re-adding a menu item that's already on the order
    // bumps that line's quantity/subtotal instead of appending a duplicate
    // line, so offline and online behavior stay consistent once synced.
    const updatedItems = [...(order.items || [])];
    for (const newItem of normalizedNewItems) {
      const existingIndex = updatedItems.findIndex(
        (existing: any) =>
          String(existing.menu_item_id) === String(newItem.menu_item_id),
      );
      if (existingIndex >= 0) {
        const existing = updatedItems[existingIndex];
        const newQuantity =
          Number(existing.quantity) + Number(newItem.quantity);
        updatedItems[existingIndex] = {
          ...existing,
          quantity: newQuantity,
          subtotal: Number(newItem.unit_price) * newQuantity,
        };
      } else {
        updatedItems.push(newItem);
      }
    }
    // total_amount must be recomputed here — it's a stored column, not derived
    // from `items` on read, so leaving it untouched left the cashier confirming
    // payment for the pre-addition total after adding items to an order.
    const updatedTotal = updatedItems.reduce(
      (sum, item) => sum + (parseFloat(item.subtotal) || 0),
      0,
    );
    // The merge and the `applied_addition_ids` marker land in this one write,
    // so they can't go out of sync with each other — either both take effect
    // or neither does, and a failed write here is safe to retry from scratch
    // since nothing partial was recorded.
    await upsertOrder({
      ...order,
      items: updatedItems,
      total_amount: updatedTotal,
      updated_at: addedAt,
      synced: 0,
      meta: {
        ...(order.meta && typeof order.meta === "object" ? order.meta : {}),
        applied_addition_ids: [...appliedAdditionIds, additionId],
      },
    });

    // The merge above is the financially important write and has already
    // landed and is durably guarded against re-applying (see the marker
    // written just above). This audit row (kitchen "added later" ticket,
    // nicer backend payload) is comparatively cheap but can still hit the
    // same transient local-DB lock contention — retry it a few times rather
    // than letting the whole call throw. Unlike before the marker existed,
    // even a total failure here no longer risks a double-merge on retry.
    try {
      await withLocalDbRetries(
        () =>
          upsertRow(localDbTables.itemAdditions, {
            id: additionId,
            order_id: id,
            added_by: addedBy,
            added_at: addedAt,
            items: normalizedNewItems,
            printed: 0,
            synced: 0,
          }),
        5,
      );
    } catch (err) {
      console.warn(
        "[Orders AddItems] Failed to write item-addition audit row after retries; recording it for background repair",
        err,
      );
      // Without this, itemAdditionsPushTask (which retries by scanning that
      // table) would have nothing to find, and — since the order still
      // carries `synced: 0` from the merge write above — ordersPushTask
      // would keep re-pushing it via the generic /orders/sync endpoint,
      // which ignores `items` for an order that already exists and so would
      // never actually deliver this addition. Recording it here in `meta`
      // (itself durable — see pushPendingItemAdditions) is what lets that
      // task find and retry it instead of silently marking the order synced
      // once its unrelated status/payment_status push happens to succeed.
      try {
        await withLocalDbRetries(async () => {
          const latest = await findOrder(id);
          if (!latest) return;
          const pending = Array.isArray(latest.meta?.pending_additions)
            ? latest.meta.pending_additions
            : [];
          if (pending.some((p: any) => p.id === additionId)) return;
          await upsertOrder({
            ...latest,
            meta: {
              ...(latest.meta && typeof latest.meta === "object"
                ? latest.meta
                : {}),
              pending_additions: [
                ...pending,
                {
                  id: additionId,
                  items: normalizedNewItems,
                  added_by: addedBy,
                  added_at: addedAt,
                },
              ],
            },
          });
        }, 3);
      } catch (repairErr) {
        console.warn(
          "[Orders AddItems] Also failed to record addition for background repair; it will not auto-recover until this order is touched again",
          repairErr,
        );
      }
    }

    void pushAddedItems(id, additionId, normalizedNewItems, addedBy);

    return {
      data: { status: "success", data: { addition_id: additionId } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  markReady: async (id: string, data: any) => {
    // Lifecycle collapsed to {pending, done, cancelled}: "ready" is "done".
    return updateOrderWithChanges(id, { status: "done" });
  },
  complete: async (id: string, data: any) => {
    return updateOrderWithChanges(id, { status: "done" });
  },
  getPending: async (params?: any) => {
    const pendingLocal = await readRowsWhere(
      localDbTables.orders,
      eq(localDbTables.orders.status, "pending"),
    );

    return {
      data: { status: "success", data: pendingLocal },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  getReady: async (params?: any) => {
    const readyLocal = await readRowsWhere(
      localDbTables.orders,
      eq(localDbTables.orders.status, "done"),
    );

    return {
      data: { status: "success", data: readyLocal },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  getKitchenOrders: async () => {
    const pendingLocal = await readRowsWhere(
      localDbTables.orders,
      eq(localDbTables.orders.status, "pending"),
    );
    const kitchenOrders = pendingLocal.filter((o) => o.type === "cafe");
    return {
      data: { status: "success", data: kitchenOrders },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  getStatusHistory: async (id: string) => {
    let order = await findOrder(id);
    // Return mock status history based on current order status
    const history = order
      ? [
          {
            status: order.status,
            timestamp: order.updated_at,
            notes: "Order status updated locally",
          },
        ]
      : [];
    return {
      data: { status: "success", data: history },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  getOrdersForPayment: async (params?: any) => {
    // Narrow out closed orders in SQL first — done/cancelled is the vast
    // majority of history on a long-running till, and this list is polled
    // repeatedly by the cashier dashboard.
    const openLocalOrders = await readRowsWhere(
      localDbTables.orders,
      or(
        isNull(localDbTables.orders.status),
        notInArray(localDbTables.orders.status, ["done", "cancelled"]),
      ),
    );
    const scopedOrders = filterOrdersByParams(openLocalOrders, params);
    // Awaiting-payment queue: exclude anything already closed. With the
    // collapsed vocab a paid order is `done`, so the old check (completed/paid)
    // missed them and they leaked back into the queue. Key off the payment axis
    // and exclude the terminal lifecycle states (legacy values kept tolerant).
    const activeLocalOrders = scopedOrders.filter((o) => {
      const st = String(o.status || "").toLowerCase();
      const pst = String(o.payment_status || "").toLowerCase();
      // Delivery orders are paid through delivery_payments and tracked on
      // their own Deliveries page — never the cashier dashboard's stat cards
      // or pending-orders queue (see order.service.ts on the backend, which
      // excludes them from the equivalent cashier-queue endpoint the same way).
      if (String(o.type || "").toLowerCase() === "delivery") return false;
      // Organization orders are never collected as cash — only the owner can
      // confirm one (from the Organizations "Orders" tab), which posts the
      // charge to the organization's credit ledger, not `payments`. A cashier
      // must never see one in their payment queue.
      if (o.organization_id) return false;
      return (
        pst !== "paid" &&
        st !== "done" &&
        st !== "cancelled" &&
        st !== "completed" &&
        st !== "paid"
      );
    });

    const waiterNameById = await resolveWaiterNamesFor(activeLocalOrders);
    const ordersWithWaiter = activeLocalOrders.map((order) => {
      const waiterId = orderWaiterId(order);
      const waiterName =
        (waiterId && waiterNameById.get(waiterId)) || DEFAULT_WAITER_NAME;
      return { ...order, waiter_name: waiterName, employee_name: waiterName };
    });

    return {
      data: {
        status: "success",
        data: { orders: ordersWithWaiter },
        orders: ordersWithWaiter,
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    } as any;
  },
  getOccupiedTables: async () => {
    // A table is occupied while its order is still open. With the collapsed
    // vocab that is just "pending" (preparing/ready folded into it).
    const pendingLocal = await readRowsWhere(
      localDbTables.orders,
      eq(localDbTables.orders.status, "pending"),
    );
    const occupiedOrders = pendingLocal.filter(
      (o) => o.type === "cafe" && o.table_number != null,
    );

    occupiedOrders.sort((a, b) => {
      const ta = parseInt(String(a.table_number), 10);
      const tb = parseInt(String(b.table_number), 10);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
      return String(a.table_number).localeCompare(String(b.table_number));
    });

    const waiterNameById = await resolveWaiterNamesFor(occupiedOrders);
    const results = occupiedOrders.map((order) => {
      const waiterId = orderWaiterId(order);
      const waiterName =
        (waiterId && waiterNameById.get(waiterId)) || DEFAULT_WAITER_NAME;
      return {
        table_number: order.table_number,
        order_id: order.id,
        status: order.status,
        waiter_name: waiterName,
      };
    });

    return {
      data: { status: "success", data: results },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  getUnprinted: async (config?: any) => {
    // The cashier auto-print loop calls this every ~2s. Narrow to SQL first
    // (indexed status/is_printed columns) instead of pulling and JSON-parsing
    // every order the branch has ever taken — the old readRows() full scan
    // got slower every month as order history grew, on a fixed 2s timer.
    const candidates = await readRowsWhere(
      localDbTables.orders,
      and(
        inArray(
          localDbTables.orders.status,
          Array.from(KITCHEN_PRINT_STATUSES),
        ),
        eq(localDbTables.orders.is_printed, 0),
      ),
    );
    const unprinted = candidates
      .filter((item: any) => shouldAutoPrintOrder(item))
      .sort((a: any, b: any) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return ta - tb;
      });
    return {
      data: {
        status: "success",
        data: { orders: unprinted },
        orders: unprinted,
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    } as any;
  },

  getReceiptImages: async (id: string) => {
    // Receipt images are not available in offline mode
    return {
      data: { status: "success", data: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  getTicketPayload: async (id: string) => {
    const order = await findOrder(id);
    if (order) {
      const waiterName = await resolveWaiterName(order);
      const payloadBase64 = generateEscPosBase64(order, waiterName);
      return buildResponse({ payload: payloadBase64 });
    }
    return buildErrorResponse("Ticket payload not found locally");
  },

  markPrinted: async (id: string) => {
    let order = await findOrder(id);

    if (order) {
      const updated = {
        ...order,
        is_printed: 1,
        meta: {
          ...(order.meta && typeof order.meta === "object" ? order.meta : {}),
          is_printed: 1,
        },
        updated_at: getApproximateServerIsoString(),
      };
      await upsertOrder(updated);
    }

    return {
      data: { status: "success" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  /** Item-addition rows not yet printed on this device. Polled every ~2s by
   * the auto-print engine, same cadence/shape as getUnprinted() for orders. */
  getUnprintedItemAdditions: async () => {
    const itemAdditions = await readRowsWhere(
      localDbTables.itemAdditions,
      eq(localDbTables.itemAdditions.printed, 0),
    );
    return {
      data: { status: "success", data: { itemAdditions } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  /**
   * Orders that were cancelled after already being sent to the kitchen — i.e.
   * a void/cancellation ticket is owed so the stations that fired the original
   * ticket know to stop. Narrowed the same way as getUnprinted(): SQL-first on
   * the indexed status/is_printed columns, polled every ~2s by the auto-print
   * engine. Orders cancelled before ever printing are excluded — no ticket
   * ever reached the kitchen, so there's nothing to void.
   *
   * Also gated by the branch's print_cancelled_order_tickets setting
   * (owner-set from the web dashboard, off by default): when disabled this
   * returns no orders, so the poll in useCashierPrinting simply has nothing
   * to print — no change needed there.
   */
  getPendingCancellationPrints: async () => {
    const { print_cancelled_order_tickets } =
      await settingsAdapter.getLocalCancellationPrintSettings();
    let orders: any[] = [];
    if (print_cancelled_order_tickets) {
      const rows = await readRowsWhere(
        localDbTables.orders,
        and(
          eq(localDbTables.orders.status, "cancelled"),
          eq(localDbTables.orders.is_printed, 1),
        ),
      );
      // `updated_at` is set the moment an order transitions to cancelled (a
      // terminal status, never touched again — see the backend's
      // updateStatus) so it doubles as "when this was voided." Anything
      // older than the window is a stale row surfacing again, not a fresh
      // cancellation — see CANCEL_PRINT_WINDOW_MS above.
      const cutoff =
        getApproximateServerDate().getTime() - CANCEL_PRINT_WINDOW_MS;
      orders = rows.filter((order: any) => {
        const at = Date.parse(order?.updated_at || order?.created_at || "");
        return Number.isFinite(at) && at >= cutoff;
      });
    }
    return {
      data: { status: "success", data: { orders } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  markItemAdditionPrinted: async (additionId: string) => {
    await patchItemAddition(additionId, { printed: 1 });
    return {
      data: { status: "success" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  /** Local audit trail for one order's item additions — "Added later" list in
   * the UI. Always available offline since it's populated as additions are
   * created/received, independent of whether they've reached the backend. */
  getItemAdditions: async (orderId: string) => {
    const rows = await readRowsWhere(
      localDbTables.itemAdditions,
      eq(localDbTables.itemAdditions.order_id, orderId),
    );
    const usersRows = await readRows(localDbTables.users);
    const usersById = new Map<string, any>(
      usersRows.map((u: any) => [String(u.id), u]),
    );
    const itemAdditions = rows
      .map((row: any) => {
        const addedByUser = row.added_by
          ? usersById.get(String(row.added_by))
          : null;
        return {
          ...row,
          added_by_name: addedByUser ? nameFromUserRow(addedByUser) : null,
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.added_at || 0).getTime() -
          new Date(a.added_at || 0).getTime(),
      );
    return {
      data: { status: "success", data: { itemAdditions } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  printOrderNative: async (id: string, printerName?: string) => {
    const order = await findOrder(id);
    if (!order) {
      throw new Error("Order not found locally");
    }

    const waiterName = await resolveWaiterName(order);
    const { print_thermal_printer } =
      await import("tauri-plugin-thermal-printer");
    const availablePrinters = await listAvailablePrinters();
    const targetPrinter = resolvePrinter(printerName, availablePrinters);

    // Department routing is the primary path. Simple printing mode is only a
    // FALLBACK: when a department (or station) has no printer assigned, or its
    // assigned printer isn't present on this device, we fall back to the single
    // active printer — but only if simple mode is turned on. If simple mode is
    // off and there's no usable routed printer, that ticket is not printed.
    const simplePrintMode = getSimplePrintMode();
    const simplePrinter = simplePrintMode
      ? resolvePrinter(printerName || getActivePrinterName(), availablePrinters)
      : "";
    const showPricesOnTicket = getTicketShowPrices();

    // Pick the printer for one ticket. Prefer the configured printer when it
    // actually exists on this device (routing "on"); otherwise fall back to the
    // simple/active printer when simple mode allows it; otherwise null → skip.
    // `viaFallback` tells callers the ticket printed through simple mode rather
    // than its own route — the price toggle only applies to those tickets.
    const pickPrinter = (
      configured?: string,
    ): { printer: string; viaFallback: boolean } | null => {
      const name = String(configured || "").trim();
      if (name && availablePrinters.includes(name)) {
        return { printer: name, viaFallback: false };
      }
      if (simplePrintMode && simplePrinter) {
        return { printer: simplePrinter, viaFallback: true };
      }
      return null;
    };

    // Group items by main_category (prefer menu.main_category, then item fields)
    const itemsByDept: Record<string, any[]> = {};
    const itemDeptPairs = await Promise.all(
      (order.items || []).map(async (item: any) => ({
        item,
        dept: await resolveItemCategory(item),
      })),
    );
    for (const { item, dept } of itemDeptPairs) {
      if (!itemsByDept[dept]) itemsByDept[dept] = [];
      itemsByDept[dept].push(item);
    }

    const departments = Object.keys(itemsByDept);
    if (departments.length === 0) return true;

    const jobsByPrinter: Record<string, any> = {};

    const printedAtDate = order.created_at
      ? new Date(order.created_at)
      : getApproximateServerDate();
    const orderNote = String(order.notes || "").trim();

    // Build one department/station ticket. `headerLabel` is the bold line under
    // the title (e.g. "DEPT: BUTCHERY", "BUTCHER", "CUSTOMER COPY"). When
    // `showPrices` is set the ticket carries per-line subtotals and a total —
    // used for the customer's copy; prep tickets (butcher/kitchen) stay
    // price-free so the line cooks don't get distracted by money.
    const buildTicketBlocks = (
      deptItems: any[],
      headerLabel: string,
      showPrices: boolean,
    ): ReceiptBlock[] => {
      const colWidths = showPrices ? [6, 26, 16] : ORDER_TICKET_COLUMN_WIDTHS;
      const colAligns: ("left" | "right" | "center")[] = showPrices
        ? ["center", "left", "right"]
        : ORDER_TICKET_COLUMN_ALIGNS;

      const blocks: ReceiptBlock[] = [
        { kind: "title", text: "Syntax services" },
        {
          kind: "text",
          text: headerLabel,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Order: ${formatOrderNumber(order)}`,
          align: "center",
          bold: true,
          large: true,
        },
        { kind: "divider" },
        order.table_number
          ? {
              kind: "text",
              text: `Table: #${order.table_number}`,
              align: "center",
              bold: true,
            }
          : {
              kind: "text",
              text: "Type: Take Away",
              align: "center",
              bold: true,
            },
        {
          kind: "text",
          text: `Waiter: ${waiterName}`,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Date: ${printedAtDate.toLocaleString()}`,
          align: "center",
          bold: true,
        },
        { kind: "divider" },
        {
          kind: "row",
          widths: colWidths,
          align: colAligns,
          bold: true,
          cells: showPrices ? ["Qty", "Item", "Subtotal"] : ["Qty", "Item"],
        },
        // Each item: a row, followed by its own note (if any) on the next
        // line(s). Per-item notes ride with their item, so they only print on
        // the ticket that actually makes that item.
        ...deptItems.flatMap((item: any): ReceiptBlock[] => {
          const name = String(item.menu_item_name || "Item");
          const itemBlocks: ReceiptBlock[] = [
            {
              kind: "row",
              widths: colWidths,
              align: colAligns,
              bold: true,
              cells: showPrices
                ? [
                    `X ${String(item.quantity)}`,
                    name,
                    (parseFloat(item.subtotal) || 0).toFixed(2),
                  ]
                : [`X ${String(item.quantity)}`, name],
            },
          ];
          const itemNote = String(item.note || item.notes || "").trim();
          if (itemNote) {
            for (const line of wrapTicketText(`- ${itemNote}`)) {
              itemBlocks.push({ kind: "text", text: line, align: "center" });
            }
          }
          return itemBlocks;
        }),
      ];

      if (showPrices) {
        const deptTotal = deptItems.reduce(
          (sum, item) => sum + (parseFloat(item.subtotal) || 0),
          0,
        );
        blocks.push(
          { kind: "divider" },
          {
            kind: "text",
            text: `TOTAL: ${deptTotal.toFixed(2)}`,
            align: "center",
            bold: true,
            large: true,
          },
        );
      }

      if (orderNote) {
        blocks.push(
          { kind: "divider" },
          { kind: "text", text: "NOTE", align: "center", bold: true },
          ...wrapTicketText(orderNote).map(
            (line): ReceiptBlock => ({
              kind: "text",
              text: line,
              align: "center",
              bold: true,
            }),
          ),
        );
      }

      return blocks;
    };

    // Render `blocks` and queue it onto `printerName`'s job `copies` times.
    // Tickets bound for the same printer are concatenated into one job (each
    // with its own cut) so a printer fires once per order.
    const queueTicket = async (
      blocks: ReceiptBlock[],
      printerName: string,
      copies: number,
    ) => {
      const deptPrinter =
        resolvePrinter(printerName, availablePrinters) || targetPrinter;
      const imageDatas = await renderReceiptImages(blocks);
      const printerKey = String(deptPrinter || "").trim();
      for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
        if (!jobsByPrinter[printerKey]) {
          jobsByPrinter[printerKey] = createPrintJob(imageDatas, deptPrinter);
        } else {
          jobsByPrinter[printerKey].sections.push(
            ...ticketSections(imageDatas),
          );
        }
      }
    };

    const skippedDepartments: string[] = [];

    for (const dept of departments) {
      const deptItems = itemsByDept[dept];
      // Department routing is primary; simple mode only fills in when a route is
      // missing or points at a printer that isn't on this device.
      const stations = getDepartmentStations(dept);

      if (stations.length > 0) {
        // Advanced routing (e.g. butchery): fan the same items out to each
        // station's printer with that station's label, copies and price flag.
        for (const station of stations) {
          const pick = pickPrinter(station.printer);
          if (!pick) {
            skippedDepartments.push(`${dept} (${station.label || "station"})`);
            continue;
          }
          const headerLabel = station.label || `DEPT: ${dept.toUpperCase()}`;
          // A station keeps its own price flag when it prints on its own route.
          // If it fell back to simple printing, the simple-print price toggle
          // takes over.
          const showPrices = pick.viaFallback
            ? showPricesOnTicket
            : station.showPrices;
          const blocks = buildTicketBlocks(deptItems, headerLabel, showPrices);
          await queueTicket(blocks, pick.printer, station.copies);
        }
      } else {
        // Default: a single prep ticket to the department's printer, or the
        // active printer via the simple-mode fallback. This branch has no
        // per-station copies, so the global "number of copies" setting is the
        // sole copy control here. Department-routed tickets stay price-free;
        // only simple-print fallback tickets follow the price toggle.
        const pick = pickPrinter(getPrinterForDepartment(dept));
        if (!pick) {
          skippedDepartments.push(dept);
          continue;
        }
        const showPrices = pick.viaFallback ? showPricesOnTicket : false;
        const blocks = buildTicketBlocks(
          deptItems,
          `DEPT: ${dept.toUpperCase()}`,
          showPrices,
        );
        await queueTicket(blocks, pick.printer, getPrintCopies());
      }
    }

    // Nothing could be routed and simple-mode fallback wasn't available/allowed.
    // Surface it to the caller so the print-failure banner shows, rather than
    // silently reporting success for an order that never printed.
    if (Object.keys(jobsByPrinter).length === 0) {
      throw new Error(
        simplePrintMode
          ? "No printer is available to print the order ticket. Check that a printer is connected."
          : "No printer is configured for this order's departments. Assign printers in Printer Settings, or turn on Simple printing mode to use the active printer.",
      );
    }

    if (skippedDepartments.length > 0) {
      console.warn(
        `[print] Some tickets were not printed (no routed printer, simple fallback ${simplePrintMode ? "unavailable" : "off"}): ${skippedDepartments.join(", ")}`,
      );
    }

    const printJobs = Object.values(jobsByPrinter).map((job: any) =>
      print_thermal_printer(job as any),
    );

    await Promise.allSettled(printJobs);

    return true;
  },

  /**
   * Print a ticket for items added to an order after it was already created,
   * scoped to just the addition's own item snapshot (never derived from the
   * order's post-merge `items` — a repeat item's addition must show "+1", not
   * the order's new running total). Mirrors printOrderNative's department
   * routing/printer-picking/job-queueing, with a bold "UPDATED — ITEMS ADDED"
   * banner so kitchen staff recognize it as an addition, not a duplicate of
   * the original ticket.
   */
  printAddedItemsNative: async (
    orderId: string,
    additionItems: any[],
    printerName?: string,
  ) => {
    const order = await findOrder(orderId);
    if (!order) {
      throw new Error("Order not found locally");
    }
    if (!Array.isArray(additionItems) || additionItems.length === 0) {
      return true;
    }

    const waiterName = await resolveWaiterName(order);
    const { print_thermal_printer } =
      await import("tauri-plugin-thermal-printer");
    const availablePrinters = await listAvailablePrinters();
    const targetPrinter = resolvePrinter(printerName, availablePrinters);

    const simplePrintMode = getSimplePrintMode();
    const simplePrinter = simplePrintMode
      ? resolvePrinter(printerName || getActivePrinterName(), availablePrinters)
      : "";
    const showPricesOnTicket = getTicketShowPrices();

    const pickPrinter = (
      configured?: string,
    ): { printer: string; viaFallback: boolean } | null => {
      const name = String(configured || "").trim();
      if (name && availablePrinters.includes(name)) {
        return { printer: name, viaFallback: false };
      }
      if (simplePrintMode && simplePrinter) {
        return { printer: simplePrinter, viaFallback: true };
      }
      return null;
    };

    const itemsByDept: Record<string, any[]> = {};
    const itemDeptPairs = await Promise.all(
      additionItems.map(async (item: any) => ({
        item,
        dept: await resolveItemCategory(item),
      })),
    );
    for (const { item, dept } of itemDeptPairs) {
      if (!itemsByDept[dept]) itemsByDept[dept] = [];
      itemsByDept[dept].push(item);
    }

    const departments = Object.keys(itemsByDept);
    if (departments.length === 0) return true;

    const jobsByPrinter: Record<string, any> = {};
    const printedAtDate = getApproximateServerDate();

    const buildAddedItemsTicketBlocks = (
      deptItems: any[],
      headerLabel: string,
      showPrices: boolean,
    ): ReceiptBlock[] => {
      const colWidths = showPrices ? [6, 26, 16] : ORDER_TICKET_COLUMN_WIDTHS;
      const colAligns: ("left" | "right" | "center")[] = showPrices
        ? ["center", "left", "right"]
        : ORDER_TICKET_COLUMN_ALIGNS;

      const blocks: ReceiptBlock[] = [
        { kind: "title", text: "Syntax services" },
        {
          kind: "text",
          text: "⚠ UPDATED — ITEMS ADDED",
          align: "center",
          bold: true,
          large: true,
        },
        {
          kind: "text",
          text: headerLabel,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Order: ${formatOrderNumber(order)}`,
          align: "center",
          bold: true,
          large: true,
        },
        { kind: "divider" },
        order.table_number
          ? {
              kind: "text",
              text: `Table: #${order.table_number}`,
              align: "center",
              bold: true,
            }
          : {
              kind: "text",
              text: "Type: Take Away",
              align: "center",
              bold: true,
            },
        {
          kind: "text",
          text: `Waiter: ${waiterName}`,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Added: ${printedAtDate.toLocaleString()}`,
          align: "center",
          bold: true,
        },
        { kind: "divider" },
        {
          kind: "row",
          widths: colWidths,
          align: colAligns,
          bold: true,
          cells: showPrices ? ["Qty", "Item", "Subtotal"] : ["Qty", "Item"],
        },
        ...deptItems.flatMap((item: any): ReceiptBlock[] => {
          const name = String(item.menu_item_name || "Item");
          const itemBlocks: ReceiptBlock[] = [
            {
              kind: "row",
              widths: colWidths,
              align: colAligns,
              bold: true,
              cells: showPrices
                ? [
                    `X ${String(item.quantity)}`,
                    name,
                    (parseFloat(item.subtotal) || 0).toFixed(2),
                  ]
                : [`X ${String(item.quantity)}`, name],
            },
          ];
          const itemNote = String(item.note || item.notes || "").trim();
          if (itemNote) {
            for (const line of wrapTicketText(`- ${itemNote}`)) {
              itemBlocks.push({ kind: "text", text: line, align: "center" });
            }
          }
          return itemBlocks;
        }),
      ];

      if (showPrices) {
        const deptTotal = deptItems.reduce(
          (sum, item) => sum + (parseFloat(item.subtotal) || 0),
          0,
        );
        blocks.push(
          { kind: "divider" },
          {
            kind: "text",
            text: `ADDED TOTAL: ${deptTotal.toFixed(2)}`,
            align: "center",
            bold: true,
            large: true,
          },
        );
      }

      return blocks;
    };

    const queueTicket = async (
      blocks: ReceiptBlock[],
      printerName: string,
      copies: number,
    ) => {
      const deptPrinter =
        resolvePrinter(printerName, availablePrinters) || targetPrinter;
      const imageDatas = await renderReceiptImages(blocks);
      const printerKey = String(deptPrinter || "").trim();
      for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
        if (!jobsByPrinter[printerKey]) {
          jobsByPrinter[printerKey] = createPrintJob(imageDatas, deptPrinter);
        } else {
          jobsByPrinter[printerKey].sections.push(
            ...ticketSections(imageDatas),
          );
        }
      }
    };

    for (const dept of departments) {
      const deptItems = itemsByDept[dept];
      const stations = getDepartmentStations(dept);

      if (stations.length > 0) {
        for (const station of stations) {
          const pick = pickPrinter(station.printer);
          if (!pick) continue;
          const headerLabel = station.label || `DEPT: ${dept.toUpperCase()}`;
          const showPrices = pick.viaFallback
            ? showPricesOnTicket
            : station.showPrices;
          const blocks = buildAddedItemsTicketBlocks(
            deptItems,
            headerLabel,
            showPrices,
          );
          await queueTicket(blocks, pick.printer, station.copies);
        }
      } else {
        const pick = pickPrinter(getPrinterForDepartment(dept));
        if (!pick) continue;
        const showPrices = pick.viaFallback ? showPricesOnTicket : false;
        const blocks = buildAddedItemsTicketBlocks(
          deptItems,
          `DEPT: ${dept.toUpperCase()}`,
          showPrices,
        );
        await queueTicket(blocks, pick.printer, getPrintCopies());
      }
    }

    // Unlike printOrderNative, a routing gap here isn't fatal to the caller —
    // the addition is still marked printed (this ticket type isn't part of the
    // stuck-order retry banner) but we still surface it for visibility.
    if (Object.keys(jobsByPrinter).length === 0) {
      console.warn(
        `[print] Added-items ticket for order ${orderId} had no routed printer for departments: ${departments.join(", ")}`,
      );
      return false;
    }

    const printJobs = Object.values(jobsByPrinter).map((job: any) =>
      print_thermal_printer(job as any),
    );
    await Promise.allSettled(printJobs);

    return true;
  },

  /**
   * Print a void ticket for an order that was cancelled after its prep ticket
   * already went to the kitchen — routed to the same department/station
   * printers as the original ticket (mirrors printOrderNative's routing) so
   * every station that fired the order also gets told to stop. Each item line
   * prints struck through and the ticket carries a bold "ORDER CANCELLED"
   * banner, so it reads unmistakably as a void, not a duplicate of the
   * original ticket. Price-free like other prep tickets — this is an
   * operational stop notice, not a receipt.
   */
  printCancelledOrderNative: async (id: string, printerName?: string) => {
    const order = await findOrder(id);
    if (!order) {
      throw new Error("Order not found locally");
    }

    const waiterName = await resolveWaiterName(order);
    const { print_thermal_printer } =
      await import("tauri-plugin-thermal-printer");
    const availablePrinters = await listAvailablePrinters();
    const targetPrinter = resolvePrinter(printerName, availablePrinters);

    const simplePrintMode = getSimplePrintMode();
    const simplePrinter = simplePrintMode
      ? resolvePrinter(printerName || getActivePrinterName(), availablePrinters)
      : "";

    const pickPrinter = (
      configured?: string,
    ): { printer: string; viaFallback: boolean } | null => {
      const name = String(configured || "").trim();
      if (name && availablePrinters.includes(name)) {
        return { printer: name, viaFallback: false };
      }
      if (simplePrintMode && simplePrinter) {
        return { printer: simplePrinter, viaFallback: true };
      }
      return null;
    };

    const itemsByDept: Record<string, any[]> = {};
    const itemDeptPairs = await Promise.all(
      (order.items || []).map(async (item: any) => ({
        item,
        dept: await resolveItemCategory(item),
      })),
    );
    for (const { item, dept } of itemDeptPairs) {
      if (!itemsByDept[dept]) itemsByDept[dept] = [];
      itemsByDept[dept].push(item);
    }

    const departments = Object.keys(itemsByDept);
    if (departments.length === 0) return true;

    const jobsByPrinter: Record<string, any> = {};
    const cancelledAtDate = getApproximateServerDate();

    const buildCancelledTicketBlocks = (
      deptItems: any[],
      headerLabel: string,
    ): ReceiptBlock[] => {
      const colWidths = ORDER_TICKET_COLUMN_WIDTHS;
      const colAligns = ORDER_TICKET_COLUMN_ALIGNS;

      return [
        { kind: "title", text: "Syntax services" },
        {
          kind: "text",
          text: "*** ORDER CANCELLED ***",
          align: "center",
          bold: true,
          large: true,
        },
        {
          kind: "text",
          text: headerLabel,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Order: ${formatOrderNumber(order)}`,
          align: "center",
          bold: true,
          large: true,
        },
        { kind: "divider" },
        order.table_number
          ? {
              kind: "text",
              text: `Table: #${order.table_number}`,
              align: "center",
              bold: true,
            }
          : {
              kind: "text",
              text: "Type: Take Away",
              align: "center",
              bold: true,
            },
        {
          kind: "text",
          text: `Waiter: ${waiterName}`,
          align: "center",
          bold: true,
        },
        {
          kind: "text",
          text: `Cancelled: ${cancelledAtDate.toLocaleString()}`,
          align: "center",
          bold: true,
        },
        { kind: "divider" },
        {
          kind: "row",
          widths: colWidths,
          align: colAligns,
          bold: true,
          cells: ["Qty", "Item"],
        },
        // Every item line prints struck through — the visual "voided" mark —
        // regardless of per-item notes, which still print below for context.
        ...deptItems.flatMap((item: any): ReceiptBlock[] => {
          const name = String(item.menu_item_name || "Item");
          const itemBlocks: ReceiptBlock[] = [
            {
              kind: "row",
              widths: colWidths,
              align: colAligns,
              bold: true,
              strike: true,
              cells: [`X ${String(item.quantity)}`, name],
            },
          ];
          const itemNote = String(item.note || item.notes || "").trim();
          if (itemNote) {
            for (const line of wrapTicketText(`- ${itemNote}`)) {
              itemBlocks.push({ kind: "text", text: line, align: "center" });
            }
          }
          return itemBlocks;
        }),
        { kind: "divider" },
        {
          kind: "text",
          text: "DO NOT PREPARE",
          align: "center",
          bold: true,
          large: true,
        },
      ];
    };

    const queueTicket = async (
      blocks: ReceiptBlock[],
      printerName: string,
      copies: number,
    ) => {
      const deptPrinter =
        resolvePrinter(printerName, availablePrinters) || targetPrinter;
      const imageDatas = await renderReceiptImages(blocks);
      const printerKey = String(deptPrinter || "").trim();
      for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
        if (!jobsByPrinter[printerKey]) {
          jobsByPrinter[printerKey] = createPrintJob(imageDatas, deptPrinter);
        } else {
          jobsByPrinter[printerKey].sections.push(
            ...ticketSections(imageDatas),
          );
        }
      }
    };

    // Same routing as the original ticket: every station that would have
    // printed this order's items also gets the void notice.
    for (const dept of departments) {
      const deptItems = itemsByDept[dept];
      const stations = getDepartmentStations(dept);

      if (stations.length > 0) {
        for (const station of stations) {
          const pick = pickPrinter(station.printer);
          if (!pick) continue;
          const headerLabel = station.label || `DEPT: ${dept.toUpperCase()}`;
          const blocks = buildCancelledTicketBlocks(deptItems, headerLabel);
          await queueTicket(blocks, pick.printer, station.copies);
        }
      } else {
        const pick = pickPrinter(getPrinterForDepartment(dept));
        if (!pick) continue;
        const blocks = buildCancelledTicketBlocks(
          deptItems,
          `DEPT: ${dept.toUpperCase()}`,
        );
        await queueTicket(blocks, pick.printer, getPrintCopies());
      }
    }

    // Unlike printOrderNative, a routing gap here isn't fatal to the caller —
    // the cancellation is still recorded as printed locally (see the
    // printed-registry "cancel:" guard in useCashierPrinting), but surface it
    // for visibility.
    if (Object.keys(jobsByPrinter).length === 0) {
      console.warn(
        `[print] Cancellation ticket for order ${id} had no routed printer for departments: ${departments.join(", ")}`,
      );
      return false;
    }

    const printJobs = Object.values(jobsByPrinter).map((job: any) =>
      print_thermal_printer(job as any),
    );
    await Promise.allSettled(printJobs);

    return true;
  },

  testPrintNative: async (printerName?: string) => {
    const { print_thermal_printer } =
      await import("tauri-plugin-thermal-printer");
    const targetPrinter = await selectPrinter(printerName);

    const colWidths = DEFAULT_TABLE_COLUMN_WIDTHS;
    const colAligns = DEFAULT_TABLE_COLUMN_ALIGNS;

    // Rendered as an image so the test confirms Amharic / Ge'ez prints correctly.
    const blocks: ReceiptBlock[] = [
      { kind: "title", text: "DIAGNOSTIC TEST" },
      {
        kind: "text",
        text: "TAURI NATIVE THERMAL PRINTER TEST",
        align: "center",
      },
      { kind: "text", text: "የአማርኛ ህትመት ሙከራ", align: "center", bold: true },
      { kind: "divider" },
      { kind: "text", text: "Table: #5 (MOCK)" },
      { kind: "text", text: "Waiter: Diagnostics Bot" },
      { kind: "text", text: `Date: ${getApproximateServerDate()}` },
      { kind: "divider" },
      {
        kind: "row",
        widths: colWidths,
        align: colAligns,
        bold: true,
        cells: ["Item", "Qty", "Price", "Sub"],
      },
      {
        kind: "row",
        widths: colWidths,
        align: colAligns,
        cells: ["ማኪያቶ", "2", "45", "90"],
      },
      {
        kind: "row",
        widths: colWidths,
        align: colAligns,
        cells: ["ቡና", "1", "60", "60"],
      },
      { kind: "divider" },
      { kind: "text", text: "TOTAL: 150.00 Birr", bold: true, large: true },
      { kind: "gap", height: 8 },
      { kind: "text", text: "Connection Successful!", align: "center" },
    ];

    const imageDatas = await renderReceiptImages(blocks);
    const job = createPrintJob(imageDatas, targetPrinter);
    await print_thermal_printer(job as any);
    return true;
  },

  getZReport: async (params?: any) => {
    if (isOnline()) {
      return api.get("/orders/z-report", { params });
    }
    throw new Error("Z-report requires online connection to backend");
  },

  // ── Deliveries ─────────────────────────────────────────────────────────────
  // Delivery orders/payments have no local mirror (delivery_payments is a
  // backend-only ledger, deliberately separate from the synced payments
  // table — see backend order.service.ts). This board is online-only, same
  // as the Z-report above.
  getDeliveries: async (params?: any) => {
    if (isOnline()) {
      return api.get("/orders/deliveries", { params });
    }
    throw new Error("Deliveries requires an online connection to the backend");
  },
  updateDeliveryDetails: async (orderId: string, data: any) => {
    if (isOnline()) {
      return api.put(`/orders/${orderId}/delivery`, data);
    }
    throw new Error("Deliveries requires an online connection to the backend");
  },
  addDeliveryPayment: async (orderId: string, data: any) => {
    if (isOnline()) {
      return api.post(`/orders/${orderId}/delivery-payments`, data);
    }
    throw new Error("Deliveries requires an online connection to the backend");
  },
  updateDeliveryPayment: async (orderId: string, paymentId: string, data: any) => {
    if (isOnline()) {
      return api.put(`/orders/${orderId}/delivery-payments/${paymentId}`, data);
    }
    throw new Error("Deliveries requires an online connection to the backend");
  },

  // ── Organization order settlement ───────────────────────────────────────────
  // Owner-only — the backend independently re-checks the confirming user's
  // real role (see order.service.ts's confirmOrganizationOrderPayment). Never
  // touches the local payments mirror: settlement lives entirely on the
  // organization's own credit ledger, online-only same as Deliveries above.
  confirmOrganizationPayment: async (orderId: string, confirmedBy: string) => {
    if (isOnline()) {
      return api.post(`/orders/${orderId}/organization-payment/confirm`, {
        confirmed_by: confirmedBy,
      });
    }
    throw new Error(
      "Confirming an organization order's payment requires an online connection.",
    );
  },
};

export const ordersAdapter = ordersAdapterImpl;
