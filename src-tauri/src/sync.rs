// Shared sync helpers: canonical timestamp formatting and the common
// "local delete → sync_queue → best-effort remote delete" flow used by every
// module's delete command.

use crate::db::TidbState;
use sqlx::SqlitePool;

/// Canonical storage timestamp: UTC `YYYY-MM-DD HH:MM:SS.mmm`.
/// Every table's created_at/updated_at strings use this single format.
pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// Current UNIX timestamp in milliseconds.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// After a local row has been deleted, record the deletion in sync_queue and
/// try to flush it to TiDB right away. If the remote delete succeeds the queue
/// entry is cleared; otherwise `push_to_tidb`'s queue pass retries it later.
///
/// `table` must be a trusted literal (one of the synced table names) since it
/// is interpolated into SQL.
pub async fn queue_and_sync_delete(pool: &SqlitePool, tidb_state: &TidbState, table: &str, id: &str) {
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO sync_queue (table_name, record_id, action) VALUES (?, ?, 'DELETE')",
    )
    .bind(table)
    .bind(id)
    .execute(pool)
    .await;

    if let Some(ref mysql) = *tidb_state.0.read().await {
        let delete_sql = format!("DELETE FROM {} WHERE id = ?", table);
        if sqlx::query(&delete_sql).bind(id).execute(mysql).await.is_ok() {
            let _ = sqlx::query(
                "DELETE FROM sync_queue WHERE table_name = ? AND record_id = ? AND action = 'DELETE'",
            )
            .bind(table)
            .bind(id)
            .execute(pool)
            .await;
        }
    }
}
