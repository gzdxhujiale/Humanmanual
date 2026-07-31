use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppResult;
use crate::repo::{query_all, with_txn, FromRow};
use crate::sync::now_ms;
use crate::db::TursoDb;

// ── DTOs ──
// 时间戳统一为 UNIX 毫秒（i64），存储层同格式，前端负责展示格式化。

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MissionStatement {
    pub id: String,
    pub content: String,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

impl FromRow for Role {
    fn from_row(r: &libsql::Row) -> AppResult<Self> {
        Ok(Role {
            id: r.get(0)?,
            name: r.get(1).unwrap_or_default(),
            icon: r.get(2).unwrap_or_default(),
            sort_order: r.get(3).unwrap_or(0),
            created_at: r.get(4).unwrap_or(0),
            updated_at: r.get(5).unwrap_or(0),
        })
    }
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
    pub created_at: i64,
    pub updated_at: i64,
}

impl FromRow for Goal {
    fn from_row(r: &libsql::Row) -> AppResult<Self> {
        Ok(Goal {
            id: r.get(0)?,
            role_id: r.get(1).unwrap_or_default(),
            title: r.get(2).unwrap_or_default(),
            status: r.get(3).unwrap_or_default(),
            time_scope: r.get(4).unwrap_or_default(),
            start_date: r.get(5).ok(),
            end_date: r.get(6).ok(),
            sort_order: r.get(7).unwrap_or(0),
            created_at: r.get(8).unwrap_or(0),
            updated_at: r.get(9).unwrap_or(0),
        })
    }
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
    let statement = if let Some(r) = stmt_rows.next().await? {
        Some(MissionStatement {
            id: r.get(0)?,
            content: r.get(1).unwrap_or_default(),
            updated_at: r.get(2).unwrap_or(0),
        })
    } else {
        None
    };
    drop(stmt_rows);

    let roles: Vec<Role> = query_all(
        &conn,
        "SELECT id, name, icon, sort_order, created_at, updated_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    let goals: Vec<Goal> = query_all(
        &conn,
        "SELECT id, role_id, title, status, time_scope, start_date, end_date, sort_order, created_at, updated_at FROM mission_goals WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    Ok(MissionAllData { statement, roles, goals })
}

// ── Mission Statement ──

#[tauri::command]
pub async fn mission_save_statement(content: String, db: State<'_, TursoDb>) -> AppResult<MissionStatement> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_statement (id, content, updated_at) VALUES ('default', ?1, ?2) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        libsql::params![content.clone(), now],
    ).await?;
    Ok(MissionStatement { id: "default".into(), content, updated_at: now })
}

// ── Role CRUD ──

#[tauri::command]
pub async fn mission_create_role(name: String, icon: String, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<Role> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_roles (id, name, icon, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        libsql::params![id.clone(), name.clone(), icon.clone(), sort_order, now, now],
    ).await?;
    Ok(Role { id, name, icon, sort_order, created_at: now, updated_at: now })
}

#[tauri::command]
pub async fn mission_update_role(id: String, name: String, icon: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE mission_roles SET name = ?1, icon = ?2, updated_at = ?3 WHERE id = ?4",
        libsql::params![name, icon, now, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_role(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    // 级联软删目标 + 解绑任务 + 软删角色，事务保证三步原子生效
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute("UPDATE mission_goals SET deleted_at = ?1, updated_at = ?2 WHERE role_id = ?3",
            libsql::params![now, now, id.clone()]).await?;
        tx.execute("UPDATE time_management_tasks SET role_id = NULL WHERE role_id = ?1",
            libsql::params![id.clone()]).await?;
        tx.execute("UPDATE mission_roles SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![now, now, id]).await?;
        Ok(())
    })).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_roles(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        for (id, order) in &items {
            tx.execute(
                "UPDATE mission_roles SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![*order, now, id.clone()],
            ).await?;
        }
        Ok(())
    })).await?;
    Ok(())
}

// ── Goal CRUD ──

#[tauri::command]
pub async fn mission_create_goal(role_id: String, title: String, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<Goal> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO mission_goals (id, role_id, title, status, time_scope, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'not_started', 'long', ?4, ?5, ?6)",
        libsql::params![id.clone(), role_id.clone(), title.clone(), sort_order, now, now],
    ).await?;
    Ok(Goal {
        id, role_id, title,
        status: "not_started".into(),
        time_scope: "long".into(),
        start_date: None, end_date: None,
        sort_order,
        created_at: now, updated_at: now,
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
    let now = now_ms();
    // 统一部分更新语义：所有字段 None = 不修改；日期字段传空字符串 = 清空为 NULL
    let sql_fixed = "UPDATE mission_goals SET \
        title = COALESCE(?1, title), \
        status = COALESCE(?2, status), \
        time_scope = COALESCE(?3, time_scope), \
        start_date = CASE WHEN ?4 IS NULL THEN start_date WHEN ?4 = '' THEN NULL ELSE ?4 END, \
        end_date = CASE WHEN ?5 IS NULL THEN end_date WHEN ?5 = '' THEN NULL ELSE ?5 END, \
        updated_at = ?6 WHERE id = ?7";
    let conn = db.conn()?;
    conn.execute(
        sql_fixed,
        libsql::params![title, status, time_scope, start_date, end_date, now, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_goal(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute(
        "UPDATE mission_goals SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now, now, id],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_goals(role_id: String, items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        for (id, order) in &items {
            tx.execute(
                "UPDATE mission_goals SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND role_id = ?4",
                libsql::params![*order, now, id.clone(), role_id.clone()],
            ).await?;
        }
        Ok(())
    })).await?;
    Ok(())
}
