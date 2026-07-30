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

