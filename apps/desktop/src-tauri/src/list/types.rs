// DTOs for the lists module. Field names are camelCase over the wire.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repo::FromRow;

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
        let is_pinned_i: i32 = row.get(2).unwrap_or(0);
        Ok(ListFolder {
            id: row.get(0)?,
            name: row.get(1).unwrap_or_default(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(3).unwrap_or(0),
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
        let is_pinned_i: i32 = row.get(6).unwrap_or(0);
        Ok(ListList {
            id: row.get(0)?,
            name: row.get(1).unwrap_or_default(),
            icon: row.get(2).unwrap_or_default(),
            color: row.get(3).unwrap_or_default(),
            view_type: row.get(4).unwrap_or_else(|_| "list".to_string()),
            folder_id: row.get(5).ok(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(7).unwrap_or(0),
            item_count: row.get(8).unwrap_or(0),
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
            id: row.get(0)?,
            list_id: row.get(1).unwrap_or_default(),
            name: row.get(2).unwrap_or_default(),
            sort_order: row.get(3).unwrap_or(0),
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
        let is_pinned_i: i32 = row.get(5).unwrap_or(0);
        Ok(ListNote {
            id: row.get(0)?,
            list_id: row.get(1).unwrap_or_default(),
            group_id: row.get(2).ok(),
            title: row.get(3).unwrap_or_default(),
            content: row.get(4).unwrap_or_default(),
            is_pinned: is_pinned_i != 0,
            sort_order: row.get(6).unwrap_or(0),
            created_at: row.get(7).unwrap_or(0),
            updated_at: row.get(8).unwrap_or(0),
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
            id: row.get(0)?,
            name: row.get(1).unwrap_or_default(),
            content: row.get(2).unwrap_or_default(),
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
