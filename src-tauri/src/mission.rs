use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use tauri::State;

use crate::db::TidbState;
use crate::error::AppResult;
use crate::sync::now_iso;

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
pub async fn mission_load_all(pool: State<'_, SqlitePool>) -> AppResult<MissionAllData> {
    let stmt_row = sqlx::query(
        "SELECT id, content, updated_at FROM mission_statement WHERE id = 'default' LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await?;

    let statement = stmt_row.map(|r| MissionStatement {
        id: r.try_get("id").unwrap_or_default(),
        content: r.try_get("content").unwrap_or_default(),
        updated_at: r.try_get::<String, _>("updated_at").unwrap_or_default(),
    });

    let role_rows = sqlx::query(
        "SELECT id, name, icon, sort_order, created_at, updated_at FROM mission_roles WHERE deleted_at IS NULL ORDER BY sort_order"
    )
    .fetch_all(&*pool)
    .await?;

    let roles: Vec<Role> = role_rows
        .into_iter()
        .map(|r| Role {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            icon: r.try_get("icon").unwrap_or_default(),
            sort_order: r.try_get("sort_order").unwrap_or_default(),
            created_at: r.try_get::<String, _>("created_at").unwrap_or_default(),
            updated_at: r.try_get::<String, _>("updated_at").unwrap_or_default(),
        })
        .collect();

    let goal_rows = sqlx::query(
        "SELECT id, role_id, title, status, time_scope, start_date, end_date, sort_order, created_at, updated_at FROM mission_goals WHERE deleted_at IS NULL ORDER BY sort_order"
    )
    .fetch_all(&*pool)
    .await?;

    let goals: Vec<Goal> = goal_rows
        .into_iter()
        .map(|r| Goal {
            id: r.try_get("id").unwrap_or_default(),
            role_id: r.try_get("role_id").unwrap_or_default(),
            title: r.try_get("title").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            time_scope: r.try_get("time_scope").unwrap_or_default(),
            start_date: r.try_get::<String, _>("start_date").ok(),
            end_date: r.try_get::<String, _>("end_date").ok(),
            sort_order: r.try_get("sort_order").unwrap_or_default(),
            created_at: r.try_get::<String, _>("created_at").unwrap_or_default(),
            updated_at: r.try_get::<String, _>("updated_at").unwrap_or_default(),
        })
        .collect();

    Ok(MissionAllData { statement, roles, goals })
}

// ── Mission Statement ──

#[tauri::command]
pub async fn mission_save_statement(content: String, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<MissionStatement> {
    let now_str = now_iso();
    sqlx::query(
        "INSERT INTO mission_statement (id, content, updated_at) VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at"
    )
    .bind(&content)
    .bind(&now_str)
    .execute(&*pool)
    .await?;

    crate::sync::record_outbox_event(pool.inner(), "mission_statement", "default", "upsert").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(MissionStatement { id: "default".into(), content, updated_at: now_str })
}

// ── Role CRUD ──

#[tauri::command]
pub async fn mission_create_role(name: String, icon: String, sort_order: i32, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<Role> {
    let id = uuid::Uuid::new_v4().to_string();
    let now_str = now_iso();
    sqlx::query(
        "INSERT INTO mission_roles (id, name, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&name).bind(&icon).bind(sort_order).bind(&now_str).bind(&now_str)
    .execute(&*pool)
    .await?;

    crate::sync::record_outbox_event(pool.inner(), "mission_roles", &id, "upsert").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(Role { id, name, icon, sort_order, created_at: now_str.clone(), updated_at: now_str })
}

#[tauri::command]
pub async fn mission_update_role(id: String, name: String, icon: String, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<()> {
    let now_str = now_iso();
    sqlx::query("UPDATE mission_roles SET name = ?, icon = ?, updated_at = ? WHERE id = ?")
        .bind(&name).bind(&icon).bind(&now_str).bind(&id)
        .execute(&*pool)
        .await?;
    crate::sync::record_outbox_event(pool.inner(), "mission_roles", &id, "upsert").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_role(
    id: String,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>
) -> AppResult<()> {
    let now = now_iso();
    // Local cascade: goals under the role, unlink tasks, then the role itself
    sqlx::query("UPDATE mission_goals SET deleted_at = ?, updated_at = ? WHERE role_id = ?")
        .bind(&now).bind(&now).bind(&id)
        .execute(&*pool).await?;
    sqlx::query("UPDATE time_management_tasks SET role_id = NULL WHERE role_id = ?")
        .bind(&id)
        .execute(&*pool).await?;
    sqlx::query("UPDATE mission_roles SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now).bind(&now).bind(&id)
        .execute(&*pool).await?;

    crate::sync::record_outbox_event(pool.inner(), "mission_roles", &id, "delete").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());

    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_roles(items: Vec<(String, i32)>, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<()> {
    let now_str = now_iso();
    let mut tx = pool.begin().await?;
    for (id, order) in &items {
        sqlx::query("UPDATE mission_roles SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(order).bind(&now_str).bind(id)
            .execute(&mut *tx).await?;
        crate::sync::record_outbox_event(pool.inner(), "mission_roles", id, "upsert").await;
    }
    tx.commit().await?;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(())
}

// ── Goal CRUD ──

#[tauri::command]
pub async fn mission_create_goal(role_id: String, title: String, sort_order: i32, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<Goal> {
    let id = uuid::Uuid::new_v4().to_string();
    let now_str = now_iso();
    sqlx::query(
        "INSERT INTO mission_goals (id, role_id, title, status, time_scope, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'not_started', 'long', ?, ?, ?)"
    )
    .bind(&id).bind(&role_id).bind(&title).bind(sort_order).bind(&now_str).bind(&now_str)
    .execute(&*pool)
    .await?;

    crate::sync::record_outbox_event(pool.inner(), "mission_goals", &id, "upsert").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
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
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>,
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
    let mut q = sqlx::query(&sql);

    if let Some(ref v) = title { q = q.bind(v); }
    if let Some(ref v) = status { q = q.bind(v); }
    if let Some(ref v) = time_scope { q = q.bind(v); }
    q = q.bind(start_date.as_deref());
    q = q.bind(end_date.as_deref());
    q = q.bind(&now_str);
    q = q.bind(&id);

    q.execute(&*pool).await?;
    crate::sync::record_outbox_event(pool.inner(), "mission_goals", &id, "upsert").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(())
}

#[tauri::command]
pub async fn mission_delete_goal(
    id: String,
    pool: State<'_, SqlitePool>,
    tidb_state: State<'_, TidbState>
) -> AppResult<()> {
    let now = now_iso();
    sqlx::query("UPDATE mission_goals SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now).bind(&now).bind(&id)
        .execute(&*pool)
        .await?;

    crate::sync::record_outbox_event(pool.inner(), "mission_goals", &id, "delete").await;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(())
}

#[tauri::command]
pub async fn mission_reorder_goals(role_id: String, items: Vec<(String, i32)>, pool: State<'_, SqlitePool>, tidb_state: State<'_, TidbState>) -> AppResult<()> {
    let now_str = now_iso();
    let mut tx = pool.begin().await?;
    for (id, order) in &items {
        sqlx::query("UPDATE mission_goals SET sort_order = ?, updated_at = ? WHERE id = ? AND role_id = ?")
            .bind(order).bind(&now_str).bind(id).bind(&role_id)
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
    crate::db::trigger_background_push(tidb_state.inner(), pool.inner().clone());
    Ok(())
}
