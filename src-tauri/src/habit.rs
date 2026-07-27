use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use tauri::State;
use uuid::Uuid;

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

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
pub async fn habit_load_all(pool: State<'_, SqlitePool>) -> Result<HabitData, String> {
    let habits_rows = sqlx::query(
        r#"
        SELECT id, name, frequency, goal, start_date, duration, category, reminder, auto_popup_log, created_at, updated_at
        FROM habits
        ORDER BY created_at DESC
        "#
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let habits = habits_rows
        .into_iter()
        .map(|row| {
            let id: String = row.try_get("id").unwrap_or_default();
            let name: String = row.try_get("name").unwrap_or_default();
            let frequency: Option<String> = row.try_get("frequency").ok().flatten();
            let goal: Option<String> = row.try_get("goal").ok().flatten();
            let start_date: Option<String> = row.try_get("start_date").ok().flatten();
            let duration: Option<String> = row.try_get("duration").ok().flatten();
            let group: Option<String> = row.try_get("category").ok().flatten();
            let reminder: Option<String> = row.try_get("reminder").ok().flatten();
            let auto_popup_log_i32: i32 = row.try_get("auto_popup_log").unwrap_or(0);
            let created_at: String = row.try_get("created_at").unwrap_or_default();
            let updated_at: String = row.try_get("updated_at").unwrap_or_default();
            let check_in_time = reminder.clone();
            Habit {
                id,
                name,
                frequency,
                goal,
                start_date,
                duration,
                group,
                reminder: reminder.clone(),
                check_in_time,
                auto_popup_log: auto_popup_log_i32 != 0,
                created_at,
                updated_at,
            }
        })
        .collect();

    let checkins_rows = sqlx::query(
        r#"
        SELECT id, habit_id, date, completed, created_at, updated_at
        FROM habit_checkins
        "#
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let check_ins = checkins_rows
        .into_iter()
        .map(|row| {
            let id: String = row.try_get("id").unwrap_or_default();
            let habit_id: String = row.try_get("habit_id").unwrap_or_default();
            let date: String = row.try_get("date").unwrap_or_default();
            let completed: i32 = row.try_get("completed").unwrap_or_default();
            let created_at: String = row.try_get("created_at").unwrap_or_default();
            let updated_at: String = row.try_get("updated_at").unwrap_or_default();

            HabitCheckIn {
                id,
                habit_id,
                date,
                completed: completed != 0,
                created_at,
                updated_at,
            }
        })
        .collect();

    Ok(HabitData { habits, check_ins })
}

#[tauri::command]
pub async fn habit_create(payload: HabitPayload, pool: State<'_, SqlitePool>) -> Result<Habit, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let auto_popup_log_val = if payload.auto_popup_log.unwrap_or(false) { 1i32 } else { 0i32 };
    let name_val = payload.name.unwrap_or_default();
    let reminder_val = payload.check_in_time.clone().or(payload.reminder.clone());
    let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
    let start_date_val = payload.start_date.filter(|s| !s.trim().is_empty()).unwrap_or(today_local);

    sqlx::query(
        r#"
        INSERT INTO habits (id, name, frequency, goal, start_date, duration, category, reminder, auto_popup_log, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&id)
    .bind(&name_val)
    .bind(&payload.frequency)
    .bind(&payload.goal)
    .bind(&start_date_val)
    .bind(&payload.duration)
    .bind(&payload.group)
    .bind(&reminder_val)
    .bind(auto_popup_log_val)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

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
pub async fn habit_update(id: String, payload: HabitPayload, pool: State<'_, SqlitePool>) -> Result<(), String> {
    let now = now_iso();
    let auto_popup_log_val = if payload.auto_popup_log.unwrap_or(false) { 1i32 } else { 0i32 };
    let reminder_val = payload.check_in_time.or(payload.reminder);

    sqlx::query(
        r#"
        UPDATE habits SET 
            name = COALESCE(?, name), 
            frequency = ?, 
            goal = ?, 
            start_date = ?, 
            duration = ?, 
            category = ?, 
            reminder = COALESCE(?, reminder), 
            auto_popup_log = ?, 
            updated_at = ? 
        WHERE id = ?
        "#
    )
    .bind(&payload.name)
    .bind(&payload.frequency)
    .bind(&payload.goal)
    .bind(&payload.start_date)
    .bind(&payload.duration)
    .bind(&payload.group)
    .bind(&reminder_val)
    .bind(auto_popup_log_val)
    .bind(&now)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

use crate::db::TidbState;

#[tauri::command]
pub async fn habit_delete(
    id: String,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>
) -> Result<(), String> {
    sqlx::query("DELETE FROM habit_checkins WHERE habit_id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM habits WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = sqlx::query("INSERT OR REPLACE INTO sync_queue (table_name, record_id, action) VALUES ('habits', ?, 'DELETE')")
        .bind(&id)
        .execute(&*pool)
        .await;

    let pool_clone = pool.inner().clone();
    let tidb_state_clone = tidb_state.inner().clone();
    let id_clone = id.clone();

    tauri::async_runtime::spawn(async move {
        let guard = tidb_state_clone.0.read().await;
        if let Some(ref mysql) = *guard {
            let _ = sqlx::query("DELETE FROM habit_checkins WHERE habit_id = ?").bind(&id_clone).execute(mysql).await;
            if let Ok(_) = sqlx::query("DELETE FROM habits WHERE id = ?").bind(&id_clone).execute(mysql).await {
                let _ = sqlx::query("DELETE FROM sync_queue WHERE table_name = 'habits' AND record_id = ? AND action = 'DELETE'").bind(&id_clone).execute(&pool_clone).await;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn habit_toggle_checkin(
    habit_id: String,
    date: String,
    completed: bool,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>
) -> Result<HabitCheckIn, String> {
    let now = now_iso();
    let completed_val = if completed { 1i32 } else { 0i32 };

    let checkin_id = Uuid::new_v4().to_string();

    // 1. Atomic UPSERT into local SQLite
    let _ = sqlx::query(
        "INSERT INTO habit_checkins (id, habit_id, date, completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET completed = excluded.completed, updated_at = excluded.updated_at"
    )
    .bind(&checkin_id)
    .bind(&habit_id)
    .bind(&date)
    .bind(completed_val)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. Fetch updated row
    let row = sqlx::query("SELECT id, habit_id, date, completed, created_at, updated_at FROM habit_checkins WHERE habit_id = ? AND date = ?")
        .bind(&habit_id)
        .bind(&date)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let final_id: String = row.try_get("id").unwrap_or_default();
    let final_completed: i32 = row.try_get("completed").unwrap_or(0);
    let created_at: String = row.try_get("created_at").unwrap_or_default();
    let updated_at: String = row.try_get("updated_at").unwrap_or_default();

    // 3. Sync to TiDB asynchronously in background
    let tidb_state_clone = tidb_state.inner().clone();
    let final_id_clone = final_id.clone();
    let habit_id_clone = habit_id.clone();
    let date_clone = date.clone();
    let created_at_clone = created_at.clone();
    let updated_at_clone = updated_at.clone();

    tauri::async_runtime::spawn(async move {
        let guard = tidb_state_clone.0.read().await;
        if let Some(ref mysql) = *guard {
            let _ = sqlx::query(
                "INSERT INTO habit_checkins (id, habit_id, date, completed, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE completed = VALUES(completed), updated_at = VALUES(updated_at)"
            )
            .bind(&final_id_clone)
            .bind(&habit_id_clone)
            .bind(&date_clone)
            .bind(final_completed as i8)
            .bind(&created_at_clone)
            .bind(&updated_at_clone)
            .execute(mysql)
            .await;
        }
    });

    Ok(HabitCheckIn {
        id: final_id,
        habit_id,
        date,
        completed: final_completed != 0,
        created_at,
        updated_at,
    })
}
