use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;
use crate::db::TursoDb;

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
pub async fn tm_load_all(db: State<'_, TursoDb>) -> AppResult<TimeManagementData> {
    let conn = db.conn()?;
    let mut roles_rows = conn.query(
        "SELECT id, name, CAST(strftime('%s', created_at) * 1000 AS INTEGER) AS created_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    let mut roles = Vec::new();
    while let Ok(Some(row)) = roles_rows.next().await {
        roles.push(Role {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            color: None,
            created_at: row.get(2).unwrap_or(0),
        });
    }
    drop(roles_rows);

    let mut tasks_rows = conn.query(
        "SELECT id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder FROM time_management_tasks WHERE deleted_at IS NULL",
        (),
    ).await?;

    let mut tasks = Vec::new();
    while let Ok(Some(row)) = tasks_rows.next().await {
        let completed: i32 = row.get(6).unwrap_or(0);
        tasks.push(Task {
            id: row.get(0).unwrap_or_default(),
            title: row.get(1).unwrap_or_default(),
            role_id: row.get(2).ok(),
            quadrant: row.get(3).unwrap_or_default(),
            scheduled_date: row.get(4).ok(),
            time_of_day: row.get(5).ok(),
            completed: completed != 0,
            created_at: row.get(7).unwrap_or(0),
            completed_at: row.get(8).ok(),
            description: row.get(9).ok(),
            deadline: row.get(10).ok(),
            reminder: row.get(11).ok(),
        });
    }

    Ok(TimeManagementData { roles, tasks })
}

#[tauri::command]
pub async fn tm_upsert_task(task: Task, db: State<'_, TursoDb>) -> AppResult<()> {
    let completed_val: i32 = if task.completed { 1 } else { 0 };
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO time_management_tasks (id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(id) DO UPDATE SET title = excluded.title, role_id = excluded.role_id, quadrant = excluded.quadrant, scheduled_date = excluded.scheduled_date, time_of_day = excluded.time_of_day, completed = excluded.completed, created_at = excluded.created_at, completed_at = excluded.completed_at, description = excluded.description, deadline = excluded.deadline, reminder = excluded.reminder, updated_at = excluded.updated_at",
        libsql::params![task.id.clone(), task.title, task.role_id, task.quadrant, task.scheduled_date, task.time_of_day, completed_val, task.created_at, task.completed_at, task.description, task.deadline, task.reminder, now.clone()],
    ).await?;

    if task.completed {
        let _ = conn.execute(
            "DELETE FROM task_reminder_fired WHERE key LIKE ?1",
            libsql::params![format!("{}@%", task.id)],
        ).await;
    }

    db.push_sync();
    Ok(())
}

#[tauri::command]
pub async fn tm_delete_task(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE time_management_tasks SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id.clone()],
    ).await?;

    let _ = conn.execute(
        "DELETE FROM task_reminder_fired WHERE key LIKE ?1",
        libsql::params![format!("{}@%", id)],
    ).await;

    db.push_sync();
    Ok(())
}
