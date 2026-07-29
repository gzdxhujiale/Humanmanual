import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mysqlConfigPath = path.join(__dirname, '../src-tauri/mysql.config.json');
const tursoConfigPath = path.join(__dirname, '../src-tauri/turso.config.json');

if (!fs.existsSync(mysqlConfigPath)) {
  console.error('❌ mysql.config.json not found');
  process.exit(1);
}

if (!fs.existsSync(tursoConfigPath)) {
  console.error('❌ turso.config.json not found');
  process.exit(1);
}

const mysqlConfig = JSON.parse(fs.readFileSync(mysqlConfigPath, 'utf8'));
const tursoConfig = JSON.parse(fs.readFileSync(tursoConfigPath, 'utf8'));

if (!tursoConfig.url || !tursoConfig.authToken) {
  console.error('❌ Turso URL or AuthToken missing in turso.config.json');
  process.exit(1);
}

const SQLITE_DDLS = [
  `CREATE TABLE IF NOT EXISTS mission_roles (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS time_management_tasks (
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
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS daily_reviews (
      id TEXT NOT NULL PRIMARY KEY,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL,
      UNIQUE (date)
  )`,

  `CREATE TABLE IF NOT EXISTS list_folders (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS list_lists (
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
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS list_note_groups (
      id TEXT NOT NULL PRIMARY KEY,
      list_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS list_notes (
      id TEXT NOT NULL PRIMARY KEY,
      list_id TEXT NOT NULL,
      group_id TEXT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS list_templates (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS app_preferences (
      pref_key TEXT NOT NULL PRIMARY KEY,
      pref_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS mission_statement (
      id TEXT NOT NULL PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS mission_goals (
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
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS habits (
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
  )`,

  `CREATE TABLE IF NOT EXISTS habit_checkins (
      id TEXT NOT NULL PRIMARY KEY,
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS pomodoro_records (
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
      deleted_at TEXT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS pomodoro_favorites (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 25,
      accumulated_minutes INTEGER NOT NULL DEFAULT 0,
      linked_target TEXT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
  )`
];

const TABLES_TO_MIGRATE = [
  'mission_roles',
  'time_management_tasks',
  'daily_reviews',
  'list_folders',
  'list_lists',
  'list_note_groups',
  'list_notes',
  'list_templates',
  'app_preferences',
  'mission_statement',
  'mission_goals',
  'habits',
  'habit_checkins',
  'pomodoro_records',
  'pomodoro_favorites'
];

async function migrate() {
  console.log('🚀 Connecting to TiDB MySQL...');
  const tidb = await mysql.createConnection({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    ssl: { rejectUnauthorized: false }
  });
  console.log('✅ Connected to TiDB Serverless');

  console.log('🚀 Connecting to Turso Cloud...');
  const turso = createClient({
    url: tursoConfig.url,
    authToken: tursoConfig.authToken
  });
  console.log('✅ Connected to Turso Cloud');

  console.log('\n📋 Creating tables in Turso if not exists...');
  for (const ddl of SQLITE_DDLS) {
    await turso.execute(ddl);
  }
  console.log('✅ Turso Schema Setup Complete');

  console.log('\n📦 Migrating data table by table...');
  let totalRowsMigrated = 0;

  for (const table of TABLES_TO_MIGRATE) {
    try {
      const [rows] = await tidb.query(`SELECT * FROM ${table}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(` ℹ️ Table '${table}': 0 rows found in TiDB.`);
        continue;
      }

      console.log(` 🔄 Migrating table '${table}' (${rows.length} rows)...`);
      let migratedCount = 0;

      for (const row of rows) {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(', ');
        const pkCol = keys.includes('id') ? 'id' : 'pref_key';
        
        const updateAssigns = keys
          .filter(k => k !== pkCol)
          .map(k => `${k} = excluded.${k}`)
          .join(', ');

        const values = keys.map(k => {
          let val = row[k];
          if (val instanceof Date) {
            val = val.toISOString().replace('T', ' ').replace('Z', '');
          }
          if (typeof val === 'boolean') {
            val = val ? 1 : 0;
          }
          return val ?? null;
        });

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${pkCol}) DO UPDATE SET ${updateAssigns}`;

        await turso.execute({
          sql,
          args: values
        });
        migratedCount++;
      }

      console.log(` ✅ Table '${table}': ${migratedCount}/${rows.length} rows migrated to Turso.`);
      totalRowsMigrated += migratedCount;
    } catch (err) {
      console.error(` ❌ Failed migrating table '${table}':`, err.message);
    }
  }

  console.log(`\n🎉 Data Migration Complete! Total rows synced to Turso: ${totalRowsMigrated}`);
  await tidb.end();
}

migrate().catch(e => {
  console.error('❌ Migration Error:', e);
  process.exit(1);
});
