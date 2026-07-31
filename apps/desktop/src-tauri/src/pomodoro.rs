use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;
use crate::db::TursoDb;

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
pub async fn pomodoro_load_all(db: State<'_, TursoDb>) -> AppResult<PomodoroData> {
    let conn = db.conn()?;
    let mut records_rows = conn.query(
        "SELECT id, mode, phase, start_time, end_time, duration_minutes, date, date_label, time_range_label, task_id, linked_target, created_at FROM pomodoro_records WHERE deleted_at IS NULL ORDER BY start_time DESC",
        (),
    ).await?;

    let mut records = Vec::new();
    while let Ok(Some(row)) = records_rows.next().await {
        let linked_target_str: Option<String> = row.get::<String>(10).ok();
        let linked_target = linked_target_str.and_then(|s| serde_json::from_str::<LinkedTarget>(s.as_str()).ok());
        records.push(PomodoroRecord {
            id: row.get::<String>(0).unwrap_or_default(),
            mode: row.get::<String>(1).unwrap_or_default(),
            phase: row.get::<String>(2).unwrap_or_default(),
            start_time: row.get::<String>(3).unwrap_or_default(),
            end_time: row.get::<String>(4).unwrap_or_default(),
            duration_minutes: row.get(5).unwrap_or(0),
            date: row.get::<String>(6).unwrap_or_default(),
            date_label: row.get::<String>(7).unwrap_or_default(),
            time_range_label: row.get::<String>(8).unwrap_or_default(),
            task_id: row.get::<String>(9).ok(),
            linked_target,
            created_at: row.get::<String>(11).unwrap_or_default(),
        });
    }
    drop(records_rows);

    let mut favs_rows = conn.query(
        "SELECT id, name, icon, mode, duration_minutes, accumulated_minutes, linked_target, is_archived, created_at FROM pomodoro_favorites WHERE deleted_at IS NULL ORDER BY created_at DESC",
        (),
    ).await?;

    let mut favorite_tasks = Vec::new();
    while let Ok(Some(row)) = favs_rows.next().await {
        let linked_target_str: Option<String> = row.get::<String>(6).ok();
        let linked_target = linked_target_str.and_then(|s| serde_json::from_str::<LinkedTarget>(s.as_str()).ok());
        let is_archived_val: i32 = row.get(7).unwrap_or(0);
        favorite_tasks.push(FavoriteFocusTask {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            icon: row.get(2).unwrap_or_else(|_| "😊".to_string()),
            mode: row.get(3).unwrap_or_default(),
            duration_minutes: row.get(4).unwrap_or(25),
            accumulated_minutes: row.get(5).unwrap_or(0),
            linked_target,
            is_archived: is_archived_val != 0,
            created_at: row.get(8).unwrap_or_default(),
        });
    }

    Ok(PomodoroData { records, favorite_tasks })
}

#[tauri::command]
pub async fn pomodoro_upsert_record(record: PomodoroRecord, db: State<'_, TursoDb>) -> AppResult<()> {
    let linked_target_json = record.linked_target.as_ref().and_then(|t| serde_json::to_string(t).ok());
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO pomodoro_records (id, mode, phase, start_time, end_time, duration_minutes, date, date_label, time_range_label, task_id, linked_target, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, phase = excluded.phase, start_time = excluded.start_time, end_time = excluded.end_time, duration_minutes = excluded.duration_minutes, date = excluded.date, date_label = excluded.date_label, time_range_label = excluded.time_range_label, task_id = excluded.task_id, linked_target = excluded.linked_target, updated_at = excluded.updated_at",
        libsql::params![record.id, record.mode, record.phase, record.start_time, record.end_time, record.duration_minutes, record.date, record.date_label, record.time_range_label, record.task_id, linked_target_json, record.created_at, now],
    ).await?;
    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn pomodoro_delete_record(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE pomodoro_records SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id],
    ).await?;
    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn pomodoro_clear_all_records(db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE pomodoro_records SET deleted_at = ?1, updated_at = ?2 WHERE deleted_at IS NULL",
        libsql::params![now.clone(), now],
    ).await?;
    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn pomodoro_upsert_favorite(task: FavoriteFocusTask, db: State<'_, TursoDb>) -> AppResult<()> {
    let linked_target_json = task.linked_target.as_ref().and_then(|t| serde_json::to_string(t).ok());
    let is_archived_val = if task.is_archived { 1i32 } else { 0i32 };
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO pomodoro_favorites (id, name, icon, mode, duration_minutes, accumulated_minutes, linked_target, is_archived, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, mode = excluded.mode, duration_minutes = excluded.duration_minutes, accumulated_minutes = excluded.accumulated_minutes, linked_target = excluded.linked_target, is_archived = excluded.is_archived, updated_at = excluded.updated_at",
        libsql::params![task.id, task.name, task.icon, task.mode, task.duration_minutes, task.accumulated_minutes, linked_target_json, is_archived_val, task.created_at, now],
    ).await?;
    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn pomodoro_delete_favorite(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE pomodoro_favorites SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id],
    ).await?;
    db.push_sync();
    Ok(())
}
