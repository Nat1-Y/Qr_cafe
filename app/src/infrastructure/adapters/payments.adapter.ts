// @ts-nocheck
import { Payment, ApiResponse } from "@/types/api.types";
import { generateLocalId, localDbTables } from "@/db/localDb";
import {
  api,
  isOnline,
  FAST_PROBE_TIMEOUT_MS,
} from "@/infrastructure/api/http-client";
import {
  findByIdOrRemote,
  readRows,
  upsertRow,
  upsertRowsAtomic,
} from "@/infrastructure/database/local-db-query";
import { getApproximateServerIsoString } from "@/shared/utils/serverTime";
import { extractPersistedPaymentIds } from "@/infrastructure/adapters/orders.adapter";

const readPayments = async () => {
  return readRows(localDbTables.payments);
};

const readOrders = async () => {
  return readRows(localDbTables.orders);
};

const findPayment = async (id: string) => {
  return findByIdOrRemote(localDbTables.payments, id);
};

const findOrder = async (id: string) => {
  return findByIdOrRemote(localDbTables.orders, id);
};

const upsertPayment = async (payment: any) => {
  return upsertRow(localDbTables.payments, payment);
};

const upsertOrder = async (order: any) => {
  return upsertRow(localDbTables.orders, order);
};

/**
 * Background push for a just-created payment. Not awaited by `create` — the
 * caller already has its response and the local row is visible. On success,
 * re-reads the current local payment/order (rather than reusing the snapshot
 * passed in, since another write may have touched them meanwhile) and flips
 * `synced` to 1 — but only once the response actually confirms the backend
 * holds this payment. A 200 here does NOT guarantee that: syncPayment
 * (order.service.ts) silently drops a payment whose order hasn't landed on
 * the backend yet — a very ordinary race for a payment fired immediately
 * after an order created moments earlier while offline — while the request
 * as a whole still succeeds. Trusting the request's success alone (the
 * previous behavior here) marks a silently-dropped payment as synced with
 * nothing left to ever retry it — exactly how 2026-08-06's 13 orphaned
 * "paid" orders (paid on the backend, zero payment rows behind them)
 * happened. On failure, or when the response doesn't confirm this id, both
 * rows stay `synced: 0` and the generic paymentsPushTask/ordersPushTask
 * retries pick them up on the next cycle.
 */
const pushCreatedPayment = async (
  paymentId: string,
  orderId: string | undefined,
  syncPayload: any,
) => {
  try {
    const resp = await api.post("/orders/sync", {
      orders: [],
      payments: [syncPayload],
    });
    const persisted = extractPersistedPaymentIds(resp);
    if (persisted && !persisted.has(String(paymentId))) {
      console.warn(
        "[Payments Create] Backend didn't confirm this payment (order likely not synced yet); kept unsynced for retry",
        { paymentId, orderId },
      );
      return;
    }

    const current = await findPayment(paymentId);
    if (current?.id) {
      await upsertPayment({ ...current, synced: 1 });
    }
    if (orderId) {
      const currentOrder = await findOrder(orderId);
      if (currentOrder?.id) {
        await upsertOrder({ ...currentOrder, synced: 1 });
      }
    }
  } catch (err) {
    console.warn(
      "[Payments Create] Background sync failed; queued for retry",
      err,
    );
  }
};

/** Background push for a payment confirmation — see pushCreatedPayment for
 * the re-read-before-marking-synced rationale. */
const pushPaymentConfirm = async (id: string, data: any) => {
  try {
    await api.post(`/payments/${id}/confirm`, data);
    const current = await findPayment(id);
    if (current?.id) {
      await upsertPayment({ ...current, synced: 1 });
    }
    if (current?.order_id) {
      const currentOrder = await findOrder(current.order_id);
      if (currentOrder?.id) {
        await upsertOrder({ ...currentOrder, synced: 1 });
      }
    }
  } catch (err) {
    console.warn(
      "[Payments Confirm] Background sync failed; queued for retry",
      err,
    );
  }
};

// How far back the dashboard reconciles payments from the backend on each
// refresh. Without a bound, GET /payments/history returns the branch's entire
// payment history (every refresh re-pulls and re-upserts all of it), which is
// what makes the cashier dashboard crawl on long-running tills. Local SQLite
// still retains older rows from prior syncs, so client-side stats over older
// ranges keep working — we just stop re-fetching the unchanging tail.
const PAYMENTS_HISTORY_WINDOW_DAYS = 60;

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// Fields that decide whether a remote payment row differs from what we already
// have locally. Re-upserting an unchanged row is pure overhead (a SQLite write
// per row, every refresh) — skipping them removes the per-load write storm.
const PAYMENT_COMPARE_FIELDS = [
  "order_id",
  "amount",
  "payment_method",
  "status",
  "description",
  "paid_at",
  "updated_at",
];

const paymentRowChanged = (existing: any, incoming: any): boolean => {
  if (!existing) return true;
  // A local row not yet marked synced must be reconciled to the server copy.
  if (Number(existing.synced ?? 0) !== 1) return true;
  for (const field of PAYMENT_COMPARE_FIELDS) {
    if (String(existing[field] ?? "") !== String(incoming[field] ?? "")) {
      return true;
    }
  }
  return false;
};

// Offline cash payments are written as pending; once we can see them they are
// settled, so promote them to paid. Only the (usually zero) matching rows get
// written. Returns true if anything changed so the caller can re-read.
const promoteCashPendingToPaid = async (rows: any[]): Promise<boolean> => {
  let updated = false;
  for (const p of rows) {
    if (p.payment_method === "cash" && p.status === "pending") {
      await upsertPayment({ ...p, status: "paid", synced: 0 });
      p.status = "paid";
      updated = true;
    }
  }
  return updated;
};

const buildPaymentsResponse = (payments: any[]) =>
  ({
    data: { status: "success", data: { payments } },
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as any,
  }) as any;

// Read-only local payments response — no network, no reconcile loop beyond the
// cheap cash/pending promotion. Used for the fast initial render and the
// lightweight on-screen refresh tick.
const localPaymentsResponse = async () => {
  const localPayments = await readPayments();
  const updated = await promoteCashPendingToPaid(localPayments);
  const finalPayments = updated ? await readPayments() : localPayments;
  return buildPaymentsResponse(finalPayments);
};

/**
 * Startup safety net: find local orders this device itself believes are
 * "paid" with no local payment row behind them, and backfill one so a naked
 * paid order never gets pushed to the backend at all. atomic_upsert_rows
 * (see create()/confirm() above) prevents new instances of this from being
 * written going forward, but doesn't retroactively fix rows written before
 * that existed, or anything from a call site this file doesn't own (e.g. an
 * older app build, or a future write path that forgets to use it) — this
 * pass is the backstop for those. Mirrors reconcileOrphanPaidOrders
 * (backend order.service.ts), just run locally and pre-emptively. Call once
 * at app startup, before the sync engine's first push.
 */
export const recoverOrphanedLocalPayments = async (): Promise<{
  recovered: number;
}> => {
  const [localOrders, localPayments] = await Promise.all([
    readOrders(),
    readPayments(),
  ]);

  const orderIdsWithPayment = new Set(
    localPayments
      .filter((p: any) => String(p.status || "").toLowerCase() !== "cancelled")
      .map((p: any) => String(p.order_id)),
  );

  const orphans = localOrders.filter(
    (o: any) =>
      String(o.payment_status || "").toLowerCase() === "paid" &&
      String(o.status || "").toLowerCase() !== "cancelled" &&
      !orderIdsWithPayment.has(String(o.id)),
  );

  for (const order of orphans) {
    const now = getApproximateServerIsoString();
    const displayTime = order.created_at ?? now;
    try {
      await upsertPayment({
        id: generateLocalId(),
        synced: 0,
        order_id: order.id,
        amount: order.total_amount ?? 0,
        // Real method was never captured locally — don't guess it, same
        // stance as the backend's reconcileOrphanPaidOrders.
        payment_method: "unreconciled",
        status: "paid",
        description:
          "Auto-recovered: order was marked paid locally with no local payment row found at startup. Verify with staff.",
        paid_at: displayTime,
        created_at: displayTime,
        actual_paid_at: now,
        updated_at: now,
        meta: {
          recovered_locally: true,
          recovery_reason: "missing_local_payment_row",
          recovered_at: now,
        },
      });
      console.warn(
        `[Recovery] Backfilled local payment for orphaned paid order ${order.id} (#${order.order_number ?? "?"})`,
      );
    } catch (err) {
      console.error(
        `[Recovery] Failed to backfill payment for order ${order.id}:`,
        err,
      );
    }
  }

  return { recovered: orphans.length };
};

export const paymentsAdapter = {
  getAll: async (params?: any, opts?: { localOnly?: boolean }) => {
    // Fast path: render straight from local SQLite without touching the network
    // or reconciling the full history. Keeps the dashboard responsive.
    if (opts?.localOnly) {
      return localPaymentsResponse();
    }

    // If online, reconcile a bounded recent window from the backend.
    if (isOnline()) {
      try {
        // Bound the pull to a recent window unless the caller asked for a
        // specific slice. Passing only date_from returns every payment in the
        // window (unpaginated) instead of the whole table.
        const query: any = { ...(params || {}) };
        if (
          query.date_from == null &&
          query.date_to == null &&
          query.limit == null &&
          query.page == null
        ) {
          query.date_from = isoDaysAgo(PAYMENTS_HISTORY_WINDOW_DAYS);
        }

        // Falls back to local payments below — fail fast under a degraded
        // connection rather than block this page for 12s.
        const response = await api.get("/payments/history", {
          params: query,
          timeout: FAST_PROBE_TIMEOUT_MS,
        });
        const remotePayments =
          response.data?.data?.payments ?? response.data?.payments ?? [];

        if (Array.isArray(remotePayments) && remotePayments.length > 0) {
          const existingLocal = await readPayments();
          const existingById = new Map<string, any>(
            existingLocal.map((p: any) => [String(p.id), p]),
          );

          let upsertCount = 0;
          for (const p of remotePayments) {
            const incoming = {
              id: p.id,
              order_id: p.order_id,
              amount: p.amount,
              payment_method: p.payment_method,
              status: p.status,
              description: p.description || "",
              paid_at: p.paid_at,
              synced: 1,
              created_at: p.created_at,
              updated_at: p.updated_at,
            };
            // Only write rows that are new or actually changed.
            if (!paymentRowChanged(existingById.get(String(p.id)), incoming)) {
              continue;
            }
            try {
              await upsertPayment(incoming);
              upsertCount += 1;
            } catch (upsertErr) {
              console.error("Failed to upsert payment:", incoming, upsertErr);
              throw upsertErr;
            }
          }

          if (upsertCount > 0) {
            console.log("[Payments Sync] Upserted", upsertCount, "payments");
          }

          // Read fresh local payments which now includes the upserted remote
          // payments plus any local unsynced payments.
          const freshLocalPayments = await readPayments();
          const updated = await promoteCashPendingToPaid(freshLocalPayments);
          const baseFinal = updated
            ? await readPayments()
            : freshLocalPayments;
          // Local payment rows don't store order_number; carry it through from
          // the backend response so payment views can show/link it.
          const orderNumberById = new Map(
            remotePayments.map((p: any) => [p.id, p.order_number]),
          );
          const finalPayments = baseFinal.map((p: any) => ({
            ...p,
            order_number: p.order_number ?? orderNumberById.get(p.id) ?? null,
          }));

          return buildPaymentsResponse(finalPayments);
        }
      } catch (err) {
        console.error("[Payments Sync] Failed to fetch from backend:", err);
        // Fall through to local data on error
      }
    }

    // Fallback to local data
    try {
      return await localPaymentsResponse();
    } catch (err) {
      const localPayments = await readPayments();
      return buildPaymentsResponse(localPayments);
    }
  },
  // Backend-paginated payment history for the management table. Returns a single
  // server page (rows + total count) instead of the whole local table. When
  // online the page comes straight from GET /payments/history (also cached into
  // local SQLite for offline continuity); when offline we filter/sort/slice the
  // local rows to mirror the same shape.
  getHistory: async (params?: any) => {
    const page = Math.max(Number(params?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params?.limit) || 25, 1), 100);

    const buildPage = (rows: any[], count: number, stats: any = null) =>
      ({
        data: {
          status: "success",
          data: { payments: rows, count, page, limit, stats },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      }) as any;

    if (isOnline()) {
      try {
        const query: any = { ...(params || {}), page, limit };
        // Falls back to local payments below — fail fast under a degraded
        // connection rather than block this page for 12s.
        const response = await api.get("/payments/history", {
          params: query,
          timeout: FAST_PROBE_TIMEOUT_MS,
        });
        const payload = response.data?.data ?? response.data ?? {};
        const remotePayments: any[] = payload.payments ?? [];

        // Best-effort cache into local SQLite so the same rows stay available
        // offline. Only write rows that are new or actually changed.
        try {
          const existingLocal = await readPayments();
          const existingById = new Map<string, any>(
            existingLocal.map((p: any) => [String(p.id), p]),
          );
          for (const p of remotePayments) {
            const incoming = {
              id: p.id,
              order_id: p.order_id,
              amount: p.amount,
              payment_method: p.payment_method,
              status: p.status,
              description: p.description || "",
              paid_at: p.paid_at,
              synced: 1,
              created_at: p.created_at,
              updated_at: p.updated_at,
            };
            if (paymentRowChanged(existingById.get(String(p.id)), incoming)) {
              await upsertPayment(incoming);
            }
          }
        } catch (cacheErr) {
          console.error("[Payments History] local cache failed:", cacheErr);
        }

        return buildPage(
          remotePayments,
          Number(payload.count ?? remotePayments.length),
          payload.stats ?? null,
        );
      } catch (err) {
        console.error("[Payments History] fetch failed, using local:", err);
        // fall through to local slicing
      }
    }

    // Offline / fallback: filter, sort and slice local rows to the same shape.
    const all = await readPayments();
    await promoteCashPendingToPaid(all);
    const fresh = await readPayments();

    const status = params?.status;
    const method = params?.payment_method;
    const search = String(params?.search ?? "").trim().toLowerCase();

    // Inclusive day bounds. date_from/date_to arrive as YYYY-MM-DD; expand them
    // to the full local day so a single-day filter (today/yesterday) catches
    // every payment on that calendar date.
    const fromMs = params?.date_from
      ? new Date(`${params.date_from}T00:00:00.000`).getTime()
      : null;
    const toMs = params?.date_to
      ? new Date(`${params.date_to}T23:59:59.999`).getTime()
      : null;

    const filtered = fresh.filter((p: any) => {
      if (status && p.status !== status) return false;
      if (method && p.payment_method !== method) return false;
      if (fromMs != null || toMs != null) {
        const whenMs = new Date(p.paid_at || p.created_at || 0).getTime();
        if (fromMs != null && whenMs < fromMs) return false;
        if (toMs != null && whenMs > toMs) return false;
      }
      if (search) {
        const hay =
          `${p.id} ${p.order_id} ${p.payment_method ?? ""} ${p.status ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    filtered.sort((a: any, b: any) => {
      const ta = new Date(a.paid_at || a.created_at || 0).getTime();
      const tb = new Date(b.paid_at || b.created_at || 0).getTime();
      return tb - ta;
    });

    const count = filtered.length;
    const start = (page - 1) * limit;
    return buildPage(filtered.slice(start, start + limit), count);
  },
  getById: async (id: string) => {
    if (!isOnline()) {
      const payment = await findPayment(id);
      if (payment) {
        return {
          data: { status: "success", data: payment },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        };
      }
    }
    return api.get<ApiResponse<Payment>>(`/payments/${id}`);
  },
  getByOrder: async (orderId: string) => {
    const localPayments = (await readPayments()).filter(
      (payment: any) => String(payment.order_id) === String(orderId),
    );
    return {
      data: { status: "success", data: localPayments },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  create: async (paymentData: any) => {
    const paymentStatus = String(paymentData.status || "paid").toLowerCase();
    const isConfirmed = ["paid", "confirmed"].includes(paymentStatus);
    const isDeleted = paymentStatus === "deleted";

    // Idempotency guard against duplicate payments on the same order.
    // The React re-entrancy guards only stop a same-tick double-click; they do
    // NOT stop a second confirm when the order re-appears in the payment queue
    // (a sync race after `getAll` re-pulls it as still-pending, a manual retry,
    // or another cashier device). The desktop always settles the full order in
    // one payment, so any existing non-cancelled payment for this order means
    // the money was already taken — return that row instead of writing a second
    // one. Cancellation/void records (isConfirmed = false) are not deduped so
    // the void ledger entry still writes.
    if (isConfirmed && paymentData.order_id) {
      const existing = (await readPayments()).find(
        (p: any) =>
          String(p.order_id) === String(paymentData.order_id) &&
          String(p.status || "").toLowerCase() !== "cancelled",
      );
      if (existing?.id) {
        console.warn(
          "[Payments Create] Order already has a payment; returning existing instead of creating a duplicate",
          { order_id: paymentData.order_id, existing_payment_id: existing.id },
        );
        return {
          data: {
            status: "success",
            data: { payment: existing, id: existing.id, ...existing },
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        } as any;
      }
    }

    // Helper: build the local order payload after a payment action (build
    // only — the caller writes it, atomically alongside the payment row, so
    // neither lands without the other; see upsertRowsAtomic).
    const buildOrderFlipPayload = (localOrder: any, synced: 0 | 1) => {
      if (!localOrder?.id) return null;
      const newStatus = isConfirmed
        ? "paid"
        : isDeleted
          ? "cancelled"
          : localOrder.status;
      const newPaymentStatus = isConfirmed
        ? "paid"
        : isDeleted
          ? "cancelled"
          : localOrder.payment_status;
      return {
        ...localOrder,
        status: newStatus,
        payment_status: newPaymentStatus,
        is_printed: isConfirmed ? 1 : localOrder.is_printed,
        updated_at: getApproximateServerIsoString(),
        synced,
      };
    };

    // The backend shows every payment against its *order's* created time, not
    // when the money was actually taken (payment.service.ts serializePayment) —
    // so dates/sorting/day-bucketing line up with the Orders page there. The
    // local cache must mirror that from the moment of creation, or the cashier
    // dashboard (which reads this local cache before any backend reconcile)
    // buckets a payment by its own processing time instead, which can land it
    // on a different calendar day than the order — e.g. an order created late
    // at night and paid a few minutes later, just after midnight. The true
    // processing time is kept under `actual_paid_at` and is what actually gets
    // sent to the backend as `paid_at`; only the local display copy changes.
    const order = paymentData.order_id
      ? await findOrder(paymentData.order_id)
      : null;
    const actualPaidAt = getApproximateServerIsoString();
    const displayTime = order?.created_at ?? actualPaidAt;

    // ── Local-first: save and return immediately, push in the background ──────
    // Confirming a payment must never wait on the network, regardless of
    // connection quality — ordersPushTask retries the background push below
    // if it fails, same as any other offline-created payment.
    const paymentId = generateLocalId();
    const localPayment = {
      id: paymentId,
      synced: 0,
      order_id: paymentData.order_id,
      amount: paymentData.amount,
      payment_method: paymentData.payment_method,
      status: paymentStatus,
      description: paymentData.description || "",
      paid_at: displayTime,
      created_at: displayTime,
      actual_paid_at: actualPaidAt,
      updated_at: actualPaidAt,
    };

    const orderFlipPayload = buildOrderFlipPayload(order, 0);
    if (orderFlipPayload) {
      // Both rows or neither — a crash between two separate writes here is
      // exactly how an order could end up "paid" locally with no payment
      // behind it (see local-db-no-transactions / the 2026-08 orphaned-
      // payments incidents).
      await upsertRowsAtomic([
        { table: localDbTables.payments, row: localPayment },
        { table: localDbTables.orders, row: orderFlipPayload },
      ]);
    } else {
      await upsertPayment(localPayment as any);
    }
    void pushCreatedPayment(paymentId, paymentData.order_id, {
      id: paymentId,
      order_id: paymentData.order_id,
      amount: paymentData.amount,
      payment_method: paymentData.payment_method,
      status: paymentStatus,
      processed_by: paymentData.processed_by,
      description: paymentData.description || undefined,
      // True time sent to the backend — the backend applies its own display
      // override on read, same as every other client.
      paid_at: actualPaidAt,
    });

    return {
      data: {
        status: "success",
        data: {
          payment: { id: paymentId, ...localPayment },
          id: paymentId,
          ...localPayment,
        },
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    } as any;
  },

  createWithQR: async (paymentData: any) => {
    return paymentsApi.create({ ...paymentData, payment_method: "qr_code" });
  },

  updateStatus: async (id: string, statusData: any) => {
    if (id) {
      const localPayment = await findPayment(id);
      if (localPayment && localPayment.id) {
        await upsertPayment({
          ...localPayment,
          status: statusData.status || localPayment.status,
          synced: 0,
        });
      }
    }
    return {
      data: { status: "success" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
  generateQR: async (id: string) => {
    await findPayment(id);
    // QR generation is mocked locally - return empty data
    return {
      data: { status: "success", data: { qr_url: "", qr_data: "" } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },

  confirm: async (id: string, data: any) => {
    let localPaymentObj: any = null;
    // Whether the backend already had this row *before* this call touched it
    // — decides below whether the standalone confirm push is safe to fire.
    let wasAlreadySynced = false;

    // Local-first: update local SQLite unconditionally and return
    // immediately — the confirm push below runs in the background so this
    // never waits on the network.
    if (id) {
      try {
        const localPayment = await findPayment(id);

        if (localPayment && localPayment.id) {
          wasAlreadySynced = Number(localPayment.synced ?? 0) === 1;
          const localOrder = localPayment.order_id
            ? await findOrder(localPayment.order_id)
            : null;

          // Mirror the backend's display convention (payment.service.ts
          // serializePayment): payments show against the order's created_at,
          // not the moment they were confirmed, so the cashier dashboard's
          // date buckets match the Orders page instead of drifting when a
          // payment is confirmed after its order's calendar day. True
          // confirm time is kept under actual_paid_at.
          const actualPaidAt = getApproximateServerIsoString();
          const displayTime =
            localOrder?.created_at ?? localPayment.created_at ?? actualPaidAt;

          const updatedPayment = {
            ...localPayment,
            status: "paid",
            paid_at: displayTime,
            created_at: displayTime,
            actual_paid_at: actualPaidAt,
            synced: 0,
          };

          // Also update parent order in SQLite
          const orderFlipPayload = localPayment.order_id
            ? localOrder && localOrder.id
              ? {
                  ...localOrder,
                  // On the desktop POS, taking payment closes the order, so
                  // the lifecycle moves to "done" (collapsed vocab) while the
                  // money axis records "paid".
                  status: "done",
                  payment_status: "paid",
                  is_printed: 1,
                  updated_at: getApproximateServerIsoString(),
                  synced: 0,
                }
              : // Synthesized stub — the real order isn't cached locally, so
                // there's nothing complete (items, employee, etc.) to push.
                // Deliberately left synced:1 so ordersPushTask never tries to
                // push this incomplete record. The order still gets flipped to
                // done/paid on the backend regardless — bulk-sync's
                // syncPayment does that itself when it lands a "paid" payment
                // (see order.service.ts), so whichever path actually delivers
                // this payment (the eager confirm push below, or — the usual
                // case — the standard paymentsPushTask retry) carries the
                // order update with it; nothing here depends on which one wins.
                {
                  id: localPayment.order_id,
                  status: "done",
                  payment_status: "paid",
                  synced: 1,
                  total_amount: localPayment.amount || 0,
                  created_at: getApproximateServerIsoString(),
                  is_printed: 1,
                  items: [],
                }
            : null;

          // Both rows or neither — a crash between two separate writes here
          // is exactly how an order could end up "paid" locally with no
          // payment behind it (see local-db-no-transactions / the 2026-08
          // orphaned-payments incidents).
          if (orderFlipPayload) {
            await upsertRowsAtomic([
              { table: localDbTables.payments, row: updatedPayment },
              { table: localDbTables.orders, row: orderFlipPayload },
            ]);
          } else {
            await upsertPayment(updatedPayment);
          }
          localPaymentObj = updatedPayment;
        }
      } catch (err) {
        // ignore
      }
    }

    // Every call site here does create() immediately followed by confirm()
    // on the same id — create() already fires its own background push
    // (pushCreatedPayment, via bulk-sync) carrying this payment's real
    // status, unawaited. Firing this standalone confirm push too, right on
    // its heels, races that in-flight create push with nothing to order
    // them: if this one reaches the backend first, /payments/:id/confirm
    // finds no row yet and throws "Payment not found" (bulk-sync's
    // syncPayment tolerates exactly this ordering by design — an upsert —
    // but this single-payment endpoint doesn't). Only fire it when the
    // backend is already known to hold this row (a genuine later pending →
    // paid transition); otherwise this update already left the local row
    // `paid` + `synced: 0` above, so the standard paymentsPushTask retry
    // delivers it through the race-safe bulk-sync path instead.
    if (id && wasAlreadySynced) void pushPaymentConfirm(id, data);

    return {
      data: {
        status: "success",
        data: {
          payment: localPaymentObj || { id, status: "paid" },
        },
        payment: localPaymentObj || { id, status: "paid" },
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    } as any;
  },
  getPending: async (params?: any) => {
    try {
      const localPayments = await readPayments();
      let updated = false;
      for (const p of localPayments) {
        if (p.payment_method === "cash" && p.status === "pending") {
          await upsertPayment({ ...p, status: "paid", synced: 0 });
          p.status = "paid";
          updated = true;
        }
      }
      const finalPayments = updated ? await readPayments() : localPayments;
      const pendingLocal = finalPayments.filter((p) => p.status === "pending");
      return {
        data: { status: "success", data: { payments: pendingLocal } },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      } as any;
    } catch (err) {
      const localPayments = await readPayments();
      const pendingLocal = localPayments.filter((p) => p.status === "pending");
      return {
        data: { status: "success", data: { payments: pendingLocal } },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      } as any;
    }
  },
  verifyQR: async (qrData: any) => {
    // QR verification is mocked locally - return mock verification result
    return {
      data: { status: "success", data: { verified: true } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    };
  },
};
