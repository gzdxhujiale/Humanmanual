// Online dictionary lookup via Youdao Web API with local SQLite caching (`dict_cache`).
//
// 1. Checks local SQLite `dict_cache` table for cached queries (instant & offline-capable).
// 2. If missing, queries Youdao public web API (no API key required).
// 3. Caches successful lookups locally into SQLite so subsequent lookups are instant.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::error::{AppError, AppResult};

/// A bilingual example sentence pair.
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DictExample {
    pub sentence: String,
    pub translation: String,
    pub source: Option<String>,
}

/// A common phrase or collocation associated with the word.
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DictPhrase {
    pub phrase: String,
    pub translation: Option<String>,
}

/// A single dictionary entry returned to the frontend.
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DictEntry {
    pub word: String,
    pub phonetic: String,
    pub us_phonetic: Option<String>,
    pub uk_phonetic: Option<String>,
    pub us_audio: Option<String>,
    pub uk_audio: Option<String>,
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
    #[serde(default)]
    pub examples: Vec<DictExample>,
    #[serde(default)]
    pub phrases: Vec<DictPhrase>,
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
        let word_val: String = row.try_get("word").unwrap_or_default();
        let audio_base = format!("https://dict.youdao.com/dictvoice?audio={}", urlencoding_simple(&word_val));
        return Ok(DictEntry {
            word: word_val,
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            us_audio: Some(format!("{}&type=2", audio_base)),
            uk_audio: Some(format!("{}&type=1", audio_base)),
            definition: row.try_get("definition").unwrap_or_default(),
            translation: row.try_get("translation").unwrap_or_default(),
            pos: row.try_get("pos").unwrap_or_default(),
            tag: row.try_get("tag").unwrap_or_default(),
            exchange: row.try_get("exchange").unwrap_or_default(),
            collins: row.try_get("collins").unwrap_or(0),
            oxford: row.try_get("oxford").unwrap_or(0),
            found: true,
            ..Default::default()
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

fn urlencoding_simple(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            b' ' => encoded.push_str("%20"),
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

/// Query Youdao public JSON API for word definition, phonetics, examples, and phrases.
async fn fetch_youdao_online(query: &str) -> Result<DictEntry, AppError> {
    let url = format!("https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q={}", urlencoding_simple(query));
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
    let mut us_phonetic: Option<String> = None;
    let mut uk_phonetic: Option<String> = None;
    let mut us_audio: Option<String> = None;
    let mut uk_audio: Option<String> = None;
    let mut translations: Vec<String> = Vec::new();
    let mut pos_list: Vec<String> = Vec::new();
    let mut tags: Vec<String> = Vec::new();
    let mut collins_star: i64 = 0;
    let mut forms: Vec<String> = Vec::new();

    let audio_base = format!("https://dict.youdao.com/dictvoice?audio={}", urlencoding_simple(query));

    // Parse EC (English-Chinese dictionary block)
    if let Some(ec) = json.get("ec") {
        if let Some(exam_types) = ec.get("exam_type").and_then(|arr| arr.as_array()) {
            for et in exam_types {
                if let Some(s) = et.as_str() {
                    tags.push(s.to_string());
                }
            }
        }

        if let Some(word_info) = ec.get("word").and_then(|w| w.as_array()).and_then(|arr| arr.first()) {
            if let Some(us) = word_info.get("usphone").and_then(|s| s.as_str()) {
                us_phonetic = Some(us.to_string());
                us_audio = Some(format!("{}&type=2", audio_base));
            }
            if let Some(uk) = word_info.get("ukphone").and_then(|s| s.as_str()) {
                uk_phonetic = Some(uk.to_string());
                uk_audio = Some(format!("{}&type=1", audio_base));
            }
            if let Some(phone) = word_info.get("phone").and_then(|s| s.as_str()) {
                phonetic = format!("[ {} ]", phone);
            } else if let Some(ref us) = us_phonetic {
                phonetic = format!("[ {} ]", us);
            } else if let Some(ref uk) = uk_phonetic {
                phonetic = format!("[ {} ]", uk);
            }

            // Word forms (wfs)
            if let Some(wfs) = word_info.get("wfs").and_then(|arr| arr.as_array()) {
                for wf_item in wfs {
                    if let Some(wf) = wf_item.get("wf") {
                        let name = wf.get("name").and_then(|s| s.as_str()).unwrap_or("");
                        let value = wf.get("value").and_then(|s| s.as_str()).unwrap_or("");
                        if !name.is_empty() && !value.is_empty() {
                            let code = match name {
                                "复数" => "s",
                                "过去式" => "p",
                                "过去分词" => "d",
                                "现在分词" => "i",
                                "第三人称单数" => "3",
                                "比较级" => "r",
                                "最高级" => "t",
                                _ => name,
                            };
                            forms.push(format!("{}:{}", code, value));
                        }
                    }
                }
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

    // Default audio fallback if not set
    if us_audio.is_none() && uk_audio.is_none() {
        us_audio = Some(format!("{}&type=2", audio_base));
        uk_audio = Some(format!("{}&type=1", audio_base));
    }

    // Parse Collins rating
    if let Some(collins_block) = json.get("collins") {
        if let Some(entry) = collins_block.get("collins_entries").and_then(|arr| arr.as_array()).and_then(|arr| arr.first()) {
            if let Some(star_str) = entry.get("star").and_then(|s| s.as_str()) {
                collins_star = star_str.parse::<i64>().unwrap_or(0);
            } else if let Some(star_num) = entry.get("star").and_then(|s| s.as_i64()) {
                collins_star = star_num;
            }
        }
    }

    // Parse POS from syno or ee
    if let Some(syno_block) = json.get("syno") {
        if let Some(synos) = syno_block.get("synos").and_then(|arr| arr.as_array()) {
            for syn in synos {
                if let Some(pos) = syn.get("syno").and_then(|s| s.get("pos")).and_then(|p| p.as_str()) {
                    if !pos_list.contains(&pos.to_string()) {
                        pos_list.push(pos.to_string());
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

    // Parse bilingual example sentences (blng_sents_part)
    let mut examples: Vec<DictExample> = Vec::new();
    if let Some(blng) = json.get("blng_sents_part") {
        if let Some(pairs) = blng.get("sentence-pair").and_then(|arr| arr.as_array()) {
            for pair in pairs.iter().take(5) {
                let sentence_raw = pair.get("sentence-eng")
                    .or_else(|| pair.get("sentence"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let sentence_clean = sentence_raw.replace("<b>", "").replace("</b>", "");

                let translation = pair.get("sentence-translation")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();

                let source = pair.get("source")
                    .and_then(|s| s.as_str())
                    .map(|s| s.replace("《", "").replace("》", ""));

                if !sentence_clean.is_empty() && !translation.is_empty() {
                    examples.push(DictExample {
                        sentence: sentence_clean,
                        translation,
                        source,
                    });
                }
            }
        }
    }

    // Parse common phrases (phrs)
    let mut phrases: Vec<DictPhrase> = Vec::new();
    if let Some(phrs_block) = json.get("phrs") {
        if let Some(phr_list) = phrs_block.get("phrs").and_then(|arr| arr.as_array()) {
            for item in phr_list.iter().take(6) {
                if let Some(head) = item.get("phr").and_then(|p| p.get("headword")).and_then(|h| h.get("l")).and_then(|l| l.get("i")).and_then(|i| i.as_str()) {
                    let mut phrase_tran: Option<String> = None;
                    if let Some(trs) = item.get("phr").and_then(|p| p.get("trs")).and_then(|t| t.as_array()) {
                        for tr in trs {
                            if let Some(tr_str) = tr.get("tr").and_then(|s| s.as_str()) {
                                let cleaned = tr_str.replace("@{l=}", "").replace("}", "").trim().to_string();
                                if !cleaned.is_empty() {
                                    phrase_tran = Some(cleaned);
                                    break;
                                }
                            }
                        }
                    }
                    phrases.push(DictPhrase {
                        phrase: head.to_string(),
                        translation: phrase_tran,
                    });
                }
            }
        }
    }

    let translation_str = translations.join("\n");
    let exchange_str = forms.join("/");

    Ok(DictEntry {
        word: query.to_string(),
        phonetic,
        us_phonetic,
        uk_phonetic,
        us_audio,
        uk_audio,
        definition: translation_str.clone(),
        translation: translation_str,
        pos: pos_list.join(", "),
        tag: tags.join(" "),
        exchange: exchange_str,
        collins: collins_star,
        oxford: 0,
        found: true,
        lemmatized_from: None,
        examples,
        phrases,
    })
}

