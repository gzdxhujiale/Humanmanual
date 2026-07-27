use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::db::TidbState;
use crate::error::AppResult;
use crate::sync::queue_and_sync_delete;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkedTarget {
    pub r#type: String,
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PomodoroRecord {
    pub id: String,
    pub mode: String,
    pub phase: String,
    #[serde(rename = "startTime")]
    pub start_time: String,
    #[serde(rename = "endTime")]
    pub end_time: String,
    #[serde(rename = "durationMinutes")]
    pub duration_minutes: i64,
    pub date: String,
    #[serde(rename = "dateLabel")]
    pub date_label: String,
    #[serde(rename = "timeRangeLabel")]
    pub time_range_label: String,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    #[serde(rename = "linkedTarget")]
    pub linked_target: Option<LinkedTarget>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FavoriteFocusTask {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub mode: String,
    #[serde(rename = "durationMinutes")]
    pub duration_minutes: i64,
    #[serde(rename = "accumulatedMinutes")]
    pub accumulated_minutes: i64,
    #[serde(rename = "linkedTarget")]
    pub linked_target: Option<LinkedTarget>,
    #[serde(rename = "isArchived")]
    pub is_archived: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PomodoroData {
    pub records: Vec<PomodoroRecord>,
    #[serde(rename = "favoriteTasks")]
    pub favorite_tasks: Vec<FavoriteFocusTask>,
}

#[tauri::command]
pub async fn pomodoro_load_all(pool: State<'_, SqlitePool>) -> AppResult<PomodoroData> {
    let records_rows = sqlx::query(
        r#"
        SELECT id, mode, phase, start_time, end_time, duration_minutes, date, date_label, time_range_label, task_id, linked_target, created_at
        FROM pomodoro_records
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&*pool)
    .await?;

    let records = records_rows
        .into_iter()
        .map(|row| {
            let id: String = row.try_get("id").unwrap_or_default();
            let mode: String = row.try_get("mode").unwrap_or_default();
            let phase: String = row.try_get("phase").unwrap_or_default();
            let start_time: String = row.try_get("start_time").unwrap_or_default();
            let end_time: String = row.try_get("end_time").unwrap_or_default();
            let duration_minutes: i64 = row.try_get("duration_minutes").unwrap_or(0);
            let date: String = row.try_get("date").unwrap_or_default();
            let date_label: String = row.try_get("date_label").unwrap_or_default();
            let time_range_label: String = row.try_get("time_range_label").unwrap_or_default();
            let task_id: Option<String> = row.try_get("task_id").ok().flatten();
            let linked_target_str: Option<String> = row.try_get("linked_target").ok().flatten();
            let linked_target = linked_target_str
                .and_then(|s| serde_json::from_str::<LinkedTarget>(&s).ok());
            let created_at: String = row.try_get("created_at").unwrap_or_default();

            PomodoroRecord {
                id,
                mode,
                phase,
                start_time,
                end_time,
                duration_minutes,
                date,
                date_label,
                time_range_label,
                task_id,
                linked_target,
                created_at,
            }
        })
        .collect();

    let favs_rows = sqlx::query(
        r#"
        SELECT id, name, icon, mode, duration_minutes, accumulated_minutes, linked_target, is_archived, created_at
        FROM pomodoro_favorites
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&*pool)
    .await?;

    let favorite_tasks = favs_rows
        .into_iter()
        .map(|row| {
            let id: String = row.try_get("id").unwrap_or_default();
            let name: String = row.try_get("name").unwrap_or_default();
            let icon: String = row.try_get("icon").unwrap_or_else(|_| "😊".to_string());
            let mode: String = row.try_get("mode").unwrap_or_default();
            let duration_minutes: i64 = row.try_get("duration_minutes").unwrap_or(25);
            let accumulated_minutes: i64 = row.try_get("accumulated_minutes").unwrap_or(0);
            let linked_target_str: Option<String> = row.try_get("linked_target").ok().flatten();
            let linked_target = linked_target_str
                .and_then(|s| serde_json::from_str::<LinkedTarget>(&s).ok());
            let is_archived_val: i32 = row.try_get("is_archived").unwrap_or(0);
            let created_at: String = row.try_get("created_at").unwrap_or_default();

            FavoriteFocusTask {
                id,
                name,
                icon,
                mode,
                duration_minutes,
                accumulated_minutes,
                linked_target,
                is_archived: is_archived_val != 0,
                created_at,
            }
        })
        .collect();

    Ok(PomodoroData {
        records,
        favorite_tasks,
    })
}

#[tauri::command]
pub async fn pomodoro_upsert_record(
    record: PomodoroRecord,
    pool: State<'_, SqlitePool>,
) -> AppResult<()> {
    let linked_target_json = record
        .linked_target
        .as_ref()
        .and_then(|t| serde_json::to_string(t).ok());

    sqlx::query(
        r#"
        INSERT INTO pomodoro_records (
            id, mode, phase, start_time, end_time, duration_minutes, date, date_label, time_range_label, task_id, linked_target, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            mode = excluded.mode,
            phase = excluded.phase,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            duration_minutes = excluded.duration_minutes,
            date = excluded.date,
            date_label = excluded.date_label,
            time_range_label = excluded.time_range_label,
            task_id = excluded.task_id,
            linked_target = excluded.linked_target
        "#,
    )
    .bind(&record.id)
    .bind(&record.mode)
    .bind(&record.phase)
    .bind(&record.start_time)
    .bind(&record.end_time)
    .bind(record.duration_minutes)
    .bind(&record.date)
    .bind(&record.date_label)
    .bind(&record.time_range_label)
    .bind(&record.task_id)
    .bind(&linked_target_json)
    .bind(&record.created_at)
    .execute(&*pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn pomodoro_delete_record(
    id: String,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>,
) -> AppResult<()> {
    sqlx::query("DELETE FROM pomodoro_records WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await?;

    queue_and_sync_delete(&pool, &tidb_state, "pomodoro_records", &id).await;

    Ok(())
}

#[tauri::command]
pub async fn pomodoro_clear_all_records(
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>,
) -> AppResult<()> {
    sqlx::query("DELETE FROM pomodoro_records")
        .execute(&*pool)
        .await?;

    let _ = sqlx::query("DELETE FROM sync_queue WHERE table_name = 'pomodoro_records'")
        .execute(&*pool)
        .await;

    if let Some(ref mysql) = *tidb_state.inner().0.read().await {
        let _ = sqlx::query("DELETE FROM pomodoro_records").execute(mysql).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn pomodoro_upsert_favorite(
    task: FavoriteFocusTask,
    pool: State<'_, SqlitePool>,
) -> AppResult<()> {
    let linked_target_json = task
        .linked_target
        .as_ref()
        .and_then(|t| serde_json::to_string(t).ok());
    let is_archived_val = if task.is_archived { 1i32 } else { 0i32 };

    sqlx::query(
        r#"
        INSERT INTO pomodoro_favorites (
            id, name, icon, mode, duration_minutes, accumulated_minutes, linked_target, is_archived, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            icon = excluded.icon,
            mode = excluded.mode,
            duration_minutes = excluded.duration_minutes,
            accumulated_minutes = excluded.accumulated_minutes,
            linked_target = excluded.linked_target,
            is_archived = excluded.is_archived
        "#,
    )
    .bind(&task.id)
    .bind(&task.name)
    .bind(&task.icon)
    .bind(&task.mode)
    .bind(task.duration_minutes)
    .bind(task.accumulated_minutes)
    .bind(&linked_target_json)
    .bind(is_archived_val)
    .bind(&task.created_at)
    .execute(&*pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn pomodoro_delete_favorite(
    id: String,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>,
) -> AppResult<()> {
    sqlx::query("DELETE FROM pomodoro_favorites WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await?;

    queue_and_sync_delete(&pool, &tidb_state, "pomodoro_favorites", &id).await;

    Ok(())
}
