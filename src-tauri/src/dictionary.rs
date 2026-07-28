// Online dictionary lookup via Youdao Web API with local SQLite caching (`dict_cache`).
//
// 1. Checks local SQLite `dict_cache` table for cached queries (instant & offline-capable).
// 2. If missing, queries Youdao public web API (no API key required).
// 3. Caches successful lookups locally into SQLite so subsequent lookups are instant.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::error::{AppError, AppResult};

/// A single dictionary entry returned to the frontend.
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
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
    /// When the query was resolved through lemmatization/stemming.
    pub lemmatized_from: Option<String>,
}

#[tauri::command]
pub async fn dict_lookup(word: String, pool: State<'_, SqlitePool>) -> AppResult<DictEntry> {
    let query = word.trim().to_lowercase();
    if query.is_empty() {
        return Err("请输入要查询的单词".into());
    }

    // 1. Check local SQLite dict_cache table first
    if let Ok(Some(row)) = sqlx::query(
        "SELECT word, phonetic, definition, translation, pos, tag, exchange, collins, oxford FROM dict_cache WHERE word = ? LIMIT 1"
    )
    .bind(&query)
    .fetch_optional(&*pool)
    .await
    {
        return Ok(DictEntry {
            word: row.try_get("word").unwrap_or_default(),
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            definition: row.try_get("definition").unwrap_or_default(),
            translation: row.try_get("translation").unwrap_or_default(),
            pos: row.try_get("pos").unwrap_or_default(),
            tag: row.try_get("tag").unwrap_or_default(),
            exchange: row.try_get("exchange").unwrap_or_default(),
            collins: row.try_get("collins").unwrap_or(0),
            oxford: row.try_get("oxford").unwrap_or(0),
            found: true,
            lemmatized_from: None,
        });
    }

    // 2. Fetch from Youdao Public Web API (no key required)
    match fetch_youdao_online(&query).await {
        Ok(entry) if entry.found => {
            let now = crate::sync::now_iso();
            let _ = sqlx::query(
                "INSERT INTO dict_cache (word, phonetic, definition, translation, pos, tag, exchange, collins, oxford, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, translation = excluded.translation, pos = excluded.pos"
            )
            .bind(&entry.word)
            .bind(&entry.phonetic)
            .bind(&entry.definition)
            .bind(&entry.translation)
            .bind(&entry.pos)
            .bind(&entry.tag)
            .bind(&entry.exchange)
            .bind(entry.collins)
            .bind(entry.oxford)
            .bind(&now)
            .execute(&*pool)
            .await;

            Ok(entry)
        }
        _ => Ok(DictEntry {
            word: query,
            found: false,
            ..Default::default()
        }),
    }
}

/// Query Youdao public JSON API for word definition and phonetics.
async fn fetch_youdao_online(query: &str) -> Result<DictEntry, AppError> {
    let url = format!("https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q={}", query);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let res = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(AppError::from("API 请求状态异常"));
    }

    let json: serde_json::Value = res.json().await?;

    let mut phonetic = String::new();
    let mut translations: Vec<String> = Vec::new();
    let pos_list: Vec<String> = Vec::new();

    // Parse EC (English-Chinese dictionary block)
    if let Some(ec) = json.get("ec") {
        if let Some(word_info) = ec.get("word").and_then(|w| w.as_array()).and_then(|arr| arr.first()) {
            if let Some(us) = word_info.get("usphone").and_then(|s| s.as_str()) {
                phonetic = format!("[ {} ]", us);
            } else if let Some(uk) = word_info.get("ukphone").and_then(|s| s.as_str()) {
                phonetic = format!("[ {} ]", uk);
            } else if let Some(phone) = word_info.get("phone").and_then(|s| s.as_str()) {
                phonetic = format!("[ {} ]", phone);
            }

            if let Some(trs) = word_info.get("trs").and_then(|t| t.as_array()) {
                for tr in trs {
                    if let Some(tran) = tr.get("tran").and_then(|s| s.as_str()) {
                        translations.push(tran.to_string());
                    } else if let Some(tr_obj) = tr.get("tr").and_then(|t| t.as_array()).and_then(|arr| arr.first()) {
                        if let Some(l) = tr_obj.get("l").and_then(|obj| obj.get("i")).and_then(|i| i.as_array()).and_then(|arr| arr.first()) {
                            if let Some(s) = l.as_str() {
                                translations.push(s.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback parsing for general translation block
    if translations.is_empty() {
        if let Some(fanyi) = json.get("fanyi") {
            if let Some(tran) = fanyi.get("tran").and_then(|s| s.as_str()) {
                translations.push(tran.to_string());
            }
        }
    }

    if translations.is_empty() {
        return Ok(DictEntry {
            word: query.to_string(),
            found: false,
            ..Default::default()
        });
    }

    let translation_str = translations.join("\n");

    Ok(DictEntry {
        word: query.to_string(),
        phonetic,
        definition: translation_str.clone(),
        translation: translation_str,
        pos: pos_list.join(", "),
        tag: String::new(),
        exchange: String::new(),
        collins: 0,
        oxford: 0,
        found: true,
        lemmatized_from: None,
    })
}
