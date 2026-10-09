import { localDbTables, generateLocalId } from "@/db/localDb";
import {
  ordersAdapter,
  extractPersistedOrderIds,
  extractPersistedPaymentIds,
  extractAssignedOrderNumbers,
  noteOrderNumber,
  markItemAdditionSynced,
  markItemAdditionRejected,
  pushPendingItemAdditions,
} from "@/infrastructure/adapters/orders.adapter";
import { api as apiClient } from "@/infrastructure/api/http-client";
import {
  readRows,
  readRowsWhere,
  readUnsyncedRows,
  upsertRow,
} from "@/infrastructure/database/local-db-query";
import { inArray } from "drizzle-orm";
import type { SyncTask } from "./types";

const BATCH_SIZE = 50;
const EXPENSE_PUSH_CONCURRENCY = 5;

// The backend expenses table stores a single record (no line items) and is keyed
// by a UUID. Local ids are UUIDs (generateLocalId); the rare non-UUID fallback id
// can't be mapped to the backend column, so those rows are skipped.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const syncableExpenseId = (row: any) => UUID_RE.test(String(row?.id ?? ""));

// Backend categories are a fixed set; map the app's free-text/admin categories
// onto the nearest one. Cashier batch entries have no category → "supplies".
const BACKEND_EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "supplies",
  "maintenance",
  "other",
];

const mapExpenseCategory = (raw: any): string => {
  const c = String(raw ?? "").trim().toLowerCase();
  if (!c) return "other";
  if (BACKEND_EXPENSE_CATEGORIES.includes(c)) return c;
  if (c.includes("rent")) return "rent";
  if (c.includes("util")) return "utilities";
  if (c.includes("salar") || c.includes("payroll") || c.includes("wage"))
    return "salaries";
  if (c.includes("maint")) return "maintenance";
  if (
    c.includes("supply") ||
    c.includes("supplies") ||
    c.includes("ingredient") ||
    c.includes("food") ||
    c.includes("beverage") ||
    c.includes("clean") ||
    c.includes("equipment")
  )
    return "supplies";
  return "other";
};

const normalizeExpenseForBackend = (row: any) => {
  const items = Array.isArray(row?.items) ? row.items : [];
  const total = Number(row?.total ?? row?.amount ?? 0) || 0;

  // Batch (cashier) entries: serialize the line items into the description so
  // the web admin can show what was purchased, and bucket them under "supplies".
  let description: string | undefined;
  let category: string;
  if (items.length) {
    description = items
      .map((it: any) => `${String(it?.item ?? "").trim()} (${Number(it?.cost) || 0})`)
      .filter((s: string) => s && !s.startsWith(" ("))
      .join(", ");
    category = row?.category ? mapExpenseCategory(row.category) : "supplies";
  } else {
    const paidTo = row?.paid_to ? `Paid to: ${row.paid_to}` : "";
    description =
      [row?.title, paidTo, row?.notes].filter(Boolean).join(" — ") || undefined;
    category = mapExpenseCategory(row?.category);
  }

  const whole = Math.floor(total);
  return {
    id: String(row.id),
    category,
    amount: whole,
    amount_cents: Math.max(0, Math.round((total - whole) * 100)),
    payment_method: row?.payment_method ? String(row.payment_method) : undefined,
    description: description || undefined,
    expense_date: row?.created_at || undefined,
  };
};

const normalizeOrderPayload = (order: any, itemAdditions: any[] = []) => ({
  id: order.id,
  // Offline-stamped serial; the backend keeps it permanent on sync.
  order_number: order.order_number ?? undefined,
  employee_id: order.employee_id,
  waiter_id: order.waiter_id || undefined,
  customer_id: order.customer_id,
  table_number: order.table_number || undefined,
  order_type_label: order.order_type_label || undefined,
  type: order.type || "cafe",
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
    })) || [],
  total_amount: order.total_amount,
  // Local item-addition audit records for this order — see the matching copy
  // of this function in orders.adapter.ts for why this has to be here: an
  // order created AND edited while fully offline already has these
  // additions' deltas baked into `items` above by the time this first sync
  // runs, so the backend needs to recognize the same addition_id when it
  // arrives again via its own separate push, or it re-applies the delta and
  // doubles the quantity. Harmless to include for an order that already
  // exists on the backend — bulkSync only reads this on first insert.
  item_additions: itemAdditions.map((a: any) => ({
    id: a.id,
    items: a.items,
    added_by: a.added_by,
    added_at: a.added_at,
  })),
});

const normalizePaymentPayload = (payment: any) => {
  return {
    id: payment.id,
    order_id: payment.order_id,
    amount: payment.amount,
    payment_method: payment.payment_method,
    status: payment.status,
    processed_by: payment.processed_by || undefined,
    // The local `paid_at`/`created_at` are display fields overridden to the
    // order's created_at (see payments.adapter.ts) so the cashier dashboard's
    // date buckets match the Orders page. The backend derives BOTH its own
    // paid_at and created_at columns from whatever we send here as paid_at
    // (order.service.ts syncPayment), so this must stay the true processing
    // time — sending the display value would permanently overwrite the
    // backend's audit trail with the order's creation time instead.
    paid_at: payment.actual_paid_at ?? payment.paid_at,
    created_at: payment.actual_paid_at ?? payment.created_at ?? undefined,
    description: payment.description || undefined,
  };
};

const markPaymentsAsSynced = async (payments: any[]) => {
  for (const payment of payments) {
    await upsertRow(localDbTables.payments, {
      ...payment,
      synced: 1,
    });
  }
};

const ordersPushTask: SyncTask = {
  name: "orders",
  async push() {
    const unsyncedOrders = await readUnsyncedRows(localDbTables.orders);
    if (unsyncedOrders.length === 0) return 0;

    // The backend's bulk /orders/sync (used just below) only updates
    // status/payment_status for an order that already exists there — it
    // never touches `items`. So before marking an order synced, retry any
    // item additions still parked in `meta.pending_additions` (recorded by
    // addItems() when its own local audit-row write ran out of retries).
    // Skipping this would let the order look "synced" the moment its
    // unrelated status push succeeds, even though an added item was never
    // actually delivered — silently and permanently losing it, since
    // nothing retries an order already flagged synced.
    const finalizeOrder = async (order: any, orderNumber: any) => {
      noteOrderNumber(orderNumber);
      const repaired = await pushPendingItemAdditions(order);
      const stillPending =
        Array.isArray(repaired?.meta?.pending_additions) &&
        repaired.meta.pending_additions.length > 0;
      await upsertRow(localDbTables.orders, {
        ...repaired,
        order_number: orderNumber,
        synced: stillPending ? 0 : 1,
      });
    };

    // Replace any provisional offline serial with the backend-assigned one so
    // the device converges on the official number right after the push.
    const markSynced = async (
      orders: typeof unsyncedOrders,
      assignedNumbers?: Map<string, number>,
    ) => {
      for (const order of orders) {
        const orderNumber =
          assignedNumbers?.get(String(order.id)) ??
          (order as any).order_number;
        await finalizeOrder(order, orderNumber);
      }
    };

    let totalPushed = 0;

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
        const resp = await ordersAdapter.syncBulk({
          orders: orderPayloads,
          payments: [],
        });
        // Only mark the orders the backend confirms it persisted. Anything it
        // skipped (e.g. unknown employee) stays unsynced and retries next cycle
        // — that is what stops offline orders from silently disappearing.
        const persisted = extractPersistedOrderIds(resp);
        const confirmed = persisted
          ? batch.filter((o: any) => persisted.has(String(o.id)))
          : batch;
        await markSynced(confirmed, extractAssignedOrderNumbers(resp));
        totalPushed += confirmed.length;
        if (confirmed.length < batch.length) {
          console.warn(
            `[sync] Backend skipped ${batch.length - confirmed.length} order(s); kept unsynced for retry`,
          );
        }
      } catch (error) {
        const status = Number((error as any)?.response?.status);
        if (status !== 409) throw error;

        console.warn(
          "[sync] Orders batch hit a conflict; retrying one order at a time",
          error,
        );

        for (const order of batch) {
          try {
            const resp = await ordersAdapter.syncBulk({
              orders: [
                normalizeOrderPayload(
                  order,
                  additionsByOrderId.get(String((order as any).id)) || [],
                ),
              ],
              payments: [],
            });
            const persisted = extractPersistedOrderIds(resp);
            if (persisted && !persisted.has(String(order.id))) {
              console.warn(
                "[sync] Backend skipped order during retry; kept unsynced",
                { orderId: order.id },
              );
              continue;
            }
            await markSynced([order], extractAssignedOrderNumbers(resp));
            totalPushed += 1;
          } catch (singleError) {
            const singleStatus = Number((singleError as any)?.response?.status);
            if (singleStatus === 409) {
              console.warn(
                "[sync] Skipping conflicted order (already exists on server)",
                {
                  orderId: order.id,
                },
              );
              await finalizeOrder(order, (order as any).order_number);
              totalPushed += 1;
              continue;
            }
            throw singleError;
          }
        }
      }
    }

    return totalPushed;
  },
  async countUnsynced() {
    const unsyncedOrders = await readUnsyncedRows(localDbTables.orders);
    return unsyncedOrders.length;
  },
};

const paymentsPushTask: SyncTask = {
  name: "payments",
  async push() {
    const unsyncedPayments = await readUnsyncedRows(localDbTables.payments);
    if (unsyncedPayments.length === 0) return 0;

    const paymentEntries: Array<{ payment: any; payload: any }> = [];

    for (const payment of unsyncedPayments) {
      paymentEntries.push({ payment, payload: normalizePaymentPayload(payment) });
    }

    const syncPaymentsBatch = async (payloads: any[]) => {
      return ordersAdapter.syncBulk({ orders: [], payments: payloads });
    };

    // Only mark the payments the backend confirms it actually holds.
    // syncPayment (order.service.ts) can silently drop a payment — most
    // commonly because its order hadn't landed on the backend yet — while
    // the bulk request as a whole still replies 200 OK. Trusting that 200
    // for every payment in the batch is exactly how 2026-08-06's 13 orphaned
    // "paid" orders happened: the order eventually synced (already carrying
    // payment_status: "paid" from local state), the payment behind it had
    // been silently dropped on an earlier attempt, and this task had
    // already marked it synced — so nothing ever retried it. Anything not
    // in `persisted` stays unsynced and gets picked up next cycle, mirroring
    // how ordersPushTask already treats its own persisted_ids.
    const markConfirmedSynced = async (
      entries: Array<{ payment: any; payload: any }>,
      resp: any,
    ) => {
      const persisted = extractPersistedPaymentIds(resp);
      const confirmed = persisted
        ? entries.filter((e) => persisted.has(String(e.payment.id)))
        : entries;
      await markPaymentsAsSynced(confirmed.map((entry) => entry.payment));
      if (confirmed.length < entries.length) {
        console.warn(
          `[sync] Backend didn't confirm ${entries.length - confirmed.length} payment(s); kept unsynced for retry`,
        );
      }
      return confirmed.length;
    };

    let totalPushed = 0;

    for (let i = 0; i < paymentEntries.length; i += BATCH_SIZE) {
      const batch = paymentEntries.slice(i, i + BATCH_SIZE);

      try {
        const resp = await syncPaymentsBatch(batch.map((entry) => entry.payload));
        totalPushed += await markConfirmedSynced(batch, resp);
      } catch (error) {
        const status = Number((error as any)?.response?.status);
        if (status !== 409) {
          throw error;
        }

        console.warn(
          "[sync] Payments batch hit a conflict; retrying one payment at a time",
          error,
        );

        for (const entry of batch) {
          try {
            const singleResp = await syncPaymentsBatch([entry.payload]);
            totalPushed += await markConfirmedSynced([entry], singleResp);
          } catch (singleError) {
            const singleStatus = Number((singleError as any)?.response?.status);
            if (singleStatus === 409) {
              console.warn("[sync] Skipping conflicted payment during retry", {
                paymentId: entry.payment.id,
                orderId: entry.payment.order_id,
              });
              continue;
            }

            throw singleError;
          }
        }
      }
    }

    return totalPushed;
  },
  async countUnsynced() {
    const unsyncedPayments = await readUnsyncedRows(localDbTables.payments);
    return unsyncedPayments.length;
  },
};

const expensesPushTask: SyncTask = {
  name: "expenses",
  async push() {
    const unsynced = (await readUnsyncedRows(localDbTables.expenses)).filter(
      syncableExpenseId,
    );
    if (unsynced.length === 0) return 0;

    let pushed = 0;

    // The backend has no bulk expenses endpoint (unlike orders/payments'
    // /orders/sync), so this still needs one POST per row — but they don't
    // need to wait on each other. Push a bounded number of requests
    // concurrently instead of one-at-a-time serial round trips; local writes
    // stay sequential (the pooled SQLite connection has no working transactions).
    for (let i = 0; i < unsynced.length; i += EXPENSE_PUSH_CONCURRENCY) {
      const batch = unsynced.slice(i, i + EXPENSE_PUSH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((row: any) =>
          apiClient.post("/expenses", normalizeExpenseForBackend(row)),
        ),
      );

      for (let j = 0; j < batch.length; j += 1) {
        const row = batch[j];
        const result = results[j];
        if (result.status === "fulfilled") {
          // POST is an idempotent upsert keyed by the local UUID, so this also
          // propagates offline edits without creating duplicates on retry.
          await upsertRow(localDbTables.expenses, { ...row, synced: 1 });
          pushed += 1;
        } else {
          console.error("[sync] Failed to push expense; kept unsynced", {
            id: row?.id,
            error: result.reason,
          });
        }
      }
    }
    return pushed;
  },
  async countUnsynced() {
    return (await readUnsyncedRows(localDbTables.expenses)).filter(
      syncableExpenseId,
    ).length;
  },
};

// Shared by the live "already paid" retry below and the legacy sweep in
// push(): posts to the reconciliation route (applies the merge without the
// paid-order check) and settles the row accordingly. Returns whether it
// landed, so callers can count it toward `pushed`.
const attemptReconcile = async (row: any): Promise<boolean> => {
  try {
    await apiClient.post(`/orders/${row.order_id}/items/reconcile`, {
      items: row.items,
      updated_by: row.added_by,
      addition_id: row.id,
    });
    await markItemAdditionSynced(row.id);
    console.warn(
      "[sync] Item addition landed after its order was already paid; applied via reconciliation",
      { id: row?.id, orderId: row?.order_id },
    );
    return true;
  } catch (reconcileError) {
    const reconcileStatus = Number(
      (reconcileError as any)?.response?.status,
    );
    // A 4xx here is as permanent as the original rejection (e.g. the
    // ownership check reconcile still enforces) — retrying forever would
    // just repeat this same log every cycle. Anything else (network, 5xx)
    // is worth retrying next cycle, so it's left synced:0/unmarked.
    if (reconcileStatus >= 400 && reconcileStatus < 500) {
      const reconcileMessage = String(
        (reconcileError as any)?.response?.data?.message || reconcileError,
      );
      await markItemAdditionRejected(row.id, reconcileMessage);
      console.error(
        "[sync] Item addition's paid-order reconciliation was rejected; will not retry",
        { id: row?.id, orderId: row?.order_id, error: reconcileMessage },
      );
    } else {
      console.error(
        "[sync] Item addition's paid-order reconciliation failed; kept unsynced",
        { id: row?.id, orderId: row?.order_id, error: reconcileError },
      );
    }
    return false;
  }
};

const itemAdditionsPushTask: SyncTask = {
  name: "item_additions",
  async push() {
    const unsynced = await readUnsyncedRows(localDbTables.itemAdditions);

    // One-time backfill: rows rejected by the code that predates the
    // reconciliation route were marked synced:1 the instant they were
    // rejected, so the query above never sees them again — they'd stay
    // stuck forever otherwise. `reconcile_attempted` (only ever set by
    // markItemAdditionRejected, i.e. only after a reconcile attempt) marks
    // which rejected rows already got their shot; anything rejected without
    // it predates the route and gets exactly one retry through it here. This
    // scans the whole table (not index-filterable — see readUnsyncedRows'
    // jsdoc), but the candidate set only shrinks: every row it touches comes
    // out stamped either synced clean or `reconcile_attempted`, so it drops
    // out of `legacyRejected` for good on the very next cycle either way.
    const allRows = await readRows(localDbTables.itemAdditions);
    const legacyRejected = allRows.filter(
      (row: any) => row.rejected === true && row.reconcile_attempted !== true,
    );

    if (unsynced.length === 0 && legacyRejected.length === 0) return 0;

    let pushed = 0;

    for (const row of legacyRejected) {
      if (await attemptReconcile(row)) pushed += 1;
    }

    // One POST per row (the backend has no bulk "add items" endpoint), a
    // bounded number concurrently — mirrors expensesPushTask. Each carries its
    // original addition_id, so a retry after a dropped response is a safe
    // no-op server-side (addOrderItems de-dupes on it) instead of doubling the
    // items/audit row/kitchen ticket.
    for (let i = 0; i < unsynced.length; i += EXPENSE_PUSH_CONCURRENCY) {
      const batch = unsynced.slice(i, i + EXPENSE_PUSH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((row: any) =>
          apiClient.post(`/orders/${row.order_id}/items`, {
            items: row.items,
            updated_by: row.added_by,
            addition_id: row.id,
          }),
        ),
      );

      for (let j = 0; j < batch.length; j += 1) {
        const row = batch[j];
        const result = results[j];
        if (result.status === "fulfilled") {
          // Read-merge-write — must not stomp `printed`, which the auto-print
          // poll may have already set independently of this push.
          await markItemAdditionSynced(row.id);
          pushed += 1;
        } else {
          const status = Number((result.reason as any)?.response?.status);
          const message = String(
            (result.reason as any)?.response?.data?.message || "",
          );
          // The order was paid by the time this reached the backend — with
          // itemAdditionsPushTask now running before paymentsPushTask (see
          // the comment on `pushTasks` below), that should only ever happen
          // for a genuine cross-device race (paid on a different till,
          // already synced by the time this device's push landed). The item
          // really was served before that payment, so retry it through
          // reconciliation instead of just giving up.
          if (status === 400 && /already been paid/i.test(message)) {
            if (await attemptReconcile(row)) pushed += 1;
            continue;
          }
          console.error("[sync] Failed to push item addition; kept unsynced", {
            id: row?.id,
            orderId: row?.order_id,
            error: result.reason,
          });
        }
      }
    }
    return pushed;
  },
  async countUnsynced() {
    return (await readUnsyncedRows(localDbTables.itemAdditions)).length;
  },
};

// Order matters here — sync-engine.ts runs these strictly sequentially, each
// one fully awaited before the next starts, so this array IS the causal
// ordering the backend sees within one cycle.
//
// itemAdditionsPushTask must run before paymentsPushTask: confirming a
// payment (offline) queues both a payment row *and*, if items were added to
// the same order first, an itemAdditions row — both unsynced, both eligible
// in the same cycle. If payments went first, syncPayment (order.service.ts)
// marks the order payment_status: "paid" on the backend as part of applying
// that payment; the queued item addition then reaches
// assertCanModifyOrderItems on an order that's already paid and is
// permanently rejected — deterministically, every time, even though the
// item was genuinely added while the order was still unpaid. It's not a rare
// race: "add an item, then take payment" while offline hits this on every
// cycle where both are still queued. itemAdditionsPushTask ahead of
// paymentsPushTask lets the item land first, matching what actually happened.
//
// ordersPushTask must still run first — item additions and payments both
// need the order to already exist on the backend (itemAdditionsPushTask 404s,
// syncPayment reports persisted:false and retries) and a brand-new order's
// first sync is what creates it.
export const pushTasks: SyncTask[] = [
  ordersPushTask,
  itemAdditionsPushTask,
  paymentsPushTask,
  expensesPushTask,
];
