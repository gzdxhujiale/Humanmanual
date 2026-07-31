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
    let mut rows = conn
        .query(
            "SELECT id, date, content, rating, created_at, updated_at FROM daily_reviews WHERE deleted_at IS NULL",
            (),
        )
        .await?;

    let parse_ms = |val: Option<String>| -> Option<i64> {
        let s = val?;
        if let Ok(ms) = s.parse::<i64>() {
            Some(ms)
        } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&s) {
            Some(dt.timestamp_millis())
        } else if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.f") {
            Some(naive.and_utc().timestamp_millis())
        } else if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
            Some(naive.and_utc().timestamp_millis())
        } else {
            None
        }
    };

    let mut result = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let created_at_str: Option<String> = row.get(4).ok();
        let updated_at_str: Option<String> = row.get(5).ok();
        result.push(DailyReviewRow {
            id: row.get(0).unwrap_or_default(),
            date: row.get(1).unwrap_or_default(),
            content: row.get(2).unwrap_or_default(),
            rating: row.get(3).ok(),
            created_at: parse_ms(created_at_str),
            updated_at: parse_ms(updated_at_str),
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
