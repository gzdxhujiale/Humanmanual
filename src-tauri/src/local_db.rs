use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

/// Get the local database file path.
/// 桌面（Windows）沿用 APPDATA\AIstudy\data 老路径，保证存量用户数据不迁移；
/// 移动端（Android/iOS）没有 APPDATA，统一落在 Tauri app_data_dir 下。
fn get_local_db_path(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(desktop)]
    let dir = {
        let _ = app;
        let app_data = std::env::var("APPDATA")
            .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string());
        PathBuf::from(app_data).join("AIstudy").join("data")
    };
    #[cfg(mobile)]
    let dir = {
        use tauri::Manager;
        app.path()
            .app_data_dir()
            .expect("app data dir unavailable")
            .join("data")
    };
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir.join("fishworker.db")
}

/// Establish a connection pool to the local SQLite database.
/// Creates the database file and parent directories if they don't exist.
pub async fn establish_local_connection(app: &tauri::AppHandle) -> Result<SqlitePool, sqlx::Error> {
    let db_path = get_local_db_path(app);
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(10));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Enable WAL mode for better concurrent read/write performance
    sqlx::query("PRAGMA journal_mode=WAL;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA synchronous=NORMAL;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys=ON;")
        .execute(&pool)
        .await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_sqlite() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create in-memory SQLite");
        crate::schema::ensure_local_tables(&pool)
            .await
            .expect("ensure local SQLite tables");
        pool
    }

    async fn sqlite_count(sqlite: &SqlitePool, table: &str) -> i64 {
        let row = sqlx::query(&format!("SELECT COUNT(*) AS c FROM {}", table))
            .fetch_one(sqlite)
            .await
            .unwrap_or_else(|e| panic!("count SQLite.{}: {}", table, e));
        row.try_get::<i64, _>("c").unwrap()
    }

    #[tokio::test]
    async fn foreign_key_cascade_deletes_child_records() {
        let sqlite = setup_sqlite().await;
        sqlx::query("PRAGMA foreign_keys=ON;").execute(&sqlite).await.unwrap();

        let now = crate::sync::now_iso();

        sqlx::query("INSERT INTO list_lists (id, name, created_at, updated_at) VALUES ('list-fk-1', 'Parent List', ?, ?)")
            .bind(&now)
            .bind(&now)
            .execute(&sqlite)
            .await
            .unwrap();

        sqlx::query("INSERT INTO list_notes (id, list_id, title, content, created_at, updated_at) VALUES ('note-fk-1', 'list-fk-1', 'Child Note', 'Body', ?, ?)")
            .bind(&now)
            .bind(&now)
            .execute(&sqlite)
            .await
            .unwrap();

        assert_eq!(sqlite_count(&sqlite, "list_notes").await, 1);

        sqlx::query("DELETE FROM list_lists WHERE id = 'list-fk-1'")
            .execute(&sqlite)
            .await
            .unwrap();

        assert_eq!(sqlite_count(&sqlite, "list_notes").await, 0);
    }

    #[tokio::test]
    async fn outbox_queue_records_and_flushes_offline_edits() {
        let sqlite = setup_sqlite().await;

        crate::sync::record_outbox_event(&sqlite, "list_folders", "folder-outbox-1", "upsert").await;
        crate::sync::record_outbox_event(&sqlite, "list_folders", "folder-outbox-2", "delete").await;

        let pending = crate::sync::get_pending_outbox(&sqlite).await;
        assert_eq!(pending.len(), 2, "Outbox queue should have 2 recorded events");

        let ids: Vec<i64> = pending.iter().map(|p| p.id).collect();
        crate::sync::clear_outbox_entries(&sqlite, &ids).await;

        let after_clear = crate::sync::get_pending_outbox(&sqlite).await;
        assert_eq!(after_clear.len(), 0, "Outbox queue should be empty after clearing");
    }
}
