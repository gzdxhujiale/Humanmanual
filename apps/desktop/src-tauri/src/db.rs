use libsql::{Builder, Database};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::Manager;

use crate::error::AppResult;

/// Wrapper around a libsql Database. Held as Tauri managed state.
/// Uses Arc internally so it can be cloned cheaply for background tasks.
#[derive(Clone)]
pub struct TursoDb {
    pub db: Arc<Database>,
    pub is_remote: bool,
    pub is_replica: bool,
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

    /// Trigger a non-blocking background sync if connected as an embedded replica.
    pub fn push_sync(&self) {
        if self.is_replica {
            let db_sync = self.db.clone();
            tauri::async_runtime::spawn(async move {
                match db_sync.sync().await {
                    Ok(frames) => {
                        println!("[Turso] Push sync OK — synced frames: {:?}", frames);
                    }
                    Err(e) => {
                        eprintln!("[Turso] Push sync FAILED — error: {}", e);
                    }
                }
            });
        }
    }
}

/// Start a periodic background sync worker that polls Turso Cloud and emits `db:synced`
/// to the frontend whenever remote frames are pulled.
pub fn start_background_sync(app: tauri::AppHandle, db: TursoDb) {
    if !db.is_replica {
        return;
    }
    let db_sync = db.db.clone();
    let interval_ms = read_turso_config().sync_interval_ms.unwrap_or(5000);

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(interval_ms.max(3000)));
        loop {
            interval.tick().await;
            match db_sync.sync().await {
                Ok(replicated) => {
                    if replicated.frames_synced() > 0 {
                        println!("[Turso] Background sync pulled {} frames from cloud! Emitting db:synced.", replicated.frames_synced());
                        use tauri::Emitter;
                        let _ = app.emit("db:synced", ());
                    }
                }
                Err(e) => {
                    eprintln!("[Turso] Background sync error: {}", e);
                }
            }
        }
    });
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

fn reset_replica_files(db_path: &PathBuf) {
    println!("[DB] Cleaning up replica database files: {:?}", db_path);
    let _ = fs::remove_file(db_path);
    if let Some(parent) = db_path.parent() {
        let _ = fs::remove_file(parent.join("fishworker.db-info"));
        let _ = fs::remove_file(parent.join("fishworker.db-shm"));
        let _ = fs::remove_file(parent.join("fishworker.db-wal"));
    }
}

const DEFAULT_TURSO_CONFIG: &str = include_str!("../turso.config.json");

/// Establish a libsql Database connection using a clean 3-tier strategy:
/// Tier 1: Embedded Replica (local fast DB + auto sync with Turso Cloud)
/// Tier 2: Direct Remote Client (live query over HTTP/Hrana if replica init fails)
/// Tier 3: Local SQLite Mode (offline fallback guarantee)
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

            let formatted_url = if url.starts_with("libsql://") {
                url.replacen("libsql://", "https://", 1)
            } else if url.starts_with("turso://") {
                url.replacen("turso://", "https://", 1)
            } else if !url.starts_with("https://") && !url.starts_with("http://") {
                format!("https://{}", url)
            } else {
                url.to_string()
            };

            // If a plain SQLite file exists without .db-info sidecar, clear it so libSQL can build a proper replica.
            if db_path.exists() && !db_path.parent().map_or(false, |p| p.join("fishworker.db-info").exists()) {
                println!("[DB] Converting plain SQLite file to libSQL embedded replica...");
                reset_replica_files(&db_path);
            }

            println!("[DB] Opening embedded replica → {}", formatted_url);
            let sync_interval_secs = cfg.sync_interval_ms.unwrap_or(60_000) / 1000;

            // Tier 1: Embedded Remote Replica
            let replica_res = Builder::new_remote_replica(db_path_str.clone(), formatted_url.clone(), token.to_string())
                .sync_interval(Duration::from_secs(sync_interval_secs.max(10)))
                .build()
                .await;

            match replica_res {
                Ok(db) => Ok((db, true, true, None)),
                Err(replica_err) => {
                    let err_str = replica_err.to_string();
                    eprintln!("[DB] Embedded replica init error: {}. Fallbacking to direct remote mode...", err_str);
                    if err_str.contains("file is not a database") || err_str.contains("corrupt") {
                        reset_replica_files(&db_path);
                    }

                    // Tier 2: Direct Remote Client Mode
                    match Builder::new_remote(formatted_url.clone(), token.to_string()).build().await {
                        Ok(remote_db) => {
                            println!("[DB] Connected using direct remote Turso client mode.");
                            Ok((remote_db, true, false, Some(format!("DirectRemoteFallback: {}", err_str))))
                        }
                        Err(remote_err) => {
                            eprintln!("[DB] Direct remote client init error: {}. Fallbacking to local SQLite mode.", remote_err);

                            // Tier 3: Local SQLite Mode Fallback
                            let local_db = Builder::new_local(db_path_str).build().await?;
                            Ok((local_db, false, false, Some(format!("ReplicaErr: {}; RemoteErr: {}", err_str, remote_err))))
                        }
                    }
                }
            }
        }
        _ => {
            println!("[DB] No valid Turso config found — opening local SQLite only.");
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
    db.push_sync();
    Ok(())
}

/// Manually trigger a Turso cloud sync (pull latest from primary).
#[tauri::command]
pub async fn db_sync_now(app: tauri::AppHandle, db: tauri::State<'_, TursoDb>) -> AppResult<String> {
    if !db.is_replica {
        if db.is_remote {
            return Ok("sync_ok: 当前为云端直连模式（即时在线读写，无需离线同步文件）".to_string());
        } else {
            return Ok("sync_error: 当前处于纯本地 SQLite 模式".to_string());
        }
    }
    match db.db.sync().await {
        Ok(_) => {
            use tauri::Emitter;
            let _ = app.emit("db:synced", ());
            Ok("sync_ok".to_string())
        }
        Err(e) => {
            let err_msg = e.to_string();
            if err_msg.contains("opened in File mode") {
                let detail = db.init_error.as_deref().unwrap_or("未知初始化错误");
                Ok(format!(
                    "sync_error: 无法建立云端副本 ({})",
                    detail
                ))
            } else {
                Ok(format!("sync_error: {}", err_msg))
            }
        }
    }
}
