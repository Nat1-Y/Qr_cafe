use serde::Deserialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use sqlx::sqlite::SqliteArguments;
use sqlx::Sqlite;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

/// One row to upsert as part of an [`atomic_upsert_rows`] call: `values` must
/// include an `"id"` entry and only real columns of `table` (the JS side is
/// responsible for filtering — see `upsertRowsAtomic` in
/// infrastructure/database/local-db-query.ts).
#[derive(Deserialize)]
pub struct AtomicWrite {
    table: String,
    values: JsonMap<String, JsonValue>,
}

/// Runs 1+ upserts (`INSERT ... ON CONFLICT("id") DO UPDATE`), across one or
/// more tables, inside a single real SQLite transaction — all writes commit
/// together or none do.
///
/// Exists because `tauri-plugin-sql`'s JS API is one IPC call per statement
/// against a pooled `sqlx::Pool<Sqlite>` (up to 10 connections by default);
/// sequential `db.execute()` calls from JS aren't guaranteed to land on the
/// same physical connection, so a `BEGIN` from one call and a `COMMIT` from a
/// later one don't reliably pair up (`"Failed query: commit"` — see the
/// project's `local-db-no-transactions` note). This command instead borrows
/// ONE connection from that exact same pool (via `tauri-plugin-sql`'s own
/// `DbInstances` state, so it's the same pool the JS driver reads/writes)
/// for the whole operation, so a real `BEGIN`/`COMMIT` here is genuinely
/// atomic. Used for settling a payment: the payment insert and the order's
/// status flip must both land or neither should (see payments.adapter.ts).
///
/// `DbInstances`/`DbPool` aren't part of tauri-plugin-sql's documented public
/// API (no semver guarantee) — the plugin version in Cargo.toml is pinned
/// deliberately; re-check this command against its source on any upgrade.
#[tauri::command]
pub async fn atomic_upsert_rows(
    db_instances: State<'_, DbInstances>,
    db: String,
    writes: Vec<AtomicWrite>,
) -> Result<(), String> {
    if writes.is_empty() {
        return Ok(());
    }

    let instances = db_instances.0.read().await;
    // `mysql`/`postgres` features are off (Cargo.toml only enables "sqlite"),
    // so DbPool has exactly one variant here — the match still names it
    // explicitly so this stays correct if those features are ever added.
    #[allow(unreachable_patterns)]
    let pool = match instances.get(&db) {
        Some(DbPool::Sqlite(pool)) => pool,
        Some(_) => return Err(format!("db '{db}' is not a sqlite pool")),
        None => return Err(format!("db '{db}' is not loaded")),
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for write in &writes {
        if !write.values.contains_key("id") {
            return Err(format!(
                "atomic_upsert_rows: write on table '{}' is missing 'id'",
                write.table
            ));
        }

        // Stable column order so the placeholder list and the bind loop below
        // line up; iteration order of a serde_json::Map is insertion order.
        let columns: Vec<&String> = write.values.keys().collect();
        let quoted_columns: Vec<String> =
            columns.iter().map(|c| format!("\"{c}\"")).collect();
        let placeholders: Vec<String> =
            (1..=columns.len()).map(|i| format!("?{i}")).collect();
        let update_set: Vec<String> = columns
            .iter()
            .filter(|c| c.as_str() != "id")
            .map(|c| format!("\"{c}\" = excluded.\"{c}\""))
            .collect();

        // Table names here always come from getTableName() on a known local
        // drizzle schema table (see upsertRowsAtomic), never raw user input,
        // so interpolating it directly is safe.
        let sql = if update_set.is_empty() {
            format!(
                "INSERT INTO \"{table}\" ({cols}) VALUES ({vals}) ON CONFLICT(\"id\") DO NOTHING",
                table = write.table,
                cols = quoted_columns.join(", "),
                vals = placeholders.join(", "),
            )
        } else {
            format!(
                "INSERT INTO \"{table}\" ({cols}) VALUES ({vals}) ON CONFLICT(\"id\") DO UPDATE SET {updates}",
                table = write.table,
                cols = quoted_columns.join(", "),
                vals = placeholders.join(", "),
                updates = update_set.join(", "),
            )
        };

        let mut query = sqlx::query(&sql);
        for col in &columns {
            query = bind_json(query, &write.values[col.as_str()]);
        }

        query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("atomic_upsert_rows: write on table '{}' failed: {e}", write.table))?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Binds a JSON value the same way the JS-side proxy (client.ts) already
/// normalizes values before they reach tauri-plugin-sql: booleans are sent
/// through as 0/1 integers by `normalizeDbValue` before this command is even
/// invoked, so only null/string/number are expected here in practice — the
/// bool arm is kept only as a defensive fallback.
fn bind_json<'q>(
    query: sqlx::query::Query<'q, Sqlite, SqliteArguments<'q>>,
    value: &'q JsonValue,
) -> sqlx::query::Query<'q, Sqlite, SqliteArguments<'q>> {
    match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::String(s) => query.bind(s.as_str()),
        JsonValue::Bool(b) => query.bind(if *b { 1i64 } else { 0i64 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or_default())
            }
        }
        other => query.bind(other.to_string()),
    }
}
