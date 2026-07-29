use libsql::{Builder, Database};
use std::path::PathBuf;
use std::time::Duration;

use crate::db::{read_turso_config, TursoConfigJson};

/// Get the local database file path.
/// 桌面（Windows）沿用 APPDATA\\AIstudy\\data 老路径，保证存量用户数据不迁移；
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

/// Establish a libsql Database connection.
/// - If turso.config.json contains a valid URL + token, opens an embedded replica
///   that automatically syncs with Turso Cloud.
/// - Otherwise, opens a plain local SQLite file (offline-only mode).
pub async fn establish_local_connection(app: &tauri::AppHandle) -> Result<Database, libsql::Error> {
    let db_path = get_local_db_path(app);
    let db_path_str = db_path.to_string_lossy().to_string();

    let cfg: TursoConfigJson = read_turso_config();

    match (cfg.url.as_deref(), cfg.auth_token.as_deref()) {
        (Some(url), Some(token)) if !url.is_empty() && !token.is_empty() => {
            println!("[DB] Opening embedded replica → {}", url);
            let sync_interval_secs = cfg.sync_interval_ms.unwrap_or(60_000) / 1000;

            let result = Builder::new_remote_replica(db_path_str.clone(), url.to_string(), token.to_string())
                .sync_interval(Duration::from_secs(sync_interval_secs.max(10)))
                .build()
                .await;

            match result {
                Ok(db) => Ok(db),
                Err(e) if e.to_string().contains("InvalidLocalState") || e.to_string().contains("metadata file does not") => {
                    // Old sqlx-created database exists without libsql metadata.
                    // Safe to delete: cloud data will be pulled from Turso on first sync().
                    eprintln!("[DB] Old database format detected. Removing stale files and re-initializing...");
                    let _ = std::fs::remove_file(&db_path);
                    let wal = db_path.with_extension("db-wal");
                    let shm = db_path.with_extension("db-shm");
                    let _ = std::fs::remove_file(&wal);
                    let _ = std::fs::remove_file(&shm);
                    println!("[DB] Stale files removed. Retrying embedded replica init...");
                    Builder::new_remote_replica(db_path_str, url.to_string(), token.to_string())
                        .sync_interval(Duration::from_secs(sync_interval_secs.max(10)))
                        .build()
                        .await
                }
                Err(e) => Err(e),
            }
        }
        _ => {
            println!("[DB] No Turso config found — opening local SQLite only.");
            Builder::new_local(db_path_str).build().await
        }
    }
}
