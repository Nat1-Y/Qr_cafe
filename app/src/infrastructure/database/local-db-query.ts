import { eq, inArray, sql, getTableColumns, getTableName, type SQL } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import { getLocalDb, generateLocalId } from "@/db/localDb";

const resolveDb = async (db?: any) => db ?? (await getLocalDb());

const parseRawJson = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const mergeRowWithRawJson = (row: any) => {
  const parsed = parseRawJson(row?.raw_json);
  if (parsed && typeof parsed === "object") {
    const merged = { ...row, ...parsed };
    // Column wins for print flag — stale raw_json must not re-queue printed orders.
    if (Number(row.is_printed) === 1) {
      merged.is_printed = 1;
    }
    const metaPrinted = Number(
      (parsed as any)?.meta?.is_printed ?? (row as any)?.meta?.is_printed,
    );
    if (metaPrinted === 1) {
      merged.is_printed = 1;
    }
    return merged;
  }
  return row;
};

export const readRows = async (table: any) => {
  const db = await resolveDb();
  const rows = await db.select().from(table);
  return rows.map((row: any) => mergeRowWithRawJson(row));
};

/**
 * Same as readRows but filtered in SQL. Prefer this over `readRows(table).filter(...)`
 * for anything that can run on an indexed column (synced/status/created_at/...) —
 * orders/payments/expenses are never pruned, so a JS-side filter over the whole
 * table gets slower every month while the equivalent indexed WHERE stays flat.
 */
export const readRowsWhere = async (table: any, where: SQL) => {
  const db = await resolveDb();
  const rows = await db.select().from(table).where(where);
  return rows.map((row: any) => mergeRowWithRawJson(row));
};

/** Rows not yet pushed to the backend, via the indexed `synced` column. */
export const readUnsyncedRows = async (table: any) => {
  return readRowsWhere(table, eq(table.synced, 0));
};

export const findById = async (table: any, id: string) => {
  const db = await resolveDb();
  const rows = await db.select().from(table).where(eq(table.id, id));
  return rows[0] ? mergeRowWithRawJson(rows[0]) : null;
};

export const findByRemoteId = async (table: any, remoteId: string) => {
  return findById(table, remoteId);
};

export const findByIdOrRemote = async (table: any, id: string) => {
  return findById(table, id);
};

const normalizeDbValue = (value: any) => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
};

export const toDbPayload = (row: any, fallbackId?: string) => {
  const targetId = row?.id ?? fallbackId ?? generateLocalId();
  const payload: Record<string, any> = {
    ...row,
    id: targetId,
    synced: Number(row?.synced ?? 0),
    raw_json: JSON.stringify({
      ...row,
      id: targetId,
    }),
  };

  for (const key of Object.keys(payload)) {
    payload[key] = normalizeDbValue(payload[key]);
    if (payload[key] === undefined) {
      delete payload[key];
    }
  }

  return payload;
};

export const clearRows = async (table: any, db?: any) => {
  const resolvedDb = await resolveDb(db);
  await resolvedDb.delete(table);
};

export const deleteById = async (table: any, id: string, db?: any) => {
  const resolvedDb = await resolveDb(db);
  await resolvedDb.delete(table).where(eq(table.id, id));
};

const DELETE_BATCH_SIZE = 200;

/** Batched delete-by-id, chunked to stay well under SQLite's bound-parameter limit. */
export const deleteByIds = async (table: any, ids: string[], db?: any) => {
  if (!ids || ids.length === 0) return;
  const resolvedDb = await resolveDb(db);
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const chunk = ids.slice(i, i + DELETE_BATCH_SIZE);
    await resolvedDb.delete(table).where(inArray(table.id, chunk));
  }
};

export const upsertRow = async (table: any, row: any, db?: any) => {
  const resolvedDb = await resolveDb(db);
  const targetId = row?.id ?? generateLocalId();
  const payload = toDbPayload({ ...row, id: targetId });

  const { id, ...updatePayload } = payload;

  await resolvedDb
    .insert(table)
    .values(payload as any)
    .onConflictDoUpdate({
      target: table.id,
      set: updatePayload as any,
    });

  return targetId;
};

// Every table's live conn string — the plugin keys DbInstances by exactly
// the string passed to Database.load() (see app/src/db/client.ts).
const LOCAL_DB_URL = "sqlite:cafe_local.db";

/**
 * Upsert 2+ rows — across one or more tables — in a single real SQLite
 * transaction via the `atomic_upsert_rows` Rust command (src-tauri/src/
 * commands.rs), instead of N separate `upsertRow` calls. Plain sequential
 * `upsertRow` calls each go through their own tauri-plugin-sql IPC round
 * trip against a pooled connection, so a crash (or kill) between them can
 * leave the operation half-done with nothing to undo it — no working
 * `db.transaction()` exists to wrap them (see local-db-no-transactions).
 * Use this anywhere multiple local writes must land together or not at all
 * — e.g. settling a payment (the payment row + the order's status flip).
 */
export const upsertRowsAtomic = async (
  entries: Array<{ table: any; row: any }>,
): Promise<string[]> => {
  if (!entries.length) return [];

  const writes = entries.map(({ table, row }) => {
    const payload = toDbPayload(row);
    const knownColumns = new Set(
      Object.values(getTableColumns(table)).map((col: any) => col.name),
    );
    const values: Record<string, any> = {};
    for (const key of Object.keys(payload)) {
      if (knownColumns.has(key)) values[key] = payload[key];
    }
    return { table: getTableName(table), values };
  });

  await invoke("atomic_upsert_rows", { db: LOCAL_DB_URL, writes });

  return writes.map((w) => String(w.values.id));
};

const UPSERT_BATCH_SIZE = 200;

/**
 * Batched upsert: N rows in ceil(N/200) IPC round-trips instead of N (each
 * `upsertRow` call is its own await across the Tauri bridge, which dominates
 * cost for menu/category/user syncs). On conflict, each column falls back to
 * the existing value via COALESCE(excluded.col, table.col) rather than a
 * fixed literal SET, so a row that omits a field (e.g. categories never set
 * created_at) doesn't null it out — same partial-update semantics as
 * `upsertRow`. Only real table columns are included in the SET list — rows
 * commonly carry extra fields (kept only in `raw_json`) that aren't columns,
 * and referencing `excluded.<non-column>` is invalid SQL.
 */
export const upsertRows = async (
  table: any,
  rows: any[],
  db?: any,
): Promise<string[]> => {
  if (!rows || rows.length === 0) return [];
  const resolvedDb = await resolveDb(db);
  const payloads = rows.map((row) => toDbPayload(row));

  const updateKeys = new Set<string>();
  for (const payload of payloads) {
    for (const key of Object.keys(payload)) {
      if (key === "id" || table[key] === undefined) continue;
      updateKeys.add(key);
    }
  }

  const set: Record<string, SQL> = {};
  for (const key of updateKeys) {
    set[key] = sql`coalesce(${sql.raw(`"excluded"."${key}"`)}, ${table[key]})`;
  }

  for (let i = 0; i < payloads.length; i += UPSERT_BATCH_SIZE) {
    const chunk = payloads.slice(i, i + UPSERT_BATCH_SIZE);
    await resolvedDb
      .insert(table)
      .values(chunk as any)
      .onConflictDoUpdate({ target: table.id, set });
  }

  return payloads.map((payload) => payload.id);
};
