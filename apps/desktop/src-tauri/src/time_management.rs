use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::repo::{query_all, with_txn, FromRow, RowExt};
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

impl FromRow for Role {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(Role {
            id: row.parse_str(0),
            name: row.parse_str(1),
            color: None,
            created_at: row.parse_i64(2),
        })
    }
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

impl FromRow for Task {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(Task {
            id: row.parse_str(0),
            title: row.parse_str(1),
            role_id: row.parse_opt_str(2),
            quadrant: row.parse_str(3),
            scheduled_date: row.parse_opt_str(4),
            time_of_day: row.parse_opt_str(5),
            completed: row.parse_bool(6),
            created_at: row.parse_i64(7),
            completed_at: row.parse_opt_i64(8),
            description: row.parse_opt_str(9),
            deadline: row.parse_opt_i64(10),
            reminder: row.parse_opt_str(11),
        })
    }
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
    // mission_roles.created_at 已由 schema 迁移为 UNIX 毫秒整数，直读即可
    let roles: Vec<Role> = query_all(
        &conn,
        "SELECT id, name, created_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    let tasks: Vec<Task> = query_all(
        &conn,
        "SELECT id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder FROM time_management_tasks WHERE deleted_at IS NULL",
        (),
    ).await?;

    Ok(TimeManagementData { roles, tasks })
}

#[tauri::command]
pub async fn tm_upsert_task(task: Task, db: State<'_, TursoDb>) -> AppResult<()> {
    let completed_val: i32 = if task.completed { 1 } else { 0 };
    let now = now_iso();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute(
            "INSERT INTO time_management_tasks (id, title, role_id, quadrant, scheduled_date, time_of_day, completed, created_at, completed_at, description, deadline, reminder, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(id) DO UPDATE SET title = excluded.title, role_id = excluded.role_id, quadrant = excluded.quadrant, scheduled_date = excluded.scheduled_date, time_of_day = excluded.time_of_day, completed = excluded.completed, created_at = excluded.created_at, completed_at = excluded.completed_at, description = excluded.description, deadline = excluded.deadline, reminder = excluded.reminder, updated_at = excluded.updated_at",
            libsql::params![task.id.clone(), task.title, task.role_id, task.quadrant, task.scheduled_date, task.time_of_day, completed_val, task.created_at, task.completed_at, task.description, task.deadline, task.reminder, now.clone()],
        ).await?;

        if task.completed {
            tx.execute(
                "DELETE FROM task_reminder_fired WHERE key LIKE ?1",
                libsql::params![format!("{}@%", task.id)],
            ).await?;
        }
        Ok(())
    })).await?;

    Ok(())
}

#[tauri::command]
pub async fn tm_delete_task(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute(
            "UPDATE time_management_tasks SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![now.clone(), now, id.clone()],
        ).await?;

        tx.execute(
            "DELETE FROM task_reminder_fired WHERE key LIKE ?1",
            libsql::params![format!("{}@%", id)],
        ).await?;
        Ok(())
    })).await?;

    Ok(())
}
