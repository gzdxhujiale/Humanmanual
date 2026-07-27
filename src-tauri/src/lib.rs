mod db;
mod local_db;
mod local_schema;
mod list;
mod schema;
mod time_management;
mod daily_review;
mod mission;
mod habit;
mod pomodoro;
mod dictionary;
pub mod entities;


use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn pick_markdown_file() -> Result<String, String> {
    let file_path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .pick_file();

    if let Some(path) = file_path {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Err("No file selected".to_string())
    }
}

#[tauri::command]
fn save_markdown_file(default_name: String, content: String) -> Result<(), String> {
    let file_path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .save_file();

    if let Some(path) = file_path {
        std::fs::write(path, content).map_err(|e| e.to_string())
    } else {
        Err("Save cancelled".to_string())
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct MarkdownFile {
    title: String,
    content: String,
}

#[tauri::command]
fn pick_multiple_markdown_files() -> Result<Vec<MarkdownFile>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .pick_files();

    if let Some(paths) = files {
        let mut result = Vec::new();
        for path in paths {
            if let Some(filename) = path.file_stem().and_then(|s| s.to_str()) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    result.push(MarkdownFile {
                        title: filename.to_string(),
                        content,
                    });
                }
            }
        }
        Ok(result)
    } else {
        Err("No files selected".to_string())
    }
}

#[tauri::command]
fn save_multiple_markdown_files(files: Vec<MarkdownFile>) -> Result<(), String> {
    let folder = rfd::FileDialog::new().pick_folder();
    if let Some(dir) = folder {
        for file in files {
            // Sanitize filename to avoid invalid characters
            let sanitized_title: String = file.title
                .chars()
                .map(|c| if c.is_alphanumeric() || c == ' ' || c == '_' || c == '-' { c } else { '_' })
                .collect();
            
            let mut target_path = dir.join(format!("{}.md", sanitized_title));
            let mut counter = 1;
            while target_path.exists() {
                target_path = dir.join(format!("{}_{}.md", sanitized_title, counter));
                counter += 1;
            }

            std::fs::write(&target_path, file.content).map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err("Save cancelled".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::AppleScript, None))
        .setup(|app| {
            // Establish local SQLite connection (offline-first primary storage)
            let sqlite_pool = tauri::async_runtime::block_on(async {
                let pool = local_db::establish_local_connection()
                    .await
                    .expect("Failed to connect to local SQLite database");
                local_schema::ensure_local_tables(&pool)
                    .await
                    .expect("Failed to initialize local SQLite tables");
                pool
            });
            app.manage(sqlite_pool.clone());

            // Resolve the bundled ECDICT dictionary database (offline word lookup).
            let dict_path = dictionary::resolve_dict_path(app.handle());
            app.manage(dictionary::DictState::new(dict_path));

            let tidb_state = db::TidbState::default();
            app.manage(tidb_state.clone());

            // Async background attempt to connect to remote TiDB, pull cloud data, and push local updates
            let sqlite_pool_clone = sqlite_pool.clone();
            let tidb_state_clone = tidb_state.clone();
            tauri::async_runtime::spawn(async move {
                match db::establish_connection().await {
                    Ok(mysql_pool) => {
                        println!("Remote TiDB database connected. Performing initial two-way sync...");
                        *tidb_state_clone.0.write().await = Some(mysql_pool.clone());

                        if let Err(e) = local_db::pull_from_tidb(&mysql_pool, &sqlite_pool_clone).await {
                            eprintln!("Failed to pull data from TiDB: {}", e);
                        }
                        if let Err(e) = local_db::push_to_tidb(&mysql_pool, &sqlite_pool_clone).await {
                            eprintln!("Failed to push data to TiDB: {}", e);
                        }

                        // Background sync loop: periodically flush local changes to TiDB every 60s
                        let sqlite_bg = sqlite_pool_clone.clone();
                        let mysql_bg = mysql_pool.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                            loop {
                                interval.tick().await;
                                if let Err(e) = local_db::push_to_tidb(&mysql_bg, &sqlite_bg).await {
                                    eprintln!("[SyncEngine Background] Periodic push to TiDB error: {}", e);
                                }
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("TiDB cloud database unreachable (offline mode): {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            pick_markdown_file,
            save_markdown_file,
            pick_multiple_markdown_files,
            save_multiple_markdown_files,
            db::db_get_config,
            db::db_save_config,
            db::db_get_preference,
            db::db_set_preference,
            time_management::tm_load_all,
            time_management::tm_upsert_task,
            time_management::tm_delete_task,
            daily_review::daily_review_load_all,
            daily_review::daily_review_save,
            daily_review::daily_review_delete,
            list::list_load_all,
            list::list_upsert_folder,
            list::list_delete_folder,
            list::list_reorder_folders,
            list::list_upsert_list,
            list::list_delete_list,
            list::list_reorder_lists,
            list::list_move_list,
            list::list_duplicate_list,
            list::list_upsert_note,
            list::list_delete_note,
            list::list_move_note,
            list::list_reorder_notes,
            list::list_upsert_group,
            list::list_delete_group,
            list::list_upsert_template,
            list::list_delete_template,
            list::list_migrate_from_local,
            mission::mission_load_all,
            mission::mission_save_statement,
            mission::mission_create_role,
            mission::mission_update_role,
            mission::mission_delete_role,
            mission::mission_reorder_roles,
            mission::mission_create_goal,
            mission::mission_update_goal,
            mission::mission_delete_goal,
            mission::mission_reorder_goals,
            habit::habit_load_all,
            habit::habit_create,
            habit::habit_update,
            habit::habit_delete,
            habit::habit_toggle_checkin,
            pomodoro::pomodoro_load_all,
            pomodoro::pomodoro_upsert_record,
            pomodoro::pomodoro_delete_record,
            pomodoro::pomodoro_clear_all_records,
            pomodoro::pomodoro_upsert_favorite,
            pomodoro::pomodoro_delete_favorite,
            dictionary::dict_lookup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
