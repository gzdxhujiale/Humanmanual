// Offline dictionary lookup backed by the bundled ECDICT SQLite database.
//
// The database (`resources/ecdict.db`) is produced by `scripts/build-ecdict.mjs`
// and shipped as a Tauri resource. It is opened read-only and cached for the
// lifetime of the app. Lookups fall back through a lemmatization table and a few
// naive stemming heuristics so inflected words ("running", "went") still resolve.

use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::Row;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tokio::sync::OnceCell;

use crate::error::{AppError, AppResult};

/// A single dictionary entry returned to the frontend.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DictEntry {
    pub word: String,
    pub phonetic: String,
    pub definition: String,
    pub translation: String,
    pub pos: String,
    pub tag: String,
    pub exchange: String,
    pub collins: i64,
    pub oxford: i64,
    pub found: bool,
    /// When the query was resolved through lemmatization/stemming, this holds
    /// the original word the user searched for (e.g. "running" -> "run").
    pub lemmatized_from: Option<String>,
}

/// Managed state: resolved path to the bundled DB plus a lazily-opened pool.
pub struct DictState {
    db_path: Option<PathBuf>,
    pool: OnceCell<SqlitePool>,
}

impl DictState {
    pub fn new(db_path: Option<PathBuf>) -> Self {
        DictState {
            db_path,
            pool: OnceCell::new(),
        }
    }

    async fn pool(&self) -> AppResult<&SqlitePool> {
        let path = self.db_path.as_ref().ok_or_else(|| {
            AppError::from("词库未安装：未找到 ecdict.db，请先运行 `pnpm build:dict` 生成词库。")
        })?;
        self.pool
            .get_or_try_init(|| async {
                let opts = SqliteConnectOptions::new()
                    .filename(path)
                    .read_only(true)
                    .immutable(true);
                SqlitePoolOptions::new()
                    .max_connections(2)
                    .connect_with(opts)
                    .await
                    .map_err(AppError::from)
            })
            .await
    }
}

/// Resolve the dictionary database path, preferring the bundled resource and
/// falling back to `src-tauri/resources/ecdict.db` during `tauri dev`.
///
/// Android 上 Resource 目录位于 APK assets，SQLite 无法直接以文件方式打开；
/// 首启时尝试将词库拷贝到应用数据目录，拷贝失败则词典功能降级不可用。
pub fn resolve_dict_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        let data_dir = app.path().app_data_dir().ok()?;
        let target = data_dir.join("ecdict.db");
        if target.exists() {
            return Some(target);
        }
        if let Ok(src) = app
            .path()
            .resolve("resources/ecdict.db", tauri::path::BaseDirectory::Resource)
        {
            let _ = std::fs::create_dir_all(&data_dir);
            if std::fs::copy(&src, &target).is_ok() {
                return Some(target);
            }
        }
        return None;
    }

    #[cfg(not(target_os = "android"))]
    {
        if let Ok(p) = app
            .path()
            .resolve("resources/ecdict.db", tauri::path::BaseDirectory::Resource)
        {
            if p.exists() {
                return Some(p);
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            let dev = cwd.join("resources").join("ecdict.db");
            if dev.exists() {
                return Some(dev);
            }
        }
        None
    }
}

async fn query_word(pool: &SqlitePool, word: &str) -> AppResult<Option<DictEntry>> {
    let row = sqlx::query(
        "SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, exchange \
         FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(word)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| DictEntry {
        word: r.get::<Option<String>, _>("word").unwrap_or_default(),
        phonetic: r.get::<Option<String>, _>("phonetic").unwrap_or_default(),
        definition: r.get::<Option<String>, _>("definition").unwrap_or_default(),
        translation: r.get::<Option<String>, _>("translation").unwrap_or_default(),
        pos: r.get::<Option<String>, _>("pos").unwrap_or_default(),
        tag: r.get::<Option<String>, _>("tag").unwrap_or_default(),
        exchange: r.get::<Option<String>, _>("exchange").unwrap_or_default(),
        collins: r.get::<Option<i64>, _>("collins").unwrap_or(0),
        oxford: r.get::<Option<i64>, _>("oxford").unwrap_or(0),
        found: true,
        lemmatized_from: None,
    }))
}

async fn query_lemma(pool: &SqlitePool, word: &str) -> AppResult<Option<String>> {
    let row = sqlx::query("SELECT base FROM lemma WHERE variant = ? COLLATE NOCASE LIMIT 1")
        .bind(word)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.get::<String, _>("base")))
}

/// Cheap English stemming fallbacks for words missing from the lemma table.
fn naive_stems(word: &str) -> Vec<String> {
    let mut out = Vec::new();
    let w = word;
    let mut push = |s: String| {
        if s.len() >= 2 && s != w && !out.contains(&s) {
            out.push(s);
        }
    };
    if let Some(base) = w.strip_suffix("ies") {
        push(format!("{}y", base));
    }
    for suffix in ["es", "s"] {
        if let Some(base) = w.strip_suffix(suffix) {
            push(base.to_string());
        }
    }
    for suffix in ["ing", "ed"] {
        if let Some(base) = w.strip_suffix(suffix) {
            push(base.to_string());
            push(format!("{}e", base)); // making -> make, hoped -> hope
            // handle doubled consonant: running -> run, stopped -> stop
            let bytes = base.as_bytes();
            if bytes.len() >= 2 && bytes[bytes.len() - 1] == bytes[bytes.len() - 2] {
                push(base[..base.len() - 1].to_string());
            }
        }
    }
    out
}

#[tauri::command]
pub async fn dict_lookup(word: String, state: State<'_, DictState>) -> AppResult<DictEntry> {
    let query = word.trim().to_lowercase();
    if query.is_empty() {
        return Err("请输入要查询的单词".into());
    }

    let pool = state.pool().await?;

    // 1. Direct hit.
    if let Some(entry) = query_word(pool, &query).await? {
        return Ok(entry);
    }

    // 2. Lemmatization table (词形还原).
    if let Some(base) = query_lemma(pool, &query).await? {
        if base.to_lowercase() != query {
            if let Some(mut entry) = query_word(pool, &base).await? {
                entry.lemmatized_from = Some(query.clone());
                return Ok(entry);
            }
        }
    }

    // 3. Naive stemming fallbacks.
    for candidate in naive_stems(&query) {
        if let Some(mut entry) = query_word(pool, &candidate).await? {
            entry.lemmatized_from = Some(query.clone());
            return Ok(entry);
        }
    }

    // 4. Not found.
    Ok(DictEntry {
        word: query,
        found: false,
        ..Default::default()
    })
}
