use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;
use crate::turso_state::TursoDb;

// ── DTOs ──

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MissionStatement {
    pub id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub role_id: String,
    pub title: String,
    pub status: String,
    pub time_scope: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MissionAllData {
    pub statement: Option<MissionStatement>,
    pub roles: Vec<Role>,
    pub goals: Vec<Goal>,
}

// ── Load all ──

#[tauri::command]
pub async fn mission_load_all(db: State<'_, TursoDb>) -> AppResult<MissionAllData> {
    let conn = db.conn()?;

    let mut stmt_rows = conn.query(
        "SELECT id, content, updated_at FROM mission_statement WHERE id = 'default' LIMIT 1",
        (),
    ).await?;
    let statement = if let Ok(Some(r)) = stmt_rows.next().await {
        Some(MissionStatement {
            id: r.get(0).unwrap_or_default(),
            content: r.get(1).unwrap_or_default(),
            updated_at: r.get(2).unwrap_or_default(),
        })
    } else {
        None
    };

    let conn2 = db.conn()?;
    let mut role_rows = conn2.query(
        "SELECT id, name, icon, sort_order, created_at, updated_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;
    let mut roles = Vec::new();
    while let Ok(Some(r)) = role_rows.next().await {
        roles.push(Role {
            id: r.get(0).unwrap_or_default(),
            name: r.get(1).unwrap_or_default(),
            icon: r.get(2).unwrap_or_default(),
            sort_order: r.get(3).unwrap_or(0),
            created_at: r.get(4).unwrap_or_default(),
            updated_at: r.get(5).unwrap_or_default(),
        });
    }

    let conn3 = db.conn()?;
    let mut goal_rows = conn3.query(
        "SELECT id, role_id, title, status, time_scope, start_date, end_date, sort_order, created_at, updated_at FROM mission_goals WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;
    let mut goals = Vec::new();
    while let Ok(Some(r)) = goal_rows.next().await {
        goals.push(Goal {
            id: r.get(0).unwrap_or_default(),
            role_id: r.get(1).unwrap_or_default(),
            title: r.get(2).unwrap_or_default(),
            status: r.get(3).unwrap_or_default(),
            time_scope: r.get(4).unwrap_or_default(),
            start_date: r.get(5).ok(),
            end_date: r.get(6).ok(),
            sort_order: r.get(7).unwrap_or(0),
            created_at: r.get(8).unwrap_or_default(),
            updated_at: r.get(9).unwrap_or_default(),
        });
    }

    Ok(MissionAllData { statement, roles, goals })
}

// ── Mission Statement ──

#[tauri::command]
pub async fn mission_save_statement(content: String, db: State<'_, TursoDb>) -> AppResult<MissionStatement> {
    let now_str = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_statement (id, content, updated_at) VALUES ('default', ?1, ?2) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        libsql::params![content.clone(), now_str.clone()],
    ).await?;
    Ok(MissionStatement { id: "default".into(), content, updated_at: now_str })
}

// ── Role CRUD ──

#[tauri::command]
pub async fn mission_create_role(name: String, icon: String, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<Role> {
    let id = uuid::Uuid::new_v4().to_string();
    let now_str = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_roles (id, name, icon, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        libsql::params![id.clone(), name.clone(), icon.clone(), sort_order, now_str.clone(), now_str.clone()],
    ).await?;
    Ok(Role { id, name, icon, sort_order, created_at: now_str.clone(), updated_at: now_str })
}

#[tauri::command]
pub async fn mission_update_role(id: String, name: String, icon: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now_str = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE mission_roles SET name = ?1, icon = ?2, updated_at = ?3 WHERE id = ?4",
        libsql::params![name, icon, now_str, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_role(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE mission_goals SET deleted_at = ?1, updated_at = ?2 WHERE role_id = ?3",
        libsql::params![now.clone(), now.clone(), id.clone()]).await?;
    conn.execute("UPDATE time_management_tasks SET role_id = NULL WHERE role_id = ?1",
        libsql::params![id.clone()]).await?;
    conn.execute("UPDATE mission_roles SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_roles(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now_str = now_iso();
    let conn = db.conn()?;
    for (id, order) in &items {
        conn.execute(
            "UPDATE mission_roles SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![*order, now_str.clone(), id.clone()],
        ).await?;
    }
    Ok(())
}

// ── Goal CRUD ──

#[tauri::command]
pub async fn mission_create_goal(role_id: String, title: String, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<Goal> {
    let id = uuid::Uuid::new_v4().to_string();
    let now_str = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_goals (id, role_id, title, status, time_scope, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'not_started', 'long', ?4, ?5, ?6)",
        libsql::params![id.clone(), role_id.clone(), title.clone(), sort_order, now_str.clone(), now_str.clone()],
    ).await?;
    Ok(Goal {
        id, role_id, title,
        status: "not_started".into(),
        time_scope: "long".into(),
        start_date: None, end_date: None,
        sort_order,
        created_at: now_str.clone(), updated_at: now_str,
    })
}

#[tauri::command]
pub async fn mission_update_goal(
    id: String,
    title: Option<String>,
    status: Option<String>,
    time_scope: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    db: State<'_, TursoDb>,
) -> AppResult<()> {
    let now_str = now_iso();
    let mut sets = Vec::new();

    if title.is_some() { sets.push("title = ?"); }
    if status.is_some() { sets.push("status = ?"); }
    if time_scope.is_some() { sets.push("time_scope = ?"); }
    sets.push("start_date = ?");
    sets.push("end_date = ?");
    sets.push("updated_at = ?");

    let sql = format!("UPDATE mission_goals SET {} WHERE id = ?", sets.join(", "));
    let conn = db.conn()?;

    // Build params dynamically using execute with individual binds is not straightforward in libsql.
    // We use a fixed-param approach covering all optional fields:
    let sql_fixed = "UPDATE mission_goals SET title = COALESCE(?1, title), status = COALESCE(?2, status), time_scope = COALESCE(?3, time_scope), start_date = ?4, end_date = ?5, updated_at = ?6 WHERE id = ?7";
    let _ = sql; // suppress unused warning
    conn.execute(
        sql_fixed,
        libsql::params![title, status, time_scope, start_date, end_date, now_str, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_goal(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE mission_goals SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_goals(role_id: String, items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now_str = now_iso();
    let conn = db.conn()?;
    for (id, order) in &items {
        conn.execute(
            "UPDATE mission_goals SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND role_id = ?4",
            libsql::params![*order, now_str.clone(), id.clone(), role_id.clone()],
        ).await?;
    }
    Ok(())
}
