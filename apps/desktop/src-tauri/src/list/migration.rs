// One-shot migration of legacy localStorage data into SQLite.
// All inserts are INSERT OR IGNORE so re-running is harmless.

use serde::Deserialize;
use tauri::State;

use crate::error::AppResult;
use crate::sync::now_iso;
use crate::db::TursoDb;

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
pub async fn list_migrate_from_local(data: MigrationData, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;

    for f in &data.folders {
        let pinned: i32 = if f.is_pinned.unwrap_or(false) { 1 } else { 0 };
        conn.execute(
            "INSERT OR IGNORE INTO list_folders (id, name, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            libsql::params![f.id.clone(), f.name.clone(), pinned, f.sort_order.unwrap_or(0), now.clone(), now.clone()],
        ).await?;
    }

    for l in &data.lists {
        let pinned: i32 = if l.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let icon = l.icon.clone().unwrap_or_default();
        let color = l.color.clone().unwrap_or_else(|| "#000000".to_string());
        let view_type = l.view_type.clone().unwrap_or_else(|| "list".to_string());
        conn.execute(
            "INSERT OR IGNORE INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            libsql::params![l.id.clone(), l.name.clone(), icon, color, view_type, l.folder_id.clone(), pinned, l.sort_order.unwrap_or(0), now.clone(), now.clone()],
        ).await?;
    }

    for g in &data.note_groups {
        conn.execute(
            "INSERT OR IGNORE INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            libsql::params![g.id.clone(), g.list_id.clone(), g.name.clone(), g.sort_order.unwrap_or(0), now.clone(), now.clone()],
        ).await?;
    }

    for n in &data.notes {
        let pinned: i32 = if n.is_pinned.unwrap_or(false) { 1 } else { 0 };
        let title = n.title.clone().unwrap_or_default();
        let content = n.content.clone().unwrap_or_default();
        let created = chrono::DateTime::from_timestamp_millis(n.created_at.unwrap_or(0))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
            .unwrap_or_else(|| now.clone());
        let updated = chrono::DateTime::from_timestamp_millis(n.updated_at.unwrap_or(0))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
            .unwrap_or_else(|| now.clone());
        conn.execute(
            "INSERT OR IGNORE INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            libsql::params![n.id.clone(), n.list_id.clone(), n.group_id.clone(), title, content, pinned, n.sort_order.unwrap_or(0), created, updated],
        ).await?;
    }

    for t in &data.templates {
        let content = t.content.clone().unwrap_or_default();
        conn.execute(
            "INSERT OR IGNORE INTO list_templates (id, name, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            libsql::params![t.id.clone(), t.name.clone(), content, now.clone(), now.clone()],
        ).await?;
    }

    Ok(())
}
