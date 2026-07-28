// Shared sync helpers: canonical timestamp formatting, tombstone tracking,
// concurrency guard, and the common "local delete → sync_queue + tombstone →
// best-effort remote delete" flow used by every module's delete command.


use std::sync::OnceLock;
use tokio::sync::Mutex;

// ── Concurrency guard ──────────────────────────────────────────────────
// A single global mutex serialises pull/push so they never overlap with
// each other or with a user-triggered background push.

static SYNC_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Acquire before any pull_from_tidb / push_to_tidb call.
pub fn sync_lock() -> &'static Mutex<()> {
    SYNC_MUTEX.get_or_init(|| Mutex::new(()))
}

// ── Timestamps ─────────────────────────────────────────────────────────

/// Canonical storage timestamp: UTC `YYYY-MM-DD HH:MM:SS.mmm`.
/// Every table's created_at/updated_at strings use this single format.
pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// Current UNIX timestamp in milliseconds.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ── Sync Watermarks (Incremental Delta Sync) ───────────────────────────

/// Retrieve the last sync watermark timestamp for a table from `sync_state`.
pub async fn get_watermark(pool: &sqlx::SqlitePool, table_name: &str, is_pull: bool) -> Option<chrono::NaiveDateTime> {
    use sqlx::Row;
    let col = if is_pull { "last_pulled_at" } else { "last_pushed_at" };
    let query = format!("SELECT {} FROM sync_state WHERE table_name = ?", col);
    if let Ok(Some(row)) = sqlx::query(&query).bind(table_name).fetch_optional(pool).await {
        let ts_str: Option<String> = row.try_get(col).ok();
        if let Some(s) = ts_str {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.3f") {
                return Some(dt);
            }
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
                return Some(dt);
            }
        }
    }
    None
}

/// Update the sync watermark timestamp for a table in `sync_state`.
pub async fn set_watermark(pool: &sqlx::SqlitePool, table_name: &str, timestamp: &str, is_pull: bool) {
    let col = if is_pull { "last_pulled_at" } else { "last_pushed_at" };
    let sql = format!(
        "INSERT INTO sync_state (table_name, {}) VALUES (?, ?) ON CONFLICT(table_name) DO UPDATE SET {} = excluded.{}",
        col, col, col
    );
    let _ = sqlx::query(&sql).bind(table_name).bind(timestamp).execute(pool).await;
}

// ── Reliable Outbox Queue Pattern ──────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OutboxEntry {
    pub id: i64,
    pub table_name: String,
    pub entity_id: String,
    pub action: String,
}

/// Record an action ('upsert' or 'delete') in SQLite outbox_queue for reliable offline replay.
pub async fn record_outbox_event(pool: &sqlx::SqlitePool, table_name: &str, entity_id: &str, action: &str) {
    let now = now_iso();
    let sql = "INSERT INTO outbox_queue (table_name, entity_id, action, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(table_name, entity_id, action) DO UPDATE SET created_at = excluded.created_at";
    let _ = sqlx::query(sql)
        .bind(table_name)
        .bind(entity_id)
        .bind(action)
        .bind(&now)
        .execute(pool)
        .await;
}

/// Fetch pending outbox entries from SQLite.
pub async fn get_pending_outbox(pool: &sqlx::SqlitePool) -> Vec<OutboxEntry> {
    use sqlx::Row;
    let sql = "SELECT id, table_name, entity_id, action FROM outbox_queue ORDER BY id ASC LIMIT 500";
    if let Ok(rows) = sqlx::query(sql).fetch_all(pool).await {
        return rows.into_iter().map(|r| OutboxEntry {
            id: r.try_get("id").unwrap_or(0),
            table_name: r.try_get("table_name").unwrap_or_default(),
            entity_id: r.try_get("entity_id").unwrap_or_default(),
            action: r.try_get("action").unwrap_or_default(),
        }).collect();
    }
    Vec::new()
}

/// Clear processed outbox entries by IDs.
pub async fn clear_outbox_entries(pool: &sqlx::SqlitePool, ids: &[i64]) {
    if ids.is_empty() { return; }
    let ids_str = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let sql = format!("DELETE FROM outbox_queue WHERE id IN ({})", ids_str);
    let _ = sqlx::query(&sql).execute(pool).await;
}




