// DTOs for the lists module. Field names are camelCase over the wire.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListFolder {
    pub id: String,
    pub name: String,
    pub is_pinned: bool,
    pub sort_order: i32,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListNoteGroup {
    pub id: String,
    pub list_id: String,
    pub name: String,
    pub sort_order: i32,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ListTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
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
