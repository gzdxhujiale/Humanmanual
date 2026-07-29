// Single home for ALL table definitions, in both dialects:
//   - DDL_STATEMENTS:        remote TiDB (MySQL) tables
//   - SQLITE_DDL_STATEMENTS: local SQLite mirror + sync_queue + indexes
//   - SYNCED_TABLES:         the tables two-way synced between the two
// When adding a table, update all three lists here.

use std::collections::HashSet;
use sqlx::{MySqlPool, SqlitePool, Row};

/// Tables mirrored between local SQLite and remote TiDB. Used by the
/// sync_queue DELETE flush as a whitelist and by the pull/push sync.
pub const SYNCED_TABLES: &[&str] = &[
    "time_management_tasks", "daily_reviews", "mission_statement",
    "mission_roles", "mission_goals", "habits", "habit_checkins",
    "pomodoro_records", "pomodoro_favorites", "list_folders",
    "list_lists", "list_notes", "list_note_groups", "list_templates",
];

const DDL_STATEMENTS: &[&str] = &[
    // ── 1. Mission Roles (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS mission_roles (
        id VARCHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(20) NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 2. Time Management Tasks (references mission_roles) ──
    "CREATE TABLE IF NOT EXISTS time_management_tasks (
        id VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        role_id VARCHAR(36) NULL,
        quadrant VARCHAR(10) NOT NULL,
        scheduled_date VARCHAR(20) NULL,
        time_of_day VARCHAR(20) NULL,
        completed TINYINT(1) NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        completed_at BIGINT NULL,
        description TEXT NULL,
        deadline BIGINT NULL,
        reminder VARCHAR(100) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_tm_tasks_role FOREIGN KEY (role_id) REFERENCES mission_roles(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 3. Daily Review ──
    "CREATE TABLE IF NOT EXISTS daily_reviews (
        id VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        content LONGTEXT NOT NULL,
        rating INT,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 4. List Folders (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS list_folders (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 5. List Lists (references list_folders) ──
    "CREATE TABLE IF NOT EXISTS list_lists (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(64) NOT NULL DEFAULT '',
        color VARCHAR(32) NOT NULL DEFAULT '#000000',
        view_type VARCHAR(16) NOT NULL DEFAULT 'list',
        folder_id VARCHAR(64) NULL,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_folder_order (folder_id, sort_order),
        CONSTRAINT fk_list_lists_folder FOREIGN KEY (folder_id) REFERENCES list_folders(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 6. List Note Groups (references list_lists) ──
    "CREATE TABLE IF NOT EXISTS list_note_groups (
        id VARCHAR(64) NOT NULL,
        list_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_list_order (list_id, sort_order),
        CONSTRAINT fk_note_groups_list FOREIGN KEY (list_id) REFERENCES list_lists(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 7. List Notes (references list_lists and list_note_groups) ──
    "CREATE TABLE IF NOT EXISTS list_notes (
        id VARCHAR(64) NOT NULL,
        list_id VARCHAR(64) NOT NULL,
        group_id VARCHAR(64) NULL,
        title VARCHAR(255) NOT NULL DEFAULT '',
        content LONGTEXT NOT NULL,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_list_group_order (list_id, group_id, sort_order),
        KEY idx_list_pinned (list_id, is_pinned),
        CONSTRAINT fk_list_notes_list FOREIGN KEY (list_id) REFERENCES list_lists(id) ON DELETE CASCADE,
        CONSTRAINT fk_list_notes_group FOREIGN KEY (group_id) REFERENCES list_note_groups(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 8. List Templates ──
    "CREATE TABLE IF NOT EXISTS list_templates (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        content LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 9. App preferences ──
    "CREATE TABLE IF NOT EXISTS app_preferences (
        pref_key VARCHAR(255) NOT NULL,
        pref_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (pref_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 10. Mission Statement ──
    "CREATE TABLE IF NOT EXISTS mission_statement (
        id VARCHAR(36) NOT NULL,
        content LONGTEXT NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 11. Mission Goals (references mission_roles) ──
    "CREATE TABLE IF NOT EXISTS mission_goals (
        id VARCHAR(36) NOT NULL,
        role_id VARCHAR(36) NOT NULL,
        title VARCHAR(500) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'not_started',
        time_scope VARCHAR(20) NOT NULL DEFAULT 'long',
        start_date DATE NULL,
        end_date DATE NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_role_order (role_id, sort_order),
        CONSTRAINT fk_mission_goals_role FOREIGN KEY (role_id) REFERENCES mission_roles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 12. Habits (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS habits (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NULL,
        goal VARCHAR(50) NULL,
        start_date VARCHAR(20) NULL,
        duration VARCHAR(50) NULL,
        category VARCHAR(50) NULL,
        reminder VARCHAR(50) NULL,
        auto_popup_log TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 13. Habit Checkins (references habits) ──
    "CREATE TABLE IF NOT EXISTS habit_checkins (
        id VARCHAR(64) NOT NULL,
        habit_id VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        completed TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_habit_date (habit_id, date),
        KEY idx_habit_id (habit_id),
        CONSTRAINT fk_habit_checkins_habit FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 14. Pomodoro Focus (references time_management_tasks) ──
    "CREATE TABLE IF NOT EXISTS pomodoro_records (
        id VARCHAR(64) NOT NULL,
        mode VARCHAR(32) NOT NULL,
        phase VARCHAR(32) NOT NULL,
        start_time VARCHAR(64) NOT NULL,
        end_time VARCHAR(64) NOT NULL,
        duration_minutes BIGINT NOT NULL DEFAULT 0,
        date VARCHAR(20) NOT NULL,
        date_label VARCHAR(64) NOT NULL,
        time_range_label VARCHAR(64) NOT NULL,
        task_id VARCHAR(64) NULL,
        linked_target TEXT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_pomodoro_records_task FOREIGN KEY (task_id) REFERENCES time_management_tasks(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 15. Pomodoro Favorites ──
    "CREATE TABLE IF NOT EXISTS pomodoro_favorites (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(64) NOT NULL DEFAULT '',
        mode VARCHAR(32) NOT NULL,
        duration_minutes BIGINT NOT NULL DEFAULT 25,
        accumulated_minutes BIGINT NOT NULL DEFAULT 0,
        linked_target TEXT NULL,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // ── 16. Schema Migrations Metadata ──
    "CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
];

// ── Versioned Schema Migrations ──

pub struct MigrationStep {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

const COMMON_MIGRATIONS: &[MigrationStep] = &[
    MigrationStep { version: 1, name: "habits_frequency", sql: "ALTER TABLE habits ADD COLUMN frequency VARCHAR(50) NULL" },
    MigrationStep { version: 2, name: "habits_goal", sql: "ALTER TABLE habits ADD COLUMN goal VARCHAR(50) NULL" },
    MigrationStep { version: 3, name: "habits_start_date", sql: "ALTER TABLE habits ADD COLUMN start_date VARCHAR(20) NULL" },
    MigrationStep { version: 4, name: "habits_duration", sql: "ALTER TABLE habits ADD COLUMN duration VARCHAR(50) NULL" },
    MigrationStep { version: 5, name: "habits_category", sql: "ALTER TABLE habits ADD COLUMN category VARCHAR(50) NULL" },
    MigrationStep { version: 6, name: "habits_reminder", sql: "ALTER TABLE habits ADD COLUMN reminder VARCHAR(50) NULL" },
    MigrationStep { version: 7, name: "habits_auto_popup", sql: "ALTER TABLE habits ADD COLUMN auto_popup_log TINYINT(1) NOT NULL DEFAULT 0" },
    MigrationStep { version: 8, name: "tm_reminder", sql: "ALTER TABLE time_management_tasks ADD COLUMN reminder VARCHAR(100) NULL" },
    MigrationStep { version: 9, name: "pomodoro_fav_updated_at", sql: "ALTER TABLE pomodoro_favorites ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)" },
    MigrationStep { version: 10, name: "tm_deleted_at", sql: "ALTER TABLE time_management_tasks ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 11, name: "daily_reviews_deleted_at", sql: "ALTER TABLE daily_reviews ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 12, name: "list_note_groups_deleted_at", sql: "ALTER TABLE list_note_groups ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 13, name: "list_templates_deleted_at", sql: "ALTER TABLE list_templates ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 14, name: "mission_statement_deleted_at", sql: "ALTER TABLE mission_statement ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 15, name: "mission_roles_deleted_at", sql: "ALTER TABLE mission_roles ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 16, name: "mission_goals_deleted_at", sql: "ALTER TABLE mission_goals ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 17, name: "habits_deleted_at", sql: "ALTER TABLE habits ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 18, name: "habit_checkins_deleted_at", sql: "ALTER TABLE habit_checkins ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 19, name: "pomodoro_records_updated_at", sql: "ALTER TABLE pomodoro_records ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)" },
    MigrationStep { version: 20, name: "pomodoro_records_deleted_at", sql: "ALTER TABLE pomodoro_records ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 21, name: "pomodoro_favorites_deleted_at", sql: "ALTER TABLE pomodoro_favorites ADD COLUMN deleted_at DATETIME(3) NULL" },
    MigrationStep { version: 22, name: "cleanup_orphan_notes", sql: "DELETE FROM list_notes WHERE list_id NOT IN (SELECT id FROM list_lists)" },
    MigrationStep { version: 23, name: "cleanup_orphan_goals", sql: "DELETE FROM mission_goals WHERE role_id NOT IN (SELECT id FROM mission_roles)" },
    MigrationStep { version: 24, name: "cleanup_orphan_checkins", sql: "DELETE FROM habit_checkins WHERE habit_id NOT IN (SELECT id FROM habits)" },
    MigrationStep { version: 25, name: "cleanup_orphan_groups", sql: "DELETE FROM list_note_groups WHERE list_id NOT IN (SELECT id FROM list_lists)" },
    MigrationStep { version: 26, name: "cleanup_orphan_note_groups_ref", sql: "UPDATE list_notes SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM list_note_groups)" },
];

pub async fn ensure_tables(pool: &MySqlPool) -> Result<(), sqlx::Error> {
    for sql in DDL_STATEMENTS {
        if let Err(e) = sqlx::query(*sql).execute(pool).await {
            eprintln!("[MySQL DDL] table setup warning/notice: {}", e);
        }
    }

    let applied_rows = sqlx::query("SELECT version FROM schema_migrations").fetch_all(pool).await.unwrap_or_default();
    let applied_versions: HashSet<i32> = applied_rows.into_iter().filter_map(|r| r.try_get("version").ok()).collect();

    for m in COMMON_MIGRATIONS {
        if !applied_versions.contains(&m.version) {
            let _ = sqlx::query(m.sql).execute(pool).await;
            let _ = sqlx::query("INSERT IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, CURRENT_TIMESTAMP(3))")
                .bind(m.version)
                .bind(m.name)
                .execute(pool)
                .await;
        }
    }
    let _ = sqlx::query("ALTER TABLE time_management_tasks MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)").execute(pool).await;
    let _ = sqlx::query("DELETE FROM list_notes WHERE list_id NOT IN (SELECT id FROM list_lists)").execute(pool).await;
    let _ = sqlx::query("UPDATE list_notes SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM list_note_groups)").execute(pool).await;
    Ok(())
}

// ── Local SQLite schema (mirror of the tables above, plus sync_queue & indexes) ──

const SQLITE_DDL_STATEMENTS: &[&str] = &[
    // ── 1. Mission Roles (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS mission_roles (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
    )",

    // ── 2. Time Management Tasks (references mission_roles) ──
    "CREATE TABLE IF NOT EXISTS time_management_tasks (
        id TEXT NOT NULL PRIMARY KEY,
        title TEXT NOT NULL,
        role_id TEXT NULL,
        quadrant TEXT NOT NULL,
        scheduled_date TEXT NULL,
        time_of_day TEXT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER NULL,
        description TEXT NULL,
        deadline INTEGER NULL,
        reminder TEXT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT NULL,
        FOREIGN KEY (role_id) REFERENCES mission_roles(id) ON DELETE SET NULL
    )",

    // ── 3. Daily Review ──
    "CREATE TABLE IF NOT EXISTS daily_reviews (
        id TEXT NOT NULL PRIMARY KEY,
        date TEXT NOT NULL,
        content TEXT NOT NULL,
        rating INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        UNIQUE (date)
    )",

    // ── 4. List Folders (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS list_folders (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
    )",

    // ── 5. List Lists (references list_folders) ──
    "CREATE TABLE IF NOT EXISTS list_lists (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#000000',
        view_type TEXT NOT NULL DEFAULT 'list',
        folder_id TEXT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        FOREIGN KEY (folder_id) REFERENCES list_folders(id) ON DELETE SET NULL
    )",

    // ── 6. List Note Groups (references list_lists) ──
    "CREATE TABLE IF NOT EXISTS list_note_groups (
        id TEXT NOT NULL PRIMARY KEY,
        list_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        FOREIGN KEY (list_id) REFERENCES list_lists(id) ON DELETE CASCADE
    )",

    // ── 7. List Notes (references list_lists and list_note_groups) ──
    "CREATE TABLE IF NOT EXISTS list_notes (
        id TEXT NOT NULL PRIMARY KEY,
        list_id TEXT NOT NULL,
        group_id TEXT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        FOREIGN KEY (list_id) REFERENCES list_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES list_note_groups(id) ON DELETE SET NULL
    )",

    // ── 8. List Templates ──
    "CREATE TABLE IF NOT EXISTS list_templates (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
    )",

    // ── 9. App preferences ──
    "CREATE TABLE IF NOT EXISTS app_preferences (
        pref_key TEXT NOT NULL PRIMARY KEY,
        pref_value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    )",

    // ── 10. Mission Statement ──
    "CREATE TABLE IF NOT EXISTS mission_statement (
        id TEXT NOT NULL PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
    )",

    // ── 11. Mission Goals (references mission_roles) ──
    "CREATE TABLE IF NOT EXISTS mission_goals (
        id TEXT NOT NULL PRIMARY KEY,
        role_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        time_scope TEXT NOT NULL DEFAULT 'long',
        start_date TEXT NULL,
        end_date TEXT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        FOREIGN KEY (role_id) REFERENCES mission_roles(id) ON DELETE CASCADE
    )",

    // ── 12. Habits (Parent Table) ──
    "CREATE TABLE IF NOT EXISTS habits (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        frequency TEXT NULL,
        goal TEXT NULL,
        start_date TEXT NULL,
        duration TEXT NULL,
        category TEXT NULL,
        reminder TEXT NULL,
        auto_popup_log INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL
    )",

    // ── 13. Habit Checkins (references habits) ──
    "CREATE TABLE IF NOT EXISTS habit_checkins (
        id TEXT NOT NULL PRIMARY KEY,
        habit_id TEXT NOT NULL,
        date TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        UNIQUE (habit_id, date),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    )",

    // ── 14. Pomodoro Focus (references time_management_tasks) ──
    "CREATE TABLE IF NOT EXISTS pomodoro_records (
        id TEXT NOT NULL PRIMARY KEY,
        mode TEXT NOT NULL,
        phase TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        date TEXT NOT NULL,
        date_label TEXT NOT NULL,
        time_range_label TEXT NOT NULL,
        task_id TEXT NULL,
        linked_target TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT NULL,
        FOREIGN KEY (task_id) REFERENCES time_management_tasks(id) ON DELETE SET NULL
    )",

    // ── 15. Pomodoro Favorites ──
    "CREATE TABLE IF NOT EXISTS pomodoro_favorites (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '😊',
        mode TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        accumulated_minutes INTEGER NOT NULL DEFAULT 0,
        linked_target TEXT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT '',
        deleted_at TEXT NULL
    )",

    // ── 16. Sync State Metadata ──
    "CREATE TABLE IF NOT EXISTS sync_state (
        table_name TEXT NOT NULL PRIMARY KEY,
        last_pulled_at TEXT NULL,
        last_pushed_at TEXT NULL
    )",

    // ── 17. Schema Migrations Metadata ──
    "CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )",

    // ── 18. Outbox Queue Metadata ──
    "CREATE TABLE IF NOT EXISTS outbox_queue (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (table_name, entity_id, action)
    )",

    // ── 19. Dictionary Offline Cache ──
    "CREATE TABLE IF NOT EXISTS dict_cache (
        word TEXT NOT NULL PRIMARY KEY,
        phonetic TEXT NOT NULL DEFAULT '',
        definition TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        pos TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        exchange TEXT NOT NULL DEFAULT '',
        collins INTEGER NOT NULL DEFAULT 0,
        oxford INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )",

    // ── 20. Task Reminder Fired Deduplication ──
    "CREATE TABLE IF NOT EXISTS task_reminder_fired (
        key TEXT NOT NULL PRIMARY KEY,
        fired_at INTEGER NOT NULL
    )",

    // ── Indexes ──
    "CREATE INDEX IF NOT EXISTS idx_list_lists_folder ON list_lists(folder_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_list_notes_list_group ON list_notes(list_id, group_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_list_notes_pinned ON list_notes(list_id, is_pinned)",
    "CREATE INDEX IF NOT EXISTS idx_list_note_groups_list ON list_note_groups(list_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_mission_goals_role ON mission_goals(role_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit ON habit_checkins(habit_id)",
];

/// Create all tables in the local SQLite database and run versioned migrations.
pub async fn ensure_local_tables(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for sql in SQLITE_DDL_STATEMENTS {
        sqlx::query(*sql).execute(pool).await?;
    }

    // SQLite防御性修复：如果因 MySQL 语法差异导致 ALTER 失败，补充添加更新/软删除列
    let _ = sqlx::query("ALTER TABLE pomodoro_favorites ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE pomodoro_favorites ADD COLUMN deleted_at TEXT NULL").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE pomodoro_records ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE pomodoro_records ADD COLUMN deleted_at TEXT NULL").execute(pool).await;

    let applied_rows = sqlx::query("SELECT version FROM schema_migrations").fetch_all(pool).await.unwrap_or_default();
    let applied_versions: HashSet<i32> = applied_rows.into_iter().filter_map(|r| r.try_get("version").ok()).collect();

    for m in COMMON_MIGRATIONS {
        if !applied_versions.contains(&m.version) {
            let sql = match m.version {
                9 => "ALTER TABLE pomodoro_favorites ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
                19 => "ALTER TABLE pomodoro_records ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
                _ => m.sql,
            };
            let _ = sqlx::query(sql).execute(pool).await;
            let _ = sqlx::query("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))")
                .bind(m.version)
                .bind(m.name)
                .execute(pool)
                .await;
        }
    }

    let _ = sqlx::query("UPDATE pomodoro_favorites SET updated_at = created_at WHERE updated_at = ''").execute(pool).await;
    let _ = sqlx::query("UPDATE pomodoro_records SET updated_at = created_at WHERE updated_at = ''").execute(pool).await;
    let _ = sqlx::query("UPDATE mission_goals SET start_date = NULL WHERE start_date = ''").execute(pool).await;
    let _ = sqlx::query("UPDATE mission_goals SET end_date = NULL WHERE end_date = ''").execute(pool).await;

    Ok(())
}
