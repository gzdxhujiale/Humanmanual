use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::repo::{query_all, FromRow};
use crate::sync::now_ms;
use crate::db::TursoDb;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DailyReviewRow {
    pub id: String,
    pub date: String,
    pub content: String,
    pub rating: Option<i32>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

/// 防御性毫秒解析：历史数据可能存在未迁移的 ISO 文本（远端迁移失败时）
fn parse_row_ms(row: &libsql::Row, idx: i32) -> Option<i64> {
    match row.get_value(idx) {
        Ok(libsql::Value::Integer(n)) => Some(n),
        Ok(libsql::Value::Real(f)) => Some(f as i64),
        Ok(libsql::Value::Text(s)) => {
            if let Ok(ms) = s.parse::<i64>() {
                return Some(ms);
            }
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&s) {
                return Some(dt.timestamp_millis());
            }
            if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.f") {
                return Some(naive.and_utc().timestamp_millis());
            }
            if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
                return Some(naive.and_utc().timestamp_millis());
            }
            None
        }
        _ => None,
    }
}

impl FromRow for DailyReviewRow {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        let id: String = match row.get_value(0) {
            Ok(libsql::Value::Text(s)) => s,
            Ok(libsql::Value::Integer(n)) => n.to_string(),
            _ => String::new(),
        };

        let raw_date: String = match row.get_value(1) {
            Ok(libsql::Value::Text(s)) => s,
            _ => String::new(),
        };
        let date = if raw_date.len() >= 10 {
            let b = raw_date.trim().as_bytes();
            if b.len() >= 10 && b[4] == b'-' && b[7] == b'-' {
                raw_date.trim()[..10].to_string()
            } else if b.len() >= 10 && b[4] == b'/' && b[7] == b'/' {
                format!("{}-{}-{}", &raw_date[0..4], &raw_date[5..7], &raw_date[8..10])
            } else {
                raw_date
            }
        } else {
            raw_date
        };

        let content: String = match row.get_value(2) {
            Ok(libsql::Value::Text(s)) => s,
            _ => String::new(),
        };

        let rating: Option<i32> = match row.get_value(3) {
            Ok(libsql::Value::Integer(n)) => Some(n as i32),
            Ok(libsql::Value::Real(f)) => Some(f as i32),
            Ok(libsql::Value::Text(s)) => s.parse::<i32>().ok(),
            _ => None,
        };

        Ok(DailyReviewRow {
            id,
            date,
            content,
            rating,
            created_at: parse_row_ms(row, 4),
            updated_at: parse_row_ms(row, 5),
        })
    }
}

#[tauri::command]
pub async fn daily_review_load_all(db: State<'_, TursoDb>) -> AppResult<Vec<DailyReviewRow>> {
    let conn = db.conn()?;
    let _ = conn.execute(
        "UPDATE daily_reviews SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND length(trim(content)) > 0 AND content != '{}'",
        (),
    ).await;

    query_all(
        &conn,
        "SELECT id, date, content, rating, created_at, updated_at FROM daily_reviews WHERE deleted_at IS NULL",
        (),
    ).await
}

#[tauri::command]
pub async fn daily_review_save(review: DailyReviewRow, db: State<'_, TursoDb>) -> AppResult<()> {
    // 存储层统一 UNIX 毫秒；日期唯一性由 idx_daily_reviews_date 唯一索引保证，
    // 直接 ON CONFLICT(date) upsert，原子性交给数据库，无需前置 SELECT。
    let created_at_value = review.created_at.unwrap_or_else(now_ms);
    let updated_at_value = now_ms();

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO daily_reviews (id, date, content, rating, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)
         ON CONFLICT(date) DO UPDATE SET
            content = excluded.content,
            rating = excluded.rating,
            updated_at = excluded.updated_at,
            deleted_at = NULL",
        libsql::params![review.id, review.date, review.content, review.rating, created_at_value, updated_at_value],
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn daily_review_delete(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE daily_reviews SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now, now, id],
    )
    .await?;

    Ok(())
}
