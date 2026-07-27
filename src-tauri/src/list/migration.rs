// One-shot migration of legacy localStorage data into SQLite.
// All inserts are INSERT OR IGNORE so re-running is harmless.

use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationData {
    pub folders: Vec<MigrationFolder>,
    pub lists: Vec<MigrationList>,
    pub note_groups: Vec<MigrationNoteGroup>,
    pub notes: Vec<MigrationNote>,
    pub templates: Vec<MigrationTemplate>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationList {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub view_type: Option<String>,
    pub folder_id: Option<String>,
    #[serde(default)]
    pub is_pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    #[allow(dead_code)]
    pub item_count: Option<i32>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationNoteGroup {
    pub id: String,
    pub list_id: String,
    pub name: String,
    #[serde(default)]
    pub sort_order: Option<i32>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationNote {
    pub id: String,
    pub list_id: String,
    pub group_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub is_pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<i64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MigrationTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub content: Option<String>,
}

#[tauri::command]
pub async fn list_migrate_from_local(data: MigrationData, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let mut tx = pool.begin().await?;

    // Migrate folders
    for f in &data.folders {
        let pinned: i32 = if f.is_pinned.unwrap_or(false) { 1 } else { 0 };
        sqlx::query(
            "INSERT OR IGNORE INTO list_folders (id, name, is_pinned, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&f.id).bind(&f.name).bind(pinned).bind(f.sort_order.unwrap_or(0))
        .bind(&now).bind(&now)
        .execute(&mut *tx).await?;
    }

    // Migrate lists
    for l in &data.lists {
        let pinned: i32 = if l.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let icon = l.icon.as_deref().unwrap_or("");
        let color = l.color.as_deref().unwrap_or("#000000");
        let view_type = l.view_type.as_deref().unwrap_or("list");
        sqlx::query(
            "INSERT OR IGNORE INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&l.id).bind(&l.name).bind(icon).bind(color).bind(view_type)
        .bind(&l.folder_id).bind(pinned).bind(l.sort_order.unwrap_or(0))
        .bind(&now).bind(&now)
        .execute(&mut *tx).await?;
    }

    // Migrate note groups
    for g in &data.note_groups {
        sqlx::query(
            "INSERT OR IGNORE INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&g.id).bind(&g.list_id).bind(&g.name).bind(g.sort_order.unwrap_or(0))
        .bind(&now).bind(&now)
        .execute(&mut *tx).await?;
    }

    // Migrate notes
    for n in &data.notes {
        let pinned: i32 = if n.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let title = n.title.as_deref().unwrap_or("");
        let content = n.content.as_deref().unwrap_or("");
        let created = chrono::DateTime::from_timestamp_millis(n.created_at.unwrap_or(0))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
            .unwrap_or_else(|| now.clone());
        let updated = chrono::DateTime::from_timestamp_millis(n.updated_at.unwrap_or(0))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
            .unwrap_or_else(|| now.clone());
        sqlx::query(
            "INSERT OR IGNORE INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&n.id).bind(&n.list_id).bind(&n.group_id).bind(title).bind(content)
        .bind(pinned).bind(n.sort_order.unwrap_or(0))
        .bind(&created).bind(&updated)
        .execute(&mut *tx).await?;
    }

    // Migrate templates
    for t in &data.templates {
        let content = t.content.as_deref().unwrap_or("");
        sqlx::query(
            "INSERT OR IGNORE INTO list_templates (id, name, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&t.id).bind(&t.name).bind(content)
        .bind(&now).bind(&now)
        .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(())
}
