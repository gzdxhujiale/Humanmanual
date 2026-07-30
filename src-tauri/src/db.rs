use libsql::{Builder, Database};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use crate::error::AppResult;

/// Wrapper around a libsql Database. Held as Tauri managed state.
/// Uses Arc internally so it can be cloned cheaply for background tasks.
#[derive(Clone)]
pub struct TursoDb {
    pub db: Arc<Database>,
}

impl TursoDb {
    pub fn new(db: Database) -> Self {
        Self { db: Arc::new(db) }
    }

    /// Get a new connection. Each Tauri command should call this once per invocation.
    pub fn conn(&self) -> Result<libsql::Connection, libsql::Error> {
        self.db.connect()
    }
}

/// 平台无关的应用数据目录（setup 时由 lib.rs 注入）：
static APP_CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_config_dir(dir: PathBuf) {
    let _ = APP_CONFIG_DIR.set(dir);
}

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

#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct TursoConfigJson {
    pub url: Option<String>,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
    #[serde(rename = "syncIntervalMs")]
    pub sync_interval_ms: Option<u64>,
    #[serde(rename = "syncOnStart")]
    pub sync_on_start: Option<bool>,
}

#[cfg(desktop)]
fn get_app_data_path() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string()))
}

pub fn read_turso_config() -> TursoConfigJson {
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(dir) = APP_CONFIG_DIR.get() {
        paths.push(dir.join("turso.config.json"));
    }
    #[cfg(desktop)]
    paths.extend(vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("turso.config.json"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
            .join("turso.config.json"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("turso.config.json"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("turso.config.json")))
            .unwrap_or_default(),
        get_app_data_path()
            .join("AIstudy")
            .join("turso.config.json"),
    ]);

    for path in paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<TursoConfigJson>(&content) {
                    return config;
                }
            }
        }
    }

    TursoConfigJson::default()
}

#[tauri::command]
pub async fn db_get_turso_config() -> AppResult<TursoConfigJson> {
    Ok(read_turso_config())
}

#[tauri::command]
pub async fn db_save_turso_config(config: TursoConfigJson) -> AppResult<()> {
    #[cfg(desktop)]
    let mut path = {
        let mut p = get_app_data_path();
        p.push("AIstudy");
        p
    };
    #[cfg(mobile)]
    let mut path = APP_CONFIG_DIR.get().cloned().unwrap_or_default();
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push("turso.config.json");

    let content = serde_json::to_string_pretty(&config)?;
    fs::write(path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_preference(key: String, db: tauri::State<'_, TursoDb>) -> AppResult<Option<String>> {
    let conn = db.conn()?;
    let mut rows = conn
        .query("SELECT pref_value FROM app_preferences WHERE pref_key = ?1", libsql::params![key])
        .await?;
    if let Ok(Some(row)) = rows.next().await {
        let val: String = row.get(0).unwrap_or_default();
        return Ok(Some(val));
    }
    Ok(None)
}

#[tauri::command]
pub async fn db_set_preference(
    key: String,
    value: String,
    db: tauri::State<'_, TursoDb>,
) -> AppResult<()> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO app_preferences (pref_key, pref_value) VALUES (?1, ?2) ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value",
        libsql::params![key, value],
    )
    .await?;
    Ok(())
}

/// Manually trigger a Turso cloud sync (pull latest from primary).
#[tauri::command]
pub async fn db_sync_now(db: tauri::State<'_, TursoDb>) -> AppResult<String> {
    match db.db.sync().await {
        Ok(_) => Ok("sync_ok".to_string()),
        Err(e) => Ok(format!("sync_error: {}", e)),
    }
}
