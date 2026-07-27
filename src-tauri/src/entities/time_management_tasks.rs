use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(table_name = "time_management_tasks")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
    pub role_id: Option<String>,
    pub quadrant: String,
    pub scheduled_date: Option<String>,
    pub time_of_day: Option<String>,
    pub completed: i8,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub description: Option<String>,
    pub deadline: Option<i64>,
    pub reminder: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
