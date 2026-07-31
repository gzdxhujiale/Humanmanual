use libsql::{Builder, Database};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use tauri::Manager;

use crate::error::AppResult;

/// Wrapper around a libsql Database. Held as Tauri managed state.
/// Uses Arc internally so it can be cloned cheaply for background tasks.
#[derive(Clone)]
pub struct TursoDb {
    pub db: Arc<Database>,
    pub is_remote: bool,
    #[allow(dead_code)]
    pub is_replica: bool,
    #[allow(dead_code)]
    pub init_error: Option<String>,
}

impl TursoDb {
    pub fn new(db: Database, is_remote: bool, is_replica: bool, init_error: Option<String>) -> Self {
        Self { db: Arc::new(db), is_remote, is_replica, init_error }
    }

    /// Get a new connection. Each Tauri command should call this once per invocation.
    pub fn conn(&self) -> Result<libsql::Connection, libsql::Error> {
        self.db.connect()
    }

    /// Trigger a non-blocking push (no-op in Direct Remote Mode as queries execute live over HTTP)
    pub fn push_sync(&self) {
        // Direct Remote Mode executes SQL queries live on Turso Cloud over Hrana HTTP protocol.
        // No local replica WAL push is needed.
    }
}

/// Start background sync worker (no-op in Direct Remote Mode)
#[allow(dead_code)]
pub fn start_background_sync(_app: tauri::AppHandle, _db: TursoDb) {
    // Direct Remote Mode queries live on Turso Cloud; background polling is not required.
}

/// 平台无关的应用数据目录（setup 时由 lib.rs 注入）：
static APP_CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_config_dir(dir: PathBuf) {
    init_tls_ca_certificates(&dir);
    let _ = APP_CONFIG_DIR.set(dir);
}

/// 初始化 TLS CA 根证书环境
pub fn init_tls_ca_certificates(_config_dir: &std::path::Path) {
    unsafe {
        openssl_probe::init_openssl_env_vars();
    }
}

/// Get the local database file path.
/// 桌面端（Windows）优先检查存量 APPDATA\AIstudy\data 老路径，保证旧用户数据不迁移；
/// 跨平台桌面环境默认使用 app_data_dir 下数据路径。
fn get_local_db_path(app: &tauri::AppHandle) -> PathBuf {
    let _ = app;
    // 优先检查存量 Windows APPDATA 老路径
    if let Ok(app_data) = std::env::var("APPDATA") {
        let legacy_db = PathBuf::from(app_data).join("AIstudy").join("data").join("fishworker.db");
        if legacy_db.exists() {
            return legacy_db;
        }
    }
    // 跨平台标准路径：Tauri app_data_dir / data / fishworker.db
    let base_dir = APP_CONFIG_DIR.get().cloned().unwrap_or_else(|| {
        app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
    });
    let dir = base_dir.join("data");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir.join("fishworker.db")
}

const DEFAULT_TURSO_CONFIG: &str = include_str!("../turso.config.json");

/// Establish a libsql Database connection using Direct Remote Client Mode:
/// Priority 1: Direct Remote Client Mode (live query over Hrana HTTP protocol, supporting Turso MVCC)
/// Priority 2: Local SQLite Mode (offline fallback guarantee)
pub async fn establish_local_connection(app: &tauri::AppHandle) -> Result<(Database, bool, bool, Option<String>), libsql::Error> {
    if let Some(parent) = get_local_db_path(app).parent() {
        init_tls_ca_certificates(parent);
    }
    let db_path = get_local_db_path(app);
    let db_path_str = db_path.to_string_lossy().to_string();

    let cfg: TursoConfigJson = read_turso_config();

    match (cfg.url.as_deref(), cfg.auth_token.as_deref()) {
        (Some(raw_url), Some(raw_token)) if !raw_url.trim().is_empty() && !raw_token.trim().is_empty() => {
            let url = raw_url.trim();
            let token = raw_token.trim();

            let remote_url = if url.starts_with("libsql://") {
                url.replacen("libsql://", "https://", 1)
            } else if url.starts_with("turso://") {
                url.replacen("turso://", "https://", 1)
            } else if !url.starts_with("https://") && !url.starts_with("http://") {
                format!("https://{}", url)
            } else {
                url.to_string()
            };

            println!("[DB] Connecting to Turso Cloud (Direct Remote Mode) → {}", remote_url);

            match Builder::new_remote(remote_url.clone(), token.to_string()).build().await {
                Ok(remote_db) => {
                    println!("[DB] Connected to Turso Cloud successfully (Hrana HTTP protocol).");
                    Ok((remote_db, true, false, None))
                }
                Err(remote_err) => {
                    let err_str = remote_err.to_string();
                    eprintln!("[DB] Direct remote client init error: {}. Fallbacking to local SQLite mode.", err_str);

                    let local_db = Builder::new_local(db_path_str).build().await?;
                    Ok((local_db, false, false, Some(format!("RemoteErr: {}", err_str))))
                }
            }
        }
        _ => {
            println!("[DB] No valid Turso config found — opening local SQLite mode.");
            let local_db = Builder::new_local(db_path_str).build().await?;
            Ok((local_db, false, false, None))
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

fn get_app_data_path() -> PathBuf {
    if let Some(dir) = APP_CONFIG_DIR.get() {
        return dir.clone();
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("AIstudy");
    }
    PathBuf::from(".")
}

pub fn read_turso_config() -> TursoConfigJson {
    // Standard Config Resolution:
    // 1. App Data directory (production)
    // 2. Cargo Manifest directory (development)
    let candidate_paths = vec![
        get_app_data_path().join("turso.config.json"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("turso.config.json"),
    ];

    for path in candidate_paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<TursoConfigJson>(&content) {
                    if config.url.as_deref().map_or(false, |u| !u.trim().is_empty()) {
                        return config;
                    }
                }
            }
        }
    }

    // Default embedded config fallback
    if let Ok(config) = serde_json::from_str::<TursoConfigJson>(DEFAULT_TURSO_CONFIG) {
        return config;
    }

    TursoConfigJson::default()
}

#[tauri::command]
pub async fn db_get_turso_config() -> AppResult<TursoConfigJson> {
    Ok(read_turso_config())
}

#[tauri::command]
pub async fn db_save_turso_config(config: TursoConfigJson) -> AppResult<()> {
    let base_dir = get_app_data_path();
    if !base_dir.exists() {
        let _ = fs::create_dir_all(&base_dir);
    }
    let target_path = base_dir.join("turso.config.json");

    let content = serde_json::to_string_pretty(&config)?;
    fs::write(target_path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_preference(key: String, db: tauri::State<'_, TursoDb>) -> AppResult<Option<String>> {
    let conn = db.conn()?;
    let mut rows = conn
        .query("SELECT pref_value FROM app_preferences WHERE pref_key = ?1", libsql::params![key])
        .await?;
    if let Ok(Some(row)) = rows.next().await {
        let val: String = match row.get_value(0) {
            Ok(libsql::Value::Text(s)) => s,
            _ => String::new(),
        };
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
    db.push_sync();
    Ok(())
}

/// Manually trigger a Turso cloud sync status query.
#[tauri::command]
pub async fn db_sync_now(_app: tauri::AppHandle, db: tauri::State<'_, TursoDb>) -> AppResult<String> {
    if db.is_remote {
        Ok("sync_ok: 当前为云端直连模式（即时在线读写，数据实时在线同步）".to_string())
    } else {
        Ok("sync_error: 当前处于纯本地 SQLite 模式".to_string())
    }
}
