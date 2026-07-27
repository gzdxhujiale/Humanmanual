use serde::{Deserialize, Serialize};
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::RwLock;

use crate::error::AppResult;

#[derive(Clone, Default)]
pub struct TidbState(pub Arc<RwLock<Option<MySqlPool>>>);

/// 平台无关的应用数据目录（setup 时由 lib.rs 注入）：
/// 移动端没有 APPDATA/ProgramData，mysql.config.json 的读写都落在这里。
static APP_CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_config_dir(dir: PathBuf) {
    let _ = APP_CONFIG_DIR.set(dir);
}


#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct MysqlConfigJson {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    #[serde(rename = "skipSchemaCreation")]
    pub skip_schema_creation: Option<bool>,
}

#[cfg(desktop)]
fn get_program_data_path() -> PathBuf {
    PathBuf::from(std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string()))
}

#[cfg(desktop)]
fn get_app_data_path() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string()))
}

fn read_config() -> MysqlConfigJson {
    let mut paths: Vec<PathBuf> = Vec::new();
    // Tauri 应用数据目录（移动端唯一候选，桌面作为额外候选）
    if let Some(dir) = APP_CONFIG_DIR.get() {
        paths.push(dir.join("mysql.config.json"));
    }
    #[cfg(desktop)]
    paths.extend(vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("mysql.config.json"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
            .join("mysql.config.json"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("mysql.config.json"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("mysql.config.json")))
            .unwrap_or_default(),
        get_program_data_path()
            .join("AIstudyPublicData")
            .join("config")
            .join("mysql.config.json"),
        get_program_data_path()
            .join("AIstudyUserData")
            .join("mysql.config.json"),
        get_app_data_path()
            .join("AIstudy")
            .join("mysql.config.json"),
    ]);

    for path in paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<MysqlConfigJson>(&content) {
                    return config;
                }
            }
        }
    }
    MysqlConfigJson::default()
}

pub async fn establish_connection() -> Result<MySqlPool, sqlx::Error> {
    let config = read_config();

    let host = std::env::var("TIDB_HOST").ok().or(config.host).unwrap_or_default();
    let port = std::env::var("TIDB_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .or(config.port)
        .unwrap_or(4000);
    let user = std::env::var("TIDB_USER").ok().or(config.user).unwrap_or_default();
    let password = std::env::var("TIDB_PASSWORD").ok().or(config.password).unwrap_or_default();
    let database = std::env::var("TIDB_DATABASE").ok().or(config.database).unwrap_or_default();

    if host.is_empty() || user.is_empty() || password.is_empty() || database.is_empty() {
        return Err(sqlx::Error::Configuration(
            "TiDB connection configuration is incomplete. Missing host, user, password, or database.".into()
        ));
    }

    let url = format!(
        "mysql://{}:{}@{}:{}/{}?ssl-mode=required",
        user, password, host, port, database
    );

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .min_connections(2) // 保持至少2个热连接，避免冷启动
        .acquire_timeout(std::time::Duration::from_secs(10))
        .max_lifetime(std::time::Duration::from_secs(240)) // 4分钟主动回收，在TiDB 5分钟休眠前刷新
        .idle_timeout(std::time::Duration::from_secs(180)) // 空闲3分钟即回收，防止持有死连接
        .connect_lazy(&url)?;

    // 连接池预热：立即建立真实连接，而非等到首次查询
    let pool_warmup = pool.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = sqlx::query("SELECT 1").execute(&pool_warmup).await {
            eprintln!("Failed to warm up connection pool: {}", e);
        }
    });

    // 后台心跳：每2分钟 ping 一次，防止 TiDB Serverless 因空闲休眠
    let pool_keepalive = pool.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(120));
        loop {
            interval.tick().await;
            if let Err(e) = sqlx::query("SELECT 1").execute(&pool_keepalive).await {
                eprintln!("Keepalive ping failed: {}", e);
            }
        }
    });

    let pool_schema = pool.clone();
    let skip_schema_creation = config.skip_schema_creation.unwrap_or(false);
    tauri::async_runtime::spawn(async move {
        if !skip_schema_creation {
            if let Err(e) = crate::schema::ensure_tables(&pool_schema).await {
                eprintln!("Failed to ensure tables in background: {}", e);
            }
        }
    });

    Ok(pool)
}

fn get_config_write_path() -> PathBuf {
    // 桌面保持写入 APPDATA\AIstudy 老位置；移动端写入应用数据目录
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
    path.push("mysql.config.json");
    path
}

#[tauri::command]
pub async fn db_get_config() -> AppResult<MysqlConfigJson> {
    Ok(read_config())
}

#[tauri::command]
pub async fn db_save_config(config: MysqlConfigJson) -> AppResult<()> {
    let path = get_config_write_path();
    let content = serde_json::to_string_pretty(&config)?;
    fs::write(path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn db_get_preference(key: String, pool: tauri::State<'_, sqlx::SqlitePool>) -> AppResult<Option<String>> {
    use sqlx::Row;
    let row = sqlx::query("SELECT pref_value FROM app_preferences WHERE pref_key = ?")
        .bind(key)
        .fetch_optional(&*pool)
        .await?;

    Ok(row.map(|r| r.try_get("pref_value").unwrap_or_default()))
}

#[tauri::command]
pub async fn db_set_preference(
    key: String,
    value: String,
    pool: tauri::State<'_, sqlx::SqlitePool>,
    tidb_state: tauri::State<'_, TidbState>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO app_preferences (pref_key, pref_value) VALUES (?, ?) ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value"
    )
    .bind(&key)
    .bind(&value)
    .execute(&*pool)
    .await?;

    if let Some(ref mysql) = *tidb_state.inner().0.read().await {
        let _ = sqlx::query(
            "INSERT INTO app_preferences (pref_key, pref_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE pref_value = VALUES(pref_value)"
        )
        .bind(&key)
        .bind(&value)
        .execute(mysql)
        .await;
    }

    Ok(())
}

#[allow(dead_code)]
pub fn trigger_background_push(tidb_state: &TidbState, sqlite_pool: sqlx::SqlitePool) {
    let tidb_state = tidb_state.clone();
    tauri::async_runtime::spawn(async move {
        let guard = tidb_state.0.read().await;
        if let Some(mysql) = guard.as_ref() {
            if let Err(e) = crate::local_db::push_to_tidb(mysql, &sqlite_pool).await {
                eprintln!("[Realtime Push] push_to_tidb failed: {}", e);
            }
        }
    });
}

