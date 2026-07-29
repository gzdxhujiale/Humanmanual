use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::error::AppResult;
use crate::turso_state::TursoDb;

/// 平台无关的应用数据目录（setup 时由 lib.rs 注入）：
static APP_CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_config_dir(dir: PathBuf) {
    let _ = APP_CONFIG_DIR.set(dir);
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
