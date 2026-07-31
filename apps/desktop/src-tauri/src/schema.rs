// Single home for SQLite connection initialization and PRAGMA settings.

use libsql::Connection;

/// Apply essential connection-level SQLite PRAGMA settings.
pub async fn ensure_local_tables(conn: &Connection) -> Result<(), libsql::Error> {
    // PRAGMA journal_mode=WAL returns a result row → must use query(), not execute().
    let _ = conn.query("PRAGMA journal_mode=WAL", ()).await;
    // Set busy timeout so concurrent reads/writes wait up to 5 seconds instead of failing with "database is locked"
    let _ = conn.execute("PRAGMA busy_timeout=5000", ()).await;
    let _ = conn.execute("PRAGMA synchronous=NORMAL", ()).await;
    let _ = conn.execute("PRAGMA foreign_keys=ON", ()).await;

    // 迁移：保证 habit_checkins 上存在 (habit_id, date) 唯一约束，供 habit_toggle_checkin 的
    // `ON CONFLICT(habit_id, date)` upsert 依赖。早期版本的插入路径可能已写入重复行，
    // 直接建唯一索引会失败，故先幂等去重：每个 (habit_id, date) 仅保留一行，
    // 优先保留未软删除、且 updated_at 最新的那条。首次建索引后不再产生重复，此步即成空操作。
    let _ = conn
        .execute(
            "DELETE FROM habit_checkins WHERE rowid NOT IN (
                SELECT rowid FROM (
                    SELECT rowid, ROW_NUMBER() OVER (
                        PARTITION BY habit_id, date
                        ORDER BY (deleted_at IS NULL) DESC, updated_at DESC, rowid DESC
                    ) AS rn FROM habit_checkins
                ) WHERE rn = 1
            )",
            (),
        )
        .await;
    // 唯一索引经嵌入式副本写入并同步至 Turso 主库；IF NOT EXISTS 保证跨端幂等。
    let _ = conn
        .execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_checkins_habit_date ON habit_checkins(habit_id, date)",
            (),
        )
        .await;

    Ok(())
}
