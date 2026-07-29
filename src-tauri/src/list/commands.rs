// Load + CRUD commands for the lists module.

use tauri::State;

use super::types::*;
use crate::error::AppResult;
use crate::sync::{now_iso, now_ms};
use crate::turso_state::TursoDb;

// ── Load all ──

#[tauri::command]
pub async fn list_load_all(db: State<'_, TursoDb>) -> AppResult<ListAllData> {
    let conn = db.conn()?;

    // Folders
    let mut folder_rows = conn.query(
        "SELECT id, name, is_pinned, sort_order FROM list_folders WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;
    let mut folders = Vec::new();
    while let Ok(Some(row)) = folder_rows.next().await {
        let is_pinned_i: i32 = row.get(2).unwrap_or(0);
        folders.push(ListFolder {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(3).unwrap_or(0),
        });
    }

    // Lists with item_count
    let conn2 = db.conn()?;
    let mut list_rows = conn2.query(
        "SELECT l.id, l.name, l.icon, l.color, l.view_type, l.folder_id, l.is_pinned, l.sort_order, COALESCE(n.cnt, 0) AS item_count FROM list_lists l LEFT JOIN (SELECT list_id, COUNT(*) AS cnt FROM list_notes WHERE deleted_at IS NULL GROUP BY list_id) n ON n.list_id = l.id WHERE l.deleted_at IS NULL ORDER BY l.is_pinned DESC, l.sort_order",
        (),
    ).await?;
    let mut lists = Vec::new();
    while let Ok(Some(row)) = list_rows.next().await {
        let is_pinned_i: i32 = row.get(6).unwrap_or(0);
        lists.push(ListList {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            icon: row.get(2).unwrap_or_default(),
            color: row.get(3).unwrap_or_default(),
            view_type: row.get(4).unwrap_or_else(|_| "list".to_string()),
            folder_id: row.get(5).ok(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(7).unwrap_or(0),
            item_count: row.get(8).unwrap_or(0),
        });
    }

    // Note groups
    let conn3 = db.conn()?;
    let mut group_rows = conn3.query(
        "SELECT id, list_id, name, sort_order FROM list_note_groups WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;
    let mut note_groups = Vec::new();
    while let Ok(Some(row)) = group_rows.next().await {
        note_groups.push(ListNoteGroup {
            id: row.get(0).unwrap_or_default(),
            list_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            sort_order: row.get(3).unwrap_or(0),
        });
    }

    // Notes
    let conn4 = db.conn()?;
    let mut note_rows = conn4.query(
        "SELECT id, list_id, group_id, title, content, is_pinned, sort_order, CAST(strftime('%s', created_at) * 1000 AS INTEGER) AS created_at_ms, CAST(strftime('%s', updated_at) * 1000 AS INTEGER) AS updated_at_ms FROM list_notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, sort_order, updated_at DESC",
        (),
    ).await?;
    let mut notes = Vec::new();
    while let Ok(Some(row)) = note_rows.next().await {
        let is_pinned_i: i32 = row.get(5).unwrap_or(0);
        notes.push(ListNote {
            id: row.get(0).unwrap_or_default(),
            list_id: row.get(1).unwrap_or_default(),
            group_id: row.get(2).ok(),
            title: row.get(3).unwrap_or_default(),
            content: row.get(4).unwrap_or_default(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(6).unwrap_or(0),
            created_at: row.get(7).unwrap_or(0),
            updated_at: row.get(8).unwrap_or(0),
        });
    }

    // Templates
    let conn5 = db.conn()?;
    let mut tpl_rows = conn5.query("SELECT id, name, content FROM list_templates WHERE deleted_at IS NULL", ()).await?;
    let mut templates = Vec::new();
    while let Ok(Some(row)) = tpl_rows.next().await {
        templates.push(ListTemplate {
            id: row.get(0).unwrap_or_default(),
            name: row.get(1).unwrap_or_default(),
            content: row.get(2).unwrap_or_default(),
        });
    }

    Ok(ListAllData { folders, lists, note_groups, notes, templates })
}

// ── Folder CRUD ──

#[tauri::command]
pub async fn list_upsert_folder(folder: ListFolder, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if folder.is_pinned { 1 } else { 0 };
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_folders (id, name, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_pinned = excluded.is_pinned, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
        libsql::params![folder.id, folder.name, pinned, folder.sort_order, now.clone(), now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_folder(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_folders SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now.clone(), id.clone()]).await?;
    conn.execute("UPDATE list_lists SET folder_id = NULL, updated_at = ?1 WHERE folder_id = ?2",
        libsql::params![now, id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_folders(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    for (id, order) in &items {
        conn.execute("UPDATE list_folders SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![*order, now.clone(), id.clone()]).await?;
    }
    Ok(())
}

// ── List CRUD ──

#[tauri::command]
pub async fn list_upsert_list(list: ListList, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if list.is_pinned { 1 } else { 0 };
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, color = excluded.color, view_type = excluded.view_type, folder_id = excluded.folder_id, is_pinned = excluded.is_pinned, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
        libsql::params![list.id, list.name, list.icon, list.color, list.view_type, list.folder_id, pinned, list.sort_order, now.clone(), now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_list(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_lists SET deleted_at = ?1 WHERE id = ?2",
        libsql::params![now.clone(), id.clone()]).await?;
    conn.execute("UPDATE list_notes SET deleted_at = ?1 WHERE list_id = ?2 AND deleted_at IS NULL",
        libsql::params![now.clone(), id.clone()]).await?;
    conn.execute("UPDATE list_note_groups SET deleted_at = ?1, updated_at = ?2 WHERE list_id = ?3 AND deleted_at IS NULL",
        libsql::params![now.clone(), now, id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_lists(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    for (id, order) in &items {
        conn.execute("UPDATE list_lists SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![*order, now.clone(), id.clone()]).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_move_list(list_id: String, folder_id: Option<String>, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_lists SET folder_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
        libsql::params![folder_id, sort_order, now, list_id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_duplicate_list(source_id: String, new_list: ListList, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let now_ms_val = now_ms();
    let conn = db.conn()?;

    let pinned: i32 = if new_list.is_pinned { 1 } else { 0 };
    conn.execute(
        "INSERT INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        libsql::params![new_list.id.clone(), new_list.name, new_list.icon, new_list.color, new_list.view_type, new_list.folder_id, pinned, new_list.sort_order, now.clone(), now.clone()],
    ).await?;

    // Copy groups
    let mut group_rows = conn.query(
        "SELECT id, name, sort_order FROM list_note_groups WHERE list_id = ?1",
        libsql::params![source_id.clone()],
    ).await?;

    let mut group_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut groups_to_insert = Vec::new();
    while let Ok(Some(row)) = group_rows.next().await {
        let old_id: String = row.get(0).unwrap_or_default();
        let name: String = row.get(1).unwrap_or_default();
        let sort_order: i32 = row.get(2).unwrap_or(0);
        let new_id = format!("group-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        group_id_map.insert(old_id, new_id.clone());
        groups_to_insert.push((new_id, name, sort_order));
    }
    for (gid, name, sort_order) in &groups_to_insert {
        conn.execute(
            "INSERT INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            libsql::params![gid.clone(), new_list.id.clone(), name.clone(), *sort_order, now.clone(), now.clone()],
        ).await?;
    }

    // Copy notes
    let mut note_rows = conn.query(
        "SELECT id, group_id, title, content, is_pinned, sort_order FROM list_notes WHERE list_id = ?1 AND deleted_at IS NULL",
        libsql::params![source_id],
    ).await?;
    let mut notes_to_insert = Vec::new();
    while let Ok(Some(row)) = note_rows.next().await {
        let old_group_id: Option<String> = row.get(1).ok();
        let new_group_id = old_group_id.and_then(|gid| group_id_map.get(&gid).cloned());
        let new_note_id = format!("note-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        let title: String = row.get(2).unwrap_or_default();
        let content: String = row.get(3).unwrap_or_default();
        let is_pinned: i32 = row.get(4).unwrap_or(0);
        let sort_order: i32 = row.get(5).unwrap_or(0);
        notes_to_insert.push((new_note_id, new_group_id, title, content, is_pinned, sort_order));
    }
    for (nid, group_id, title, content, is_pinned, sort_order) in &notes_to_insert {
        conn.execute(
            "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            libsql::params![nid.clone(), new_list.id.clone(), group_id.clone(), title.clone(), content.clone(), *is_pinned, *sort_order, now.clone(), now.clone()],
        ).await?;
    }

    Ok(())
}

// ── Note CRUD ──

#[tauri::command]
pub async fn list_upsert_note(note: ListNote, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if note.is_pinned { 1 } else { 0 };
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO UPDATE SET list_id = excluded.list_id, group_id = excluded.group_id, title = excluded.title, content = excluded.content, is_pinned = excluded.is_pinned, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
        libsql::params![note.id, note.list_id, note.group_id, note.title, note.content, pinned, note.sort_order, now.clone(), now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_note(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_notes SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_move_note(note_id: String, list_id: String, group_id: Option<String>, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_notes SET list_id = ?1, group_id = ?2, sort_order = ?3, updated_at = ?4 WHERE id = ?5",
        libsql::params![list_id, group_id, sort_order, now, note_id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_notes(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    for (id, order) in &items {
        conn.execute("UPDATE list_notes SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![*order, now.clone(), id.clone()]).await?;
    }
    Ok(())
}

// ── Note Group CRUD ──

#[tauri::command]
pub async fn list_upsert_group(group: ListNoteGroup, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
        libsql::params![group.id, group.list_id, group.name, group.sort_order, now.clone(), now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_group(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_notes SET group_id = NULL, updated_at = ?1 WHERE group_id = ?2 AND deleted_at IS NULL",
        libsql::params![now.clone(), id.clone()]).await?;
    conn.execute("UPDATE list_note_groups SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id]).await?;
    Ok(())
}

// ── Template CRUD ──

#[tauri::command]
pub async fn list_upsert_template(template: ListTemplate, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_templates (id, name, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, updated_at = excluded.updated_at",
        libsql::params![template.id, template.name, template.content, now.clone(), now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_template(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    conn.execute("UPDATE list_templates SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now.clone(), now, id]).await?;
    Ok(())
}
