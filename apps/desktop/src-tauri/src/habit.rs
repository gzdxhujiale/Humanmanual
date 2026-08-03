use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repo::{with_txn, RowExt};
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

    // 单次 LEFT JOIN 往返同时取回习惯与打卡，避免两次远程查询；
    // 习惯字段在多条打卡行上重复，按 id 去重收集。
    let mut rows = conn.query(
        "SELECT h.id, h.name, h.frequency, h.goal, h.start_date, h.duration, h.category, h.reminder, h.auto_popup_log, h.created_at, h.updated_at, \
                c.id, c.date, c.completed, c.created_at, c.updated_at \
         FROM habits h \
         LEFT JOIN habit_checkins c ON c.habit_id = h.id AND c.deleted_at IS NULL \
         WHERE h.deleted_at IS NULL \
         ORDER BY h.created_at ASC",
        (),
    ).await?;

    let mut habits = Vec::new();
    let mut check_ins = Vec::new();
    let mut seen = std::collections::HashSet::new();
    while let Some(row) = rows.next().await? {
        let habit_id = row.parse_str(0);
        if habit_id.is_empty() {
            continue;
        }
        if seen.insert(habit_id.clone()) {
            let reminder = row.parse_opt_str(7);
            habits.push(Habit {
                id: habit_id.clone(),
                name: row.parse_str(1),
                frequency: row.parse_opt_str(2),
                goal: row.parse_opt_str(3),
                start_date: row.parse_opt_str(4),
                duration: row.parse_opt_str(5),
                group: row.parse_opt_str(6),
                check_in_time: reminder.clone(),
                reminder,
                auto_popup_log: row.parse_bool(8),
                created_at: row.parse_str(9),
                updated_at: row.parse_str(10),
            });
        }
        // LEFT JOIN 无打卡时 c.* 为 NULL，跳过
        if let Some(checkin_id) = row.parse_opt_str(11) {
            check_ins.push(HabitCheckIn {
                id: checkin_id,
                habit_id,
                date: row.parse_str(12),
                completed: row.parse_bool(13),
                created_at: row.parse_str(14),
                updated_at: row.parse_str(15),
            });
        }
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

    Ok(())
}

#[tauri::command]
pub async fn habit_delete(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute(
            "UPDATE habit_checkins SET deleted_at = ?1, updated_at = ?2 WHERE habit_id = ?3",
            libsql::params![now.clone(), now.clone(), id.clone()],
        ).await?;
        tx.execute(
            "UPDATE habits SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![now.clone(), now, id],
        ).await?;
        Ok(())
    })).await?;

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
    // 单条 upsert + RETURNING：直连云端下省一次写后读往返，且返回值必来自本次写入的行
    let mut rows = conn.query(
        "INSERT INTO habit_checkins (id, habit_id, date, completed, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(habit_id, date) DO UPDATE SET completed = excluded.completed, updated_at = excluded.updated_at, deleted_at = NULL \
         RETURNING id, completed, created_at, updated_at",
        libsql::params![checkin_id, habit_id.clone(), date.clone(), completed_val, now.clone(), now.clone()],
    ).await?;

    if let Some(row) = rows.next().await? {
        return Ok(HabitCheckIn {
            id: row.parse_str(0),
            habit_id,
            date,
            completed: row.parse_bool(1),
            created_at: row.parse_str(2),
            updated_at: row.parse_str(3),
        });
    }

    Err(crate::error::AppError::NotFound("habit_toggle_checkin: upsert returned no row".into()))
}
