// Load + CRUD commands for the lists module.
// Deletes here are soft-deletes (deleted_at) or local-only hard deletes; cloud
// propagation happens through push_to_tidb, so no sync_queue entries are needed.

use sqlx::{Row, SqlitePool};
use tauri::State;

use super::types::*;
use crate::error::AppResult;
use crate::sync::{now_iso, now_ms};

// ── Load all ──

#[tauri::command]
pub async fn list_load_all(pool: State<'_, SqlitePool>) -> AppResult<ListAllData> {
    // Folders
    let folder_rows = sqlx::query(
        "SELECT id, name, is_pinned, sort_order FROM list_folders WHERE deleted_at IS NULL ORDER BY sort_order"
    ).fetch_all(&*pool).await?;

    let folders = folder_rows
        .into_iter()
        .map(|row| ListFolder {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            is_pinned: row.try_get::<i32, _>("is_pinned").map(|v| v != 0).unwrap_or(false),
            sort_order: row.try_get("sort_order").unwrap_or(0),
        })
        .collect();

    // Lists with item_count
    let list_rows = sqlx::query(
        "SELECT l.id, l.name, l.icon, l.color, l.view_type, l.folder_id, l.is_pinned, l.sort_order,
                COALESCE(n.cnt, 0) AS item_count
         FROM list_lists l
         LEFT JOIN (SELECT list_id, COUNT(*) AS cnt FROM list_notes WHERE deleted_at IS NULL GROUP BY list_id) n
           ON n.list_id = l.id
         WHERE l.deleted_at IS NULL
         ORDER BY l.is_pinned DESC, l.sort_order"
    ).fetch_all(&*pool).await?;

    let lists = list_rows
        .into_iter()
        .map(|row| ListList {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            icon: row.try_get("icon").unwrap_or_default(),
            color: row.try_get("color").unwrap_or_default(),
            view_type: row.try_get("view_type").unwrap_or_else(|_| "list".to_string()),
            folder_id: row.try_get("folder_id").unwrap_or(None),
            is_pinned: row.try_get::<i32, _>("is_pinned").map(|v| v != 0).unwrap_or(false),
            sort_order: row.try_get("sort_order").unwrap_or(0),
            item_count: row.try_get::<i32, _>("item_count").unwrap_or(0) as i64,
        })
        .collect();

    // Note groups
    let group_rows = sqlx::query(
        "SELECT id, list_id, name, sort_order FROM list_note_groups ORDER BY sort_order"
    ).fetch_all(&*pool).await?;

    let note_groups = group_rows
        .into_iter()
        .map(|row| ListNoteGroup {
            id: row.try_get("id").unwrap_or_default(),
            list_id: row.try_get("list_id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            sort_order: row.try_get("sort_order").unwrap_or(0),
        })
        .collect();

    // Notes
    let note_rows = sqlx::query(
        "SELECT id, list_id, group_id, title, content, is_pinned, sort_order,
                CAST(strftime('%s', created_at) * 1000 AS INTEGER) AS created_at_ms,
                CAST(strftime('%s', updated_at) * 1000 AS INTEGER) AS updated_at_ms
         FROM list_notes WHERE deleted_at IS NULL
         ORDER BY is_pinned DESC, sort_order, updated_at DESC"
    ).fetch_all(&*pool).await?;

    let notes = note_rows
        .into_iter()
        .map(|row| ListNote {
            id: row.try_get("id").unwrap_or_default(),
            list_id: row.try_get("list_id").unwrap_or_default(),
            group_id: row.try_get("group_id").unwrap_or(None),
            title: row.try_get("title").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
            is_pinned: row.try_get::<i32, _>("is_pinned").map(|v| v != 0).unwrap_or(false),
            sort_order: row.try_get("sort_order").unwrap_or(0),
            created_at: row.try_get::<i64, _>("created_at_ms").unwrap_or(0),
            updated_at: row.try_get::<i64, _>("updated_at_ms").unwrap_or(0),
        })
        .collect();

    // Templates
    let tpl_rows = sqlx::query("SELECT id, name, content FROM list_templates")
        .fetch_all(&*pool)
        .await?;

    let templates = tpl_rows
        .into_iter()
        .map(|row| ListTemplate {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
        })
        .collect();

    Ok(ListAllData { folders, lists, note_groups, notes, templates })
}

// ── Folder CRUD ──

#[tauri::command]
pub async fn list_upsert_folder(folder: ListFolder, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if folder.is_pinned { 1 } else { 0 };
    sqlx::query(
        "INSERT INTO list_folders (id, name, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_pinned = excluded.is_pinned, sort_order = excluded.sort_order, updated_at = excluded.updated_at"
    )
    .bind(&folder.id)
    .bind(&folder.name)
    .bind(pinned)
    .bind(folder.sort_order)
    .bind(&now)
    .bind(&now)
    .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_folder(id: String, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    // Soft-delete folder
    sqlx::query("UPDATE list_folders SET deleted_at = ? WHERE id = ?")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    // Unlink lists from folder
    sqlx::query("UPDATE list_lists SET folder_id = NULL, updated_at = ? WHERE folder_id = ?")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_folders(items: Vec<(String, i32)>, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let mut tx = pool.begin().await?;
    for (id, order) in &items {
        sqlx::query("UPDATE list_folders SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(order).bind(&now).bind(id)
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

// ── List CRUD ──

#[tauri::command]
pub async fn list_upsert_list(list: ListList, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if list.is_pinned { 1 } else { 0 };
    sqlx::query(
        "INSERT INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, icon = excluded.icon, color = excluded.color,
            view_type = excluded.view_type, folder_id = excluded.folder_id,
            is_pinned = excluded.is_pinned, sort_order = excluded.sort_order,
            updated_at = excluded.updated_at"
    )
    .bind(&list.id)
    .bind(&list.name)
    .bind(&list.icon)
    .bind(&list.color)
    .bind(&list.view_type)
    .bind(&list.folder_id)
    .bind(pinned)
    .bind(list.sort_order)
    .bind(&now)
    .bind(&now)
    .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_list(id: String, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    // Soft-delete list
    sqlx::query("UPDATE list_lists SET deleted_at = ? WHERE id = ?")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    // Soft-delete associated notes
    sqlx::query("UPDATE list_notes SET deleted_at = ? WHERE list_id = ? AND deleted_at IS NULL")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    // Delete associated groups
    sqlx::query("DELETE FROM list_note_groups WHERE list_id = ?")
        .bind(&id)
        .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_lists(items: Vec<(String, i32)>, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let mut tx = pool.begin().await?;
    for (id, order) in &items {
        sqlx::query("UPDATE list_lists SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(order).bind(&now).bind(id)
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn list_move_list(list_id: String, folder_id: Option<String>, sort_order: i32, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    sqlx::query("UPDATE list_lists SET folder_id = ?, sort_order = ?, updated_at = ? WHERE id = ?")
        .bind(&folder_id).bind(sort_order).bind(&now).bind(&list_id)
        .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_duplicate_list(source_id: String, new_list: ListList, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let now_ms_val = now_ms();
    let mut tx = pool.begin().await?;

    // Insert new list
    let pinned: i32 = if new_list.is_pinned { 1 } else { 0 };
    sqlx::query(
        "INSERT INTO list_lists (id, name, icon, color, view_type, folder_id, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&new_list.id)
    .bind(&new_list.name)
    .bind(&new_list.icon)
    .bind(&new_list.color)
    .bind(&new_list.view_type)
    .bind(&new_list.folder_id)
    .bind(pinned)
    .bind(new_list.sort_order)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx).await?;

    // Copy groups
    let group_rows = sqlx::query("SELECT id, list_id, name, sort_order FROM list_note_groups WHERE list_id = ?")
        .bind(&source_id)
        .fetch_all(&mut *tx).await?;

    let mut group_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for row in &group_rows {
        let old_id: String = row.try_get("id").unwrap_or_default();
        let new_id = format!("group-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        let name: String = row.try_get("name").unwrap_or_default();
        let sort_order: i32 = row.try_get("sort_order").unwrap_or(0);

        sqlx::query(
            "INSERT INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&new_id)
        .bind(&new_list.id)
        .bind(&name)
        .bind(sort_order)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx).await?;

        group_id_map.insert(old_id, new_id);
    }

    // Copy notes
    let note_rows = sqlx::query(
        "SELECT id, group_id, title, content, is_pinned, sort_order FROM list_notes WHERE list_id = ? AND deleted_at IS NULL"
    )
    .bind(&source_id)
    .fetch_all(&mut *tx).await?;

    for row in &note_rows {
        let old_group_id: Option<String> = row.try_get("group_id").unwrap_or(None);
        let new_group_id = old_group_id.and_then(|gid| group_id_map.get(&gid).cloned());
        let new_note_id = format!("note-{}-{}", now_ms_val, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));
        let title: String = row.try_get("title").unwrap_or_default();
        let content: String = row.try_get("content").unwrap_or_default();
        let is_pinned: i32 = row.try_get::<i32, _>("is_pinned").unwrap_or(0);
        let sort_order: i32 = row.try_get("sort_order").unwrap_or(0);

        sqlx::query(
            "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&new_note_id)
        .bind(&new_list.id)
        .bind(&new_group_id)
        .bind(&title)
        .bind(&content)
        .bind(is_pinned)
        .bind(sort_order)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(())
}

// ── Note CRUD ──

#[tauri::command]
pub async fn list_upsert_note(note: ListNote, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let pinned: i32 = if note.is_pinned { 1 } else { 0 };
    sqlx::query(
        "INSERT INTO list_notes (id, list_id, group_id, title, content, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            list_id = excluded.list_id, group_id = excluded.group_id,
            title = excluded.title, content = excluded.content,
            is_pinned = excluded.is_pinned, sort_order = excluded.sort_order,
            updated_at = excluded.updated_at"
    )
    .bind(&note.id)
    .bind(&note.list_id)
    .bind(&note.group_id)
    .bind(&note.title)
    .bind(&note.content)
    .bind(pinned)
    .bind(note.sort_order)
    .bind(&now)
    .bind(&now)
    .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_note(id: String, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    sqlx::query("UPDATE list_notes SET deleted_at = ? WHERE id = ?")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_move_note(note_id: String, list_id: String, group_id: Option<String>, sort_order: i32, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    sqlx::query("UPDATE list_notes SET list_id = ?, group_id = ?, sort_order = ?, updated_at = ? WHERE id = ?")
        .bind(&list_id).bind(&group_id).bind(sort_order).bind(&now).bind(&note_id)
        .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_reorder_notes(items: Vec<(String, i32)>, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    let mut tx = pool.begin().await?;
    for (id, order) in &items {
        sqlx::query("UPDATE list_notes SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(order).bind(&now).bind(id)
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

// ── Note Group CRUD ──

#[tauri::command]
pub async fn list_upsert_group(group: ListNoteGroup, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    sqlx::query(
        "INSERT INTO list_note_groups (id, list_id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at"
    )
    .bind(&group.id)
    .bind(&group.list_id)
    .bind(&group.name)
    .bind(group.sort_order)
    .bind(&now)
    .bind(&now)
    .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_group(id: String, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    // Move notes in this group to ungrouped
    sqlx::query("UPDATE list_notes SET group_id = NULL, updated_at = ? WHERE group_id = ? AND deleted_at IS NULL")
        .bind(&now).bind(&id)
        .execute(&*pool).await?;
    // Hard-delete the group
    sqlx::query("DELETE FROM list_note_groups WHERE id = ?")
        .bind(&id)
        .execute(&*pool).await?;
    Ok(())
}

// ── Template CRUD ──

#[tauri::command]
pub async fn list_upsert_template(template: ListTemplate, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let now = now_iso();
    sqlx::query(
        "INSERT INTO list_templates (id, name, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, updated_at = excluded.updated_at"
    )
    .bind(&template.id)
    .bind(&template.name)
    .bind(&template.content)
    .bind(&now)
    .bind(&now)
    .execute(&*pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_delete_template(id: String, pool: State<'_, SqlitePool>) -> AppResult<()> {
    sqlx::query("DELETE FROM list_templates WHERE id = ?")
        .bind(&id)
        .execute(&*pool).await?;
    Ok(())
}
