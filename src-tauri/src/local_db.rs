use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::MySqlPool;
use std::path::PathBuf;

/// Get the local database file path under the user's AppData directory.
fn get_local_db_path() -> PathBuf {
    let app_data = std::env::var("APPDATA")
        .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string());
    let dir = PathBuf::from(app_data).join("AIstudy").join("data");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir.join("fishworker.db")
}

/// Establish a connection pool to the local SQLite database.
/// Creates the database file and parent directories if they don't exist.
pub async fn establish_local_connection() -> Result<SqlitePool, sqlx::Error> {
    let db_path = get_local_db_path();
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

/// Copy every row of an entity's table from `$src` into `$dst`, skipping rows
/// whose id already exists (used for the cloud → local pull).
macro_rules! copy_table_keep_existing {
    ($entity:ident, $src:expr, $dst:expr) => {{
        if let Ok(rows) = $entity::Entity::find().all($src).await {
            for r in rows {
                let am = r.into_active_model().reset_all();
                let _ = $entity::Entity::insert(am)
                    .on_conflict(
                        sea_orm::sea_query::OnConflict::column($entity::Column::Id)
                            .do_nothing()
                            .to_owned(),
                    )
                    .exec($dst)
                    .await;
            }
        }
    }};
}

/// Upsert every row of an entity's table from `$src` into `$dst`: on id
/// conflict all columns except `id`/`created_at` are overwritten (used for
/// the local → cloud push, where local is the source of truth).
macro_rules! copy_table_upsert {
    ($entity:ident, $src:expr, $dst:expr) => {{
        let update_cols: Vec<$entity::Column> = <$entity::Column as sea_orm::Iterable>::iter()
            .filter(|c| !matches!(sea_orm::IdenStatic::as_str(c), "id" | "created_at"))
            .collect();
        if let Ok(rows) = $entity::Entity::find().all($src).await {
            for r in rows {
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
    }};
}

/// Apply `$macro` to every synced entity table (keep in step with
/// `crate::schema::SYNCED_TABLES`).
macro_rules! for_each_synced_table {
    ($copy:ident, $src:expr, $dst:expr) => {{
        $copy!(list_folders, $src, $dst);
        $copy!(list_lists, $src, $dst);
        $copy!(list_note_groups, $src, $dst);
        $copy!(list_notes, $src, $dst);
        $copy!(list_templates, $src, $dst);
        $copy!(daily_reviews, $src, $dst);
        $copy!(time_management_tasks, $src, $dst);
        $copy!(mission_statement, $src, $dst);
        $copy!(mission_roles, $src, $dst);
        $copy!(mission_goals, $src, $dst);
        $copy!(habits, $src, $dst);
        $copy!(habit_checkins, $src, $dst);
        $copy!(pomodoro_records, $src, $dst);
        $copy!(pomodoro_favorites, $src, $dst);
    }};
}

/// Pull all existing user data from remote TiDB MySQL into local SQLite (safe sync migration on startup).
pub async fn pull_from_tidb(mysql: &MySqlPool, sqlite: &SqlitePool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel};
    use crate::entities::*;

    let db_sqlite = sea_orm::SqlxSqliteConnector::from_sqlx_sqlite_pool(sqlite.clone());
    let db_mysql = sea_orm::SqlxMySqlConnector::from_sqlx_mysql_pool(mysql.clone());

    for_each_synced_table!(copy_table_keep_existing, &db_mysql, &db_sqlite);

    // app_preferences (raw SQL: not a SeaORM entity)
    if let Ok(rows) = sqlx::query("SELECT pref_key, pref_value FROM app_preferences").fetch_all(mysql).await {
        use sqlx::Row;
        for row in rows {
            let key: String = row.try_get("pref_key").unwrap_or_default();
            let val: String = row.try_get("pref_value").unwrap_or_default();
            let _ = sqlx::query("INSERT INTO app_preferences (pref_key, pref_value) VALUES (?, ?) ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value")
                .bind(&key)
                .bind(&val)
                .execute(sqlite)
                .await;
        }
    }

    Ok(())
}

/// Push all local SQLite user data to remote TiDB MySQL (upward sync/queue flushing).
pub async fn push_to_tidb(mysql: &MySqlPool, sqlite: &SqlitePool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel};
    use crate::entities::*;

    let db_sqlite = sea_orm::SqlxSqliteConnector::from_sqlx_sqlite_pool(sqlite.clone());
    let db_mysql = sea_orm::SqlxMySqlConnector::from_sqlx_mysql_pool(mysql.clone());

    // 0. Process queued DELETE operations from sync_queue
    if let Ok(queue_items) = sqlx::query("SELECT id, table_name, record_id, action FROM sync_queue WHERE action = 'DELETE'")
        .fetch_all(sqlite)
        .await
    {
        use sqlx::Row;
        for row in queue_items {
            let q_id: i64 = row.try_get("id").unwrap_or_default();
            let table_name: String = row.try_get("table_name").unwrap_or_default();
            let record_id: String = row.try_get("record_id").unwrap_or_default();

            if crate::schema::SYNCED_TABLES.contains(&table_name.as_str()) {
                let delete_sql = format!("DELETE FROM {} WHERE id = ?", table_name);
                if sqlx::query(&delete_sql).bind(&record_id).execute(mysql).await.is_ok() {
                    let _ = sqlx::query("DELETE FROM sync_queue WHERE id = ?").bind(q_id).execute(sqlite).await;
                }
            }
        }
    }

    for_each_synced_table!(copy_table_upsert, &db_sqlite, &db_mysql);

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
