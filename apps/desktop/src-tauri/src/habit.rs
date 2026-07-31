use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::AppResult;
use crate::sync::now_iso;
use crate::db::TursoDb;

#[derive(Debug, Serialize, Deserialize)]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub frequency: Option<String>,
    pub goal: Option<String>,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    pub duration: Option<String>,
    pub group: Option<String>,
    pub reminder: Option<String>,
    #[serde(rename = "checkInTime")]
    pub check_in_time: Option<String>,
    #[serde(rename = "autoPopupLog")]
    pub auto_popup_log: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitPayload {
    pub name: Option<String>,
    pub frequency: Option<String>,
    pub goal: Option<String>,
    pub start_date: Option<String>,
    pub duration: Option<String>,
    pub group: Option<String>,
    pub reminder: Option<String>,
    pub check_in_time: Option<String>,
    pub auto_popup_log: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HabitCheckIn {
    pub id: String,
    #[serde(rename = "habitId")]
    pub habit_id: String,
    pub date: String,
    pub completed: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HabitData {
    pub habits: Vec<Habit>,
    #[serde(rename = "checkIns")]
    pub check_ins: Vec<HabitCheckIn>,
}

#[tauri::command]
pub async fn habit_load_all(db: State<'_, TursoDb>) -> AppResult<HabitData> {
    let conn = db.conn()?;

    let mut habits_rows = conn.query(
        "SELECT id, name, frequency, goal, start_date, duration, category, reminder, auto_popup_log, created_at, updated_at FROM habits WHERE deleted_at IS NULL ORDER BY created_at ASC",
        (),
    ).await?;

    let mut habits = Vec::new();
    while let Ok(Some(row)) = habits_rows.next().await {
        let auto_popup_log_i32: i32 = row.get(8).unwrap_or(0);
        let reminder: Option<String> = row.get(7).ok();
        habits.push(Habit {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            frequency: row.get(2).ok(),
            goal: row.get(3).ok(),
            start_date: row.get(4).ok(),
            duration: row.get(5).ok(),
            group: row.get(6).ok(),
            check_in_time: reminder.clone(),
            reminder,
            auto_popup_log: auto_popup_log_i32 != 0,
            created_at: row.get(9).unwrap_or_default(),
            updated_at: row.get(10).unwrap_or_default(),
        });
    }

    let conn2 = db.conn()?;
    let mut checkins_rows = conn2.query(
        "SELECT id, habit_id, date, completed, created_at, updated_at FROM habit_checkins WHERE deleted_at IS NULL",
        (),
    ).await?;

    let mut check_ins = Vec::new();
    while let Ok(Some(row)) = checkins_rows.next().await {
        let completed: i32 = row.get(3).unwrap_or(0);
        check_ins.push(HabitCheckIn {
            id: row.get(0).unwrap_or_default(),
            habit_id: row.get(1).unwrap_or_default(),
            date: row.get(2).unwrap_or_default(),
            completed: completed != 0,
            created_at: row.get(4).unwrap_or_default(),
            updated_at: row.get(5).unwrap_or_default(),
        });
    }

    Ok(HabitData { habits, check_ins })
}

#[tauri::command]
pub async fn habit_create(payload: HabitPayload, db: State<'_, TursoDb>) -> AppResult<Habit> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let auto_popup_log_val = if payload.auto_popup_log.unwrap_or(false) { 1i32 } else { 0i32 };
    let name_val = payload.name.unwrap_or_default();
    let reminder_val = payload.check_in_time.or(payload.reminder);
    let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
    let start_date_val = payload.start_date.filter(|s| !s.trim().is_empty()).unwrap_or(today_local);

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO habits (id, name, frequency, goal, start_date, duration, category, reminder, auto_popup_log, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        libsql::params![id.clone(), name_val.clone(), payload.frequency.clone(), payload.goal.clone(), start_date_val.clone(), payload.duration.clone(), payload.group.clone(), reminder_val.clone(), auto_popup_log_val, now.clone(), now.clone()],
    ).await?;

    db.push_sync();
    Ok(Habit {
        id,
        name: name_val,
        frequency: payload.frequency,
        goal: payload.goal,
        start_date: Some(start_date_val),
        duration: payload.duration,
        group: payload.group,
        reminder: reminder_val.clone(),
        check_in_time: reminder_val,
        auto_popup_log: auto_popup_log_val != 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn habit_update(id: String, payload: HabitPayload, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let auto_popup_log_val = if payload.auto_popup_log.unwrap_or(false) { 1i32 } else { 0i32 };
    let reminder_val = payload.check_in_time.or(payload.reminder);

    let conn = db.conn()?;
    conn.execute(
        "UPDATE habits SET name = COALESCE(?1, name), frequency = ?2, goal = ?3, start_date = ?4, duration = ?5, category = ?6, reminder = COALESCE(?7, reminder), auto_popup_log = ?8, updated_at = ?9 WHERE id = ?10",
        libsql::params![payload.name, payload.frequency, payload.goal, payload.start_date, payload.duration, payload.group, reminder_val, auto_popup_log_val, now, id],
    ).await?;

    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn habit_delete(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE habit_checkins SET deleted_at = ?1, updated_at = ?2 WHERE habit_id = ?3",
        libsql::params![now.clone(), now.clone(), id.clone()],
    ).await?;
    conn.execute(
        "UPDATE habits SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id],
    ).await?;

    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn habit_toggle_checkin(
    habit_id: String,
    date: String,
    completed: bool,
    db: State<'_, TursoDb>,
) -> AppResult<HabitCheckIn> {
    let now = now_iso();
    let completed_val = if completed { 1i32 } else { 0i32 };
    let checkin_id = Uuid::new_v4().to_string();

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO habit_checkins (id, habit_id, date, completed, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(habit_id, date) DO UPDATE SET completed = excluded.completed, updated_at = excluded.updated_at, deleted_at = NULL",
        libsql::params![checkin_id, habit_id.clone(), date.clone(), completed_val, now.clone(), now.clone()],
    ).await?;

    let mut row_q = conn.query(
        "SELECT id, habit_id, date, completed, created_at, updated_at FROM habit_checkins WHERE deleted_at IS NULL AND habit_id = ?1 AND date = ?2",
        libsql::params![habit_id.clone(), date.clone()],
    ).await?;

    db.push_sync();

    if let Ok(Some(row)) = row_q.next().await {
        let final_completed: i32 = row.get(3).unwrap_or(0);
        return Ok(HabitCheckIn {
            id: row.get(0).unwrap_or_default(),
            habit_id,
            date,
            completed: final_completed != 0,
            created_at: row.get(4).unwrap_or_default(),
            updated_at: row.get(5).unwrap_or_default(),
        });
    }

    Err(crate::error::AppError("habit_toggle_checkin: row not found after upsert".into()))
}
