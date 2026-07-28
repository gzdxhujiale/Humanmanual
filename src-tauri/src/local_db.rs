use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::MySqlPool;
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


/// Upsert every row of an entity's table from `$src` into `$dst` using Last-Write-Wins (LWW)
/// based on `updated_at`. Supports incremental delta sync using `sync_state` watermarks.
macro_rules! copy_table_lww {
    ($entity:ident, $src:expr, $dst:expr, $sqlite:expr, $table_name:expr, $is_pull:expr) => {{
        use sea_orm::ColumnTrait;
        use sea_orm::QueryFilter;

        let watermark = crate::sync::get_watermark($sqlite, $table_name, $is_pull).await;
        let now_str = crate::sync::now_iso();

        let update_cols: Vec<$entity::Column> = <$entity::Column as sea_orm::Iterable>::iter()
            .filter(|c| !matches!(sea_orm::IdenStatic::as_str(c), "id" | "created_at"))
            .collect();

        let query = $entity::Entity::find();
        let query = match watermark {
            Some(ts) => query.filter(
                $entity::Column::UpdatedAt.gt(ts)
                    .or($entity::Column::DeletedAt.gt(ts))
            ),
            None => query,
        };

        match query.all($src).await {
            Ok(rows) => {
                for r in rows {
                    let id = r.id.clone();
                    let should_write = match $entity::Entity::find_by_id(id).one($dst).await {
                        Ok(Some(existing)) => r.updated_at > existing.updated_at,
                        Ok(None) => true,
                        Err(_) => false,
                    };
                    if should_write {
                        let am = r.into_active_model().reset_all();
                        let _ = $entity::Entity::insert(am)
                            .on_conflict(
                                sea_orm::sea_query::OnConflict::column($entity::Column::Id)
                                    .update_columns(update_cols.iter().copied())
                                    .to_owned(),
                            )
                            .exec($dst)
                            .await;
                    }
                }
                crate::sync::set_watermark($sqlite, $table_name, &now_str, $is_pull).await;
            }
            Err(e) => {
                eprintln!("[SyncEngine] copy_table_lww error for table {}: {}", $table_name, e);
            }
        }
    }};
}

/// Apply LWW sync macro to every synced entity table (keep in step with
/// `crate::schema::SYNCED_TABLES`).
macro_rules! sync_all_tables {
    ($src:expr, $dst:expr, $sqlite:expr, $is_pull:expr) => {{
        copy_table_lww!(list_folders, $src, $dst, $sqlite, "list_folders", $is_pull);
        copy_table_lww!(list_lists, $src, $dst, $sqlite, "list_lists", $is_pull);
        copy_table_lww!(list_note_groups, $src, $dst, $sqlite, "list_note_groups", $is_pull);
        copy_table_lww!(list_notes, $src, $dst, $sqlite, "list_notes", $is_pull);
        copy_table_lww!(list_templates, $src, $dst, $sqlite, "list_templates", $is_pull);
        copy_table_lww!(daily_reviews, $src, $dst, $sqlite, "daily_reviews", $is_pull);
        copy_table_lww!(time_management_tasks, $src, $dst, $sqlite, "time_management_tasks", $is_pull);
        copy_table_lww!(mission_statement, $src, $dst, $sqlite, "mission_statement", $is_pull);
        copy_table_lww!(mission_roles, $src, $dst, $sqlite, "mission_roles", $is_pull);
        copy_table_lww!(mission_goals, $src, $dst, $sqlite, "mission_goals", $is_pull);
        copy_table_lww!(habits, $src, $dst, $sqlite, "habits", $is_pull);
        copy_table_lww!(habit_checkins, $src, $dst, $sqlite, "habit_checkins", $is_pull);
        copy_table_lww!(pomodoro_records, $src, $dst, $sqlite, "pomodoro_records", $is_pull);
        copy_table_lww!(pomodoro_favorites, $src, $dst, $sqlite, "pomodoro_favorites", $is_pull);
    }};
}

/// Pull all existing user data from remote TiDB MySQL into local SQLite.
pub async fn pull_from_tidb(mysql: &MySqlPool, sqlite: &SqlitePool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel};
    use crate::entities::*;

    // Acquire sync lock to prevent concurrent pull/push
    let _guard = crate::sync::sync_lock().lock().await;

    let db_sqlite = sea_orm::SqlxSqliteConnector::from_sqlx_sqlite_pool(sqlite.clone());
    let db_mysql = sea_orm::SqlxMySqlConnector::from_sqlx_mysql_pool(mysql.clone());

    sync_all_tables!(&db_mysql, &db_sqlite, sqlite, true);

    // app_preferences: LWW based on updated_at timestamp
    if let Ok(rows) = sqlx::query("SELECT pref_key, pref_value, updated_at FROM app_preferences").fetch_all(mysql).await {
        use sqlx::Row;
        for row in rows {
            let key: String = row.try_get("pref_key").unwrap_or_default();
            let val: String = row.try_get("pref_value").unwrap_or_default();
            let remote_ts: Option<String> = row.try_get::<String, _>("updated_at").ok();

            // Check local timestamp – only overwrite if remote is newer
            let should_write = if let Some(ref rts) = remote_ts {
                match sqlx::query("SELECT updated_at FROM app_preferences WHERE pref_key = ?")
                    .bind(&key)
                    .fetch_optional(sqlite)
                    .await
                {
                    Ok(Some(local_row)) => {
                        let local_ts: String = local_row.try_get("updated_at").unwrap_or_default();
                        rts.as_str() > local_ts.as_str()
                    }
                    Ok(None) => true, // new key
                    Err(_) => false,
                }
            } else {
                true // no remote timestamp, fallback to always-write for backwards compat
            };

            if should_write {
                let _ = sqlx::query("INSERT INTO app_preferences (pref_key, pref_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value, updated_at = excluded.updated_at")
                    .bind(&key)
                    .bind(&val)
                    .bind(&remote_ts.unwrap_or_default())
                    .execute(sqlite)
                    .await;
            }
        }
    }

    Ok(())
}

/// Push all local SQLite user data to remote TiDB MySQL (upward sync/queue flushing).
pub async fn push_to_tidb(mysql: &MySqlPool, sqlite: &SqlitePool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel};
    use crate::entities::*;

    // Acquire sync lock to prevent concurrent pull/push
    let _guard = crate::sync::sync_lock().lock().await;

    let db_sqlite = sea_orm::SqlxSqliteConnector::from_sqlx_sqlite_pool(sqlite.clone());
    let db_mysql = sea_orm::SqlxMySqlConnector::from_sqlx_mysql_pool(mysql.clone());

    // Process pending outbox queue events (offline delete propagation & write replay)
    let outbox_entries = crate::sync::get_pending_outbox(sqlite).await;
    if !outbox_entries.is_empty() {
        let mut processed_ids = Vec::new();
        for entry in &outbox_entries {
            if crate::schema::SYNCED_TABLES.contains(&entry.table_name.as_str()) {
                if entry.action == "delete" {
                    let now = crate::sync::now_iso();
                    let sql = format!("UPDATE {} SET deleted_at = ?, updated_at = ? WHERE id = ?", entry.table_name);
                    if sqlx::query(&sql).bind(&now).bind(&now).bind(&entry.entity_id).execute(mysql).await.is_ok() {
                        processed_ids.push(entry.id);
                    }
                } else if entry.action == "upsert" {
                    processed_ids.push(entry.id);
                }
            } else {
                processed_ids.push(entry.id);
            }
        }
        crate::sync::clear_outbox_entries(sqlite, &processed_ids).await;
    }

    sync_all_tables!(&db_sqlite, &db_mysql, sqlite, false);

    // app_preferences (raw SQL: not a SeaORM entity)
    if let Ok(rows) = sqlx::query("SELECT pref_key, pref_value FROM app_preferences").fetch_all(sqlite).await {
        use sqlx::Row;
        for row in rows {
            let key: String = row.try_get("pref_key").unwrap_or_default();
            let val: String = row.try_get("pref_value").unwrap_or_default();
            let _ = sqlx::query("INSERT INTO app_preferences (pref_key, pref_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE pref_value = VALUES(pref_value)")
                .bind(&key)
                .bind(&val)
                .execute(mysql)
                .await;
        }
    }

    // Garbage Collection: physically delete soft-deleted records older than 30 days
    // to prevent SQLite from growing indefinitely.
    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::days(30))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
        .unwrap_or_default();
    
    for table in crate::schema::SYNCED_TABLES {
        let sql = format!("DELETE FROM {} WHERE deleted_at < ?", table);
        let _ = sqlx::query(&sql).bind(&cutoff).execute(sqlite).await;
        // Best-effort remote GC, doesn't matter if it fails
        let _ = sqlx::query(&sql).bind(&cutoff).execute(mysql).await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    //! C1 seam tests: verify the TiDB (cloud) → SQLite (local) pull chain for
    //! every core module.
    //!
    //! These are INTEGRATION tests: they connect to the real remote TiDB using
    //! the same config path the app uses (`crate::db::establish_connection`),
    //! pull into a throwaway in-memory SQLite, and assert the data arrived.
    //! The pull is read-only on TiDB (only SELECTs), so it is non-destructive.
    //!
    //! Run with:  cargo test --manifest-path src-tauri/Cargo.toml pull_from_tidb
    use super::*;
    use sqlx::Row;
    use sqlx::sqlite::SqlitePoolOptions;

    /// The tables `pull_from_tidb` is responsible for copying, labelled by the
    /// owning module. NOTE: pomodoro has no TiDB tables (local-only), and
    /// `time_management_roles` is intentionally absent from `pull_from_tidb`
    /// even though it exists in TiDB — both are known gaps, not tested here.
    const PULLED_TABLES: &[(&str, &str)] = &[
        ("lists / folders", "list_folders"),
        ("lists / lists", "list_lists"),
        ("lists / note_groups", "list_note_groups"),
        ("lists / notes", "list_notes"),
        ("templates", "list_templates"),
        ("daily-review", "daily_reviews"),
        ("time-management / tasks", "time_management_tasks"),
        ("mission / statement", "mission_statement"),
        ("mission / roles", "mission_roles"),
        ("mission / goals", "mission_goals"),
        ("habit / habits", "habits"),
        ("habit / checkins", "habit_checkins"),
        ("pomodoro / records", "pomodoro_records"),
        ("pomodoro / favorites", "pomodoro_favorites"),
    ];

    /// Fresh in-memory SQLite with the full local schema applied.
    /// `max_connections(1)` keeps the whole test on a single in-memory DB
    /// (each SQLite `:memory:` connection would otherwise be its own empty DB).
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

    async fn connect_tidb() -> Option<MySqlPool> {
        let mysql = crate::db::establish_connection().await.ok()?;
        if sqlx::query("SELECT 1").execute(&mysql).await.is_err() {
            eprintln!("skip: TiDB unreachable (network timeout or offline)");
            return None;
        }
        Some(mysql)
    }

    async fn mysql_count(mysql: &MySqlPool, table: &str) -> i64 {
        let row = sqlx::query(&format!("SELECT COUNT(*) AS c FROM {}", table))
            .fetch_one(mysql)
            .await
            .unwrap_or_else(|e| panic!("count TiDB.{}: {}", table, e));
        row.try_get::<i64, _>("c").unwrap()
    }

    async fn sqlite_count(sqlite: &SqlitePool, table: &str) -> i64 {
        let row = sqlx::query(&format!("SELECT COUNT(*) AS c FROM {}", table))
            .fetch_one(sqlite)
            .await
            .unwrap_or_else(|e| panic!("count SQLite.{}: {}", table, e));
        row.try_get::<i64, _>("c").unwrap()
    }

    /// Every module's rows must land in SQLite after a pull. Oracle = the row
    /// count read straight from TiDB, computed independently of the pull logic.
    /// A shortfall means that module's cloud→local link is broken (a per-table
    /// error swallowed inside `pull_from_tidb`).
    #[tokio::test]
    async fn pull_from_tidb_syncs_every_module_table() {
        let Some(mysql) = connect_tidb().await else {
            eprintln!("skip: TiDB unreachable");
            return;
        };
        let sqlite = setup_sqlite().await;

        pull_from_tidb(&mysql, &sqlite)
            .await
            .expect("pull_from_tidb returned Err");

        let mut report = Vec::new();
        let mut broken = Vec::new();
        for (module, table) in PULLED_TABLES {
            let src = mysql_count(&mysql, table).await;
            let dst = sqlite_count(&sqlite, table).await;
            let status = if dst == src { "OK" } else { "MISMATCH" };
            report.push(format!(
                "  {:<24} TiDB={:<6} SQLite={:<6} {}",
                module, src, dst, status
            ));
            if dst != src {
                broken.push(format!(
                    "{} ({}): TiDB has {} rows, SQLite got {}",
                    module, table, src, dst
                ));
            }
        }

        println!("\n── TiDB→SQLite pull chain report ──\n{}", report.join("\n"));

        assert!(
            broken.is_empty(),
            "Broken cloud→local link for {} module table(s):\n{}",
            broken.len(),
            broken.join("\n")
        );
    }

    /// Field-level fidelity on a representative table, so a matching row COUNT
    /// can't mask garbled column mapping. Oracle = a row read straight from TiDB.
    #[tokio::test]
    async fn pull_from_tidb_preserves_mission_role_fields() {
        let Some(mysql) = connect_tidb().await else {
            eprintln!("skip: TiDB unreachable");
            return;
        };
        let sqlite = setup_sqlite().await;

        let src = sqlx::query("SELECT id, name FROM mission_roles LIMIT 1")
            .fetch_optional(&mysql)
            .await
            .expect("query TiDB mission_roles");
        let Some(src) = src else {
            eprintln!("skip: TiDB.mission_roles is empty, nothing to verify");
            return;
        };
        let src_id: String = src.try_get("id").unwrap();
        let src_name: String = src.try_get("name").unwrap();

        pull_from_tidb(&mysql, &sqlite).await.expect("pull_from_tidb returned Err");

        let dst = sqlx::query("SELECT name FROM mission_roles WHERE id = ?")
            .bind(&src_id)
            .fetch_one(&sqlite)
            .await
            .expect("role present in TiDB should exist in SQLite after pull");
        let dst_name: String = dst.try_get("name").unwrap();
        assert_eq!(dst_name, src_name, "mission_roles.name was mangled during pull");
    }

    #[tokio::test]
    async fn incremental_sync_watermark_is_updated() {
        let Some(mysql) = connect_tidb().await else {
            eprintln!("skip: TiDB unreachable");
            return;
        };
        let sqlite = setup_sqlite().await;

        pull_from_tidb(&mysql, &sqlite).await.expect("first pull");

        let watermark = crate::sync::get_watermark(&sqlite, "list_notes", true).await;
        assert!(watermark.is_some(), "last_pulled_at watermark should be set after pull");

        pull_from_tidb(&mysql, &sqlite).await.expect("second pull (incremental)");
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

    #[tokio::test]
    #[ignore]
    async fn test_push_to_tidb_execution() {
        let Some(mysql) = connect_tidb().await else {
            eprintln!("skip: TiDB unreachable");
            return;
        };
        let sqlite = setup_sqlite().await;

        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let test_id = format!("test-push-{}", uuid::Uuid::new_v4());
        let _ = sqlx::query("INSERT INTO list_folders (id, name, is_pinned, sort_order, created_at, updated_at) VALUES (?, ?, 0, 999, ?, ?)")
            .bind(&test_id)
            .bind("Push Test Folder")
            .bind(&now)
            .bind(&now)
            .execute(&sqlite)
            .await;

        push_to_tidb(&mysql, &sqlite).await.expect("push_to_tidb execution should succeed");

        let row = sqlx::query("SELECT name FROM list_folders WHERE id = ?")
            .bind(&test_id)
            .fetch_optional(&mysql)
            .await
            .expect("query TiDB for pushed folder");

        assert!(row.is_some(), "Pushed folder should exist in TiDB");
        let name: String = row.unwrap().try_get("name").unwrap();
        assert_eq!(name, "Push Test Folder");

        let _ = sqlx::query("DELETE FROM list_folders WHERE id = ?").bind(&test_id).execute(&mysql).await;
        let _ = sqlx::query("DELETE FROM list_folders WHERE id = ?").bind(&test_id).execute(&sqlite).await;

        let tidb_state = crate::db::TidbState(std::sync::Arc::new(tokio::sync::RwLock::new(Some(mysql))));
        crate::db::trigger_background_push(&tidb_state, sqlite);
    }
}
