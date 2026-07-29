use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub role_id: Option<String>,
    pub quadrant: String,
    pub scheduled_date: Option<String>,
    pub time_of_day: Option<String>,
    pub completed: bool,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub description: Option<String>,
    pub deadline: Option<i64>,
    #[serde(default)]
    pub reminder: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimeManagementData {
    pub roles: Vec<Role>,
    pub tasks: Vec<Task>,
}

#[tauri::command]
pub async fn tm_load_all(pool: State<'_, SqlitePool>) -> AppResult<TimeManagementData> {
    let roles_rows = sqlx::query(
        "SELECT id, name, CAST(strftime('%s', created_at) * 1000 AS INTEGER) AS created_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order"
    )
    .fetch_all(&*pool)
    .await?;

    let mut roles = Vec::new();
    for row in roles_rows {
        roles.push(Role {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            color: None,
            created_at: row.try_get("created_at").unwrap_or_default(),
        });
    }

    let tasks_rows = sqlx::query(
        "SELECT id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder FROM time_management_tasks WHERE deleted_at IS NULL"
    )
    .fetch_all(&*pool)
    .await?;

    let mut tasks = Vec::new();
    for row in tasks_rows {
        tasks.push(Task {
            id: row.try_get("id").unwrap_or_default(),
            title: row.try_get("title").unwrap_or_default(),
            role_id: row.try_get("role_id").unwrap_or_default(),
            quadrant: row.try_get("quadrant").unwrap_or_default(),
            scheduled_date: row.try_get("scheduled_date").unwrap_or_default(),
            time_of_day: row.try_get("time_of_day").unwrap_or_default(),
            completed: row.try_get::<i32, _>("completed").map(|v| v != 0).unwrap_or(false),
            created_at: row.try_get("created_at").unwrap_or_default(),
            completed_at: row.try_get("completed_at").unwrap_or_default(),
            description: row.try_get("description").unwrap_or_default(),
            deadline: row.try_get("deadline").unwrap_or_default(),
            reminder: row.try_get("reminder").unwrap_or_default(),
        });
    }

    Ok(TimeManagementData { roles, tasks })
}


#[tauri::command]
pub async fn tm_upsert_task(task: Task, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let completed_val: i32 = if task.completed { 1 } else { 0 };
    let now = now_iso();
    sqlx::query(
        "INSERT INTO time_management_tasks (id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
            title = excluded.title, 
            role_id = excluded.role_id, 
            quadrant = excluded.quadrant, 
            scheduled_date = excluded.scheduled_date, 
            time_of_day = excluded.time_of_day, 
            completed = excluded.completed, 
            created_at = excluded.created_at, 
            completed_at = excluded.completed_at, 
            description = excluded.description, 
            deadline = excluded.deadline, 
            reminder = excluded.reminder,
            updated_at = excluded.updated_at"
    )
    .bind(&task.id)
    .bind(&task.title)
    .bind(&task.role_id)
    .bind(&task.quadrant)
    .bind(&task.scheduled_date)
    .bind(&task.time_of_day)
    .bind(completed_val)
    .bind(task.created_at)
    .bind(task.completed_at)
    .bind(&task.description)
    .bind(task.deadline)
    .bind(&task.reminder)
    .bind(&now)
    .execute(&*pool)
    .await?;

    // If task is completed or reminder is updated, allow new reminder schedules to fire
    if task.completed {
        let _ = sqlx::query("DELETE FROM task_reminder_fired WHERE key LIKE ?")
            .bind(format!("{}@%", task.id))
            .execute(&*pool)
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn tm_delete_task(
    id: String,
    pool: State<'_, SqlitePool>,
) -> AppResult<()> {
    let now = now_iso();
    sqlx::query("UPDATE time_management_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(&id)
        .execute(&*pool)
        .await?;

    let _ = sqlx::query("DELETE FROM task_reminder_fired WHERE key LIKE ?")
        .bind(format!("{}@%", id))
        .execute(&*pool)
        .await;

    Ok(())
}
