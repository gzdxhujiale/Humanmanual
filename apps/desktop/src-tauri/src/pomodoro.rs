use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::repo::{query_all, FromRow, RowExt};
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

impl FromRow for PomodoroRecord {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        let linked_target = row.parse_opt_str(10).and_then(|s| serde_json::from_str::<LinkedTarget>(&s).ok());
        Ok(PomodoroRecord {
            id: row.parse_str(0),
            mode: row.parse_str(1),
            phase: row.parse_str(2),
            start_time: row.parse_str(3),
            end_time: row.parse_str(4),
            duration_minutes: row.parse_i64(5),
            date: row.parse_str(6),
            date_label: row.parse_str(7),
            time_range_label: row.parse_str(8),
            task_id: row.parse_opt_str(9),
            linked_target,
            created_at: row.parse_str(11),
        })
    }
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

impl FromRow for FavoriteFocusTask {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        let linked_target = row.parse_opt_str(6).and_then(|s| serde_json::from_str::<LinkedTarget>(&s).ok());
        let icon_val = row.parse_str(2);
        Ok(FavoriteFocusTask {
            id: row.parse_str(0),
            name: row.parse_str(1),
            icon: if icon_val.is_empty() { "😊".to_string() } else { icon_val },
            mode: row.parse_str(3),
            duration_minutes: match row.parse_i64(4) { 0 => 25, n => n },
            accumulated_minutes: row.parse_i64(5),
            linked_target,
            is_archived: row.parse_bool(7),
            created_at: row.parse_str(8),
        })
    }
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
    let records: Vec<PomodoroRecord> = query_all(
        &conn,
        "SELECT id, mode, phase, start_time, end_time, duration_minutes, date, date_label, time_range_label, task_id, linked_target, created_at FROM pomodoro_records WHERE deleted_at IS NULL ORDER BY start_time DESC",
        (),
    ).await?;

    let favorite_tasks: Vec<FavoriteFocusTask> = query_all(
        &conn,
        "SELECT id, name, icon, mode, duration_minutes, accumulated_minutes, linked_target, is_archived, created_at FROM pomodoro_favorites WHERE deleted_at IS NULL ORDER BY created_at DESC",
        (),
    ).await?;

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
    Ok(())
}
