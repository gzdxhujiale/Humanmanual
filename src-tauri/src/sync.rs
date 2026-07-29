#![allow(dead_code)]

// Shared sync helpers: canonical timestamp formatting, tombstone tracking,
// concurrency guard, and the common "local delete → sync_queue + tombstone →
// best-effort remote delete" flow used by every module's delete command.

use std::sync::OnceLock;
use tokio::sync::Mutex;
use libsql::Connection;

// ── Concurrency guard ──────────────────────────────────────────────────
// A single global mutex serialises pull/push so they never overlap.

static SYNC_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Acquire before any sync call.
pub fn sync_lock() -> &'static Mutex<()> {
    SYNC_MUTEX.get_or_init(|| Mutex::new(()))
}

// ── Timestamps ─────────────────────────────────────────────────────────

/// Canonical storage timestamp: UTC `YYYY-MM-DD HH:MM:SS.mmm`.
pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// Current UNIX timestamp in milliseconds.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ── Sync Watermarks (Incremental Delta Sync) ───────────────────────────

/// Retrieve the last sync watermark timestamp for a table from `sync_state`.
pub async fn get_watermark(conn: &Connection, table_name: &str, is_pull: bool) -> Option<chrono::NaiveDateTime> {
    let col = if is_pull { "last_pulled_at" } else { "last_pushed_at" };
    let query = format!("SELECT {} FROM sync_state WHERE table_name = ?1", col);
    if let Ok(mut rows) = conn.query(&query, libsql::params![table_name]).await {
        if let Ok(Some(row)) = rows.next().await {
            let ts_str: Option<String> = row.get(0).ok();
            if let Some(s) = ts_str {
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.3f") {
                    return Some(dt);
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
                    return Some(dt);
                }
            }
        }
    }
    None
}

/// Update the sync watermark timestamp for a table in `sync_state`.
pub async fn set_watermark(conn: &Connection, table_name: &str, timestamp: &str, is_pull: bool) {
    let col = if is_pull { "last_pulled_at" } else { "last_pushed_at" };
    let sql = format!(
        "INSERT INTO sync_state (table_name, {}) VALUES (?1, ?2) ON CONFLICT(table_name) DO UPDATE SET {} = excluded.{}",
        col, col, col
    );
    let _ = conn.execute(&sql, libsql::params![table_name, timestamp]).await;
}

// ── Outbox Queue (kept for compatibility, no-op for embedded replica sync) ──

#[derive(Debug, Clone)]
pub struct OutboxEntry {
    pub id: i64,
    pub table_name: String,
    pub entity_id: String,
    pub action: String,
}

/// Record an action ('upsert' or 'delete') - No-op for Turso libSQL embedded replica sync.
pub async fn record_outbox_event(_conn: &Connection, _table_name: &str, _entity_id: &str, _action: &str) {
}

/// Fetch pending outbox entries from the database.
pub async fn get_pending_outbox(conn: &Connection) -> Vec<OutboxEntry> {
    let sql = "SELECT id, table_name, entity_id, action FROM outbox_queue ORDER BY id ASC LIMIT 500";
    if let Ok(mut rows) = conn.query(sql, ()).await {
        let mut result = Vec::new();
        while let Ok(Some(row)) = rows.next().await {
            result.push(OutboxEntry {
                id: row.get(0).unwrap_or(0),
                table_name: row.get(1).unwrap_or_default(),
                entity_id: row.get(2).unwrap_or_default(),
                action: row.get(3).unwrap_or_default(),
            });
        }
        return result;
    }
    Vec::new()
}

/// Clear processed outbox entries by IDs.
pub async fn clear_outbox_entries(conn: &Connection, ids: &[i64]) {
    if ids.is_empty() { return; }
    let ids_str = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let sql = format!("DELETE FROM outbox_queue WHERE id IN ({})", ids_str);
    let _ = conn.execute(&sql, ()).await;
}
