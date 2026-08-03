// Load + CRUD commands for the lists module.

use tauri::State;

use super::types::*;
use crate::error::AppResult;
use crate::repo::{query_all, with_txn, RowExt};
use crate::sync::{now_iso, now_ms};
use crate::db::TursoDb;

// ── Load all ──

#[tauri::command]
pub async fn list_load_all(db: State<'_, TursoDb>) -> AppResult<ListAllData> {
    let conn = db.conn()?;

    let folders: Vec<ListFolder> = query_all(
        &conn,
        "SELECT id, name, is_pinned, sort_order FROM list_folders WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    let lists: Vec<ListList> = query_all(
        &conn,
        "SELECT l.id, l.name, l.icon, l.color, l.view_type, l.folder_id, l.is_pinned, l.sort_order, COALESCE(n.cnt, 0) AS item_count FROM list_lists l LEFT JOIN (SELECT list_id, COUNT(*) AS cnt FROM list_notes WHERE deleted_at IS NULL GROUP BY list_id) n ON n.list_id = l.id WHERE l.deleted_at IS NULL ORDER BY l.is_pinned DESC, l.sort_order",
        (),
    ).await?;

    let note_groups: Vec<ListNoteGroup> = query_all(
        &conn,
        "SELECT id, list_id, name, sort_order FROM list_note_groups WHERE deleted_at IS NULL ORDER BY sort_order",
        (),
    ).await?;

    // created_at/updated_at 已由 schema 迁移为 UNIX 毫秒整数，直读即可
    let notes: Vec<ListNote> = query_all(
        &conn,
        "SELECT id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at FROM list_notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, sort_order, updated_at DESC",
        (),
    ).await?;

    let templates: Vec<ListTemplate> = query_all(
        &conn,
        "SELECT id, name, content FROM list_templates WHERE deleted_at IS NULL",
        (),
    ).await?;

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
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute("UPDATE list_folders SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![now.clone(), now.clone(), id.clone()]).await?;
        tx.execute("UPDATE list_lists SET folder_id = NULL, updated_at = ?1 WHERE folder_id = ?2",
            libsql::params![now, id]).await?;
        Ok(())
    })).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_folders(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        for (id, order) in &items {
            tx.execute("UPDATE list_folders SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![*order, now.clone(), id.clone()]).await?;
        }
        Ok(())
    })).await?;
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
    let now_ms_val = now_ms();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute("UPDATE list_lists SET deleted_at = ?1 WHERE id = ?2",
            libsql::params![now.clone(), id.clone()]).await?;
        tx.execute("UPDATE list_notes SET deleted_at = ?1 WHERE list_id = ?2 AND deleted_at IS NULL",
            libsql::params![now_ms_val, id.clone()]).await?;
        tx.execute("UPDATE list_note_groups SET deleted_at = ?1, updated_at = ?2 WHERE list_id = ?3 AND deleted_at IS NULL",
            libsql::params![now.clone(), now, id]).await?;
        Ok(())
    })).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_lists(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_iso();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        for (id, order) in &items {
            tx.execute("UPDATE list_lists SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![*order, now.clone(), id.clone()]).await?;
        }
        Ok(())
    })).await?;
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

    // 先读取源分组与笔记，再在单个事务内写入新列表 + 分组 + 笔记，避免半拷贝状态
    let mut group_rows = conn.query(
        "SELECT id, name, sort_order FROM list_note_groups WHERE list_id = ?1",
        libsql::params![source_id.clone()],
    ).await?;

    let mut group_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut groups_to_insert = Vec::new();
    while let Some(row) = group_rows.next().await? {
        let old_id = row.parse_str(0);
        let name = row.parse_str(1);
        let sort_order = row.parse_i32(2);
        let new_id = format!("group-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        group_id_map.insert(old_id, new_id.clone());
        groups_to_insert.push((new_id, name, sort_order));
    }
    drop(group_rows);

    let mut note_rows = conn.query(
        "SELECT id, group_id, title, content, is_pinned, sort_order FROM list_notes WHERE list_id = ?1 AND deleted_at IS NULL",
        libsql::params![source_id],
    ).await?;
    let mut notes_to_insert = Vec::new();
    while let Some(row) = note_rows.next().await? {
        let old_group_id = row.parse_opt_str(1);
        let new_group_id = old_group_id.and_then(|gid| group_id_map.get(&gid).cloned());
        let new_note_id = format!("note-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        let title = row.parse_str(2);
        let content = row.parse_str(3);
        let is_pinned = if row.parse_bool(4) { 1 } else { 0 };
        let sort_order = row.parse_i32(5);
        notes_to_insert.push((new_note_id, new_group_id, title, content, is_pinned, sort_order));
    }
    drop(note_rows);

    let pinned: i32 = if new_list.is_pinned { 1 } else { 0 };
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute(
            "INSERT INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            libsql::params![new_list.id.clone(), new_list.name, new_list.icon, new_list.color, new_list.view_type, new_list.folder_id, pinned, new_list.sort_order, now.clone(), now.clone()],
        ).await?;
        for (gid, name, sort_order) in &groups_to_insert {
            tx.execute(
                "INSERT INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                libsql::params![gid.clone(), new_list.id.clone(), name.clone(), *sort_order, now.clone(), now.clone()],
            ).await?;
        }
        for (nid, group_id, title, content, is_pinned, sort_order) in &notes_to_insert {
            tx.execute(
                "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                libsql::params![nid.clone(), new_list.id.clone(), group_id.clone(), title.clone(), content.clone(), *is_pinned, *sort_order, now_ms_val, now_ms_val],
            ).await?;
        }
        Ok(())
    })).await?;

    Ok(())
}

// ── Note CRUD ──

#[tauri::command]
pub async fn list_upsert_note(note: ListNote, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let pinned: i32 = if note.is_pinned { 1 } else { 0 };
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO UPDATE SET list_id = excluded.list_id, group_id = excluded.group_id, title = excluded.title, content = excluded.content, is_pinned = excluded.is_pinned, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
        libsql::params![note.id, note.list_id, note.group_id, note.title, note.content, pinned, note.sort_order, now, now],
    ).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_note(id: String, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute("UPDATE list_notes SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
        libsql::params![now, now, id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_move_note(note_id: String, list_id: String, group_id: Option<String>, sort_order: i32, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    conn.execute("UPDATE list_notes SET list_id = ?1, group_id = ?2, sort_order = ?3, updated_at = ?4 WHERE id = ?5",
        libsql::params![list_id, group_id, sort_order, now, note_id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_notes(items: Vec<(String, i32)>, db: State<'_, TursoDb>) -> AppResult<()> {
    let now = now_ms();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        for (id, order) in &items {
            tx.execute("UPDATE list_notes SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                libsql::params![*order, now, id.clone()]).await?;
        }
        Ok(())
    })).await?;
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
    let now_ms_val = now_ms();
    let conn = db.conn()?;
    with_txn(&conn, |tx| Box::pin(async move {
        tx.execute("UPDATE list_notes SET group_id = NULL, updated_at = ?1 WHERE group_id = ?2 AND deleted_at IS NULL",
            libsql::params![now_ms_val, id.clone()]).await?;
        tx.execute("UPDATE list_note_groups SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
            libsql::params![now.clone(), now, id]).await?;
        Ok(())
    })).await?;
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
