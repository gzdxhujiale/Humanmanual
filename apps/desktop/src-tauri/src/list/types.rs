// DTOs for the lists module. Field names are camelCase over the wire.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repo::{FromRow, RowExt};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListFolder {
    pub id: String,
    pub name: String,
    pub is_pinned: bool,
    pub sort_order: i32,
}

impl FromRow for ListFolder {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(ListFolder {
            id: row.parse_str(0),
            name: row.parse_str(1),
            is_pinned: row.parse_bool(2),
            sort_order: row.parse_i32(3),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListList {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub view_type: String,
    pub folder_id: Option<String>,
    pub is_pinned: bool,
    pub sort_order: i32,
    #[serde(skip_deserializing, default)]
    pub item_count: i64,
}

impl FromRow for ListList {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        let vt = row.parse_str(4);
        Ok(ListList {
            id: row.parse_str(0),
            name: row.parse_str(1),
            icon: row.parse_str(2),
            color: row.parse_str(3),
            view_type: if vt.is_empty() { "list".to_string() } else { vt },
            folder_id: row.parse_opt_str(5),
            is_pinned: row.parse_bool(6),
            sort_order: row.parse_i32(7),
            item_count: row.parse_i64(8),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListNoteGroup {
    pub id: String,
    pub list_id: String,
    pub name: String,
    pub sort_order: i32,
}

impl FromRow for ListNoteGroup {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(ListNoteGroup {
            id: row.parse_str(0),
            list_id: row.parse_str(1),
            name: row.parse_str(2),
            sort_order: row.parse_i32(3),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListNote {
    pub id: String,
    pub list_id: String,
    pub group_id: Option<String>,
    pub title: String,
    pub content: String,
    pub is_pinned: bool,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

impl FromRow for ListNote {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(ListNote {
            id: row.parse_str(0),
            list_id: row.parse_str(1),
            group_id: row.parse_opt_str(2),
            title: row.parse_str(3),
            content: row.parse_str(4),
            is_pinned: row.parse_bool(5),
            sort_order: row.parse_i32(6),
            created_at: row.parse_i64(7),
            updated_at: row.parse_i64(8),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
}

impl FromRow for ListTemplate {
    fn from_row(row: &libsql::Row) -> AppResult<Self> {
        Ok(ListTemplate {
            id: row.parse_str(0),
            name: row.parse_str(1),
            content: row.parse_str(2),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListAllData {
    pub folders: Vec<ListFolder>,
    pub lists: Vec<ListList>,
    pub note_groups: Vec<ListNoteGroup>,
    pub notes: Vec<ListNote>,
    pub templates: Vec<ListTemplate>,
}
