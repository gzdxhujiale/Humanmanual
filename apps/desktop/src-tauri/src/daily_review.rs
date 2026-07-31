use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::sync::{now_iso, now_ms};
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

#[tauri::command]
pub async fn daily_review_load_all(db: State<'_, TursoDb>) -> AppResult<Vec<DailyReviewRow>> {
    let conn = db.conn()?;
    let _ = conn.execute(
        "UPDATE daily_reviews SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND length(trim(content)) > 0 AND content != '{}'",
        (),
    ).await;

    let mut rows = conn
        .query(
            "SELECT id, date, content, rating, created_at, updated_at FROM daily_reviews WHERE deleted_at IS NULL",
            (),
        )
        .await?;

    let parse_row_ms = |row: &libsql::Row, idx: i32| -> Option<i64> {
        if let Ok(ms) = row.get::<i64>(idx) {
            return Some(ms);
        }
        if let Ok(f) = row.get::<f64>(idx) {
            return Some(f as i64);
        }
        if let Ok(s) = row.get::<String>(idx) {
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
        }
        None
    };

    let mut result = Vec::new();
    while let Ok(item) = rows.next().await {
        let row = match item {
            Some(r) => r,
            None => break,
        };

        let id: String = row.get(0).unwrap_or_default();
        let raw_date: String = row.get(1).unwrap_or_default();
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
        let content: String = row.get(2).unwrap_or_default();
        let rating: Option<i32> = row.get(3).ok();
        let created_at = parse_row_ms(&row, 4);
        let updated_at = parse_row_ms(&row, 5);

        result.push(DailyReviewRow {
            id,
            date,
            content,
            rating,
            created_at,
            updated_at,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn daily_review_save(review: DailyReviewRow, db: State<'_, TursoDb>) -> AppResult<()> {
    let created_at_value = review.created_at.unwrap_or_else(now_ms);

    let created_iso = chrono::DateTime::from_timestamp_millis(created_at_value)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
        .unwrap_or_else(now_iso);
    let now = now_iso();

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO daily_reviews (id, date, content, rating, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            rating = excluded.rating,
            updated_at = excluded.updated_at",
        libsql::params![review.id, review.date, review.content, review.rating, created_iso, now],
    )
    .await?;

    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn daily_review_delete(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE daily_reviews SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id],
    )
    .await?;

    db.push_sync();
    Ok(())
}
