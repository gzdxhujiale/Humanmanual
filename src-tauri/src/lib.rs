mod daily_review;
mod db;
mod dictionary;
pub mod entities;
mod error;
mod file_dialog;
mod habit;
mod list;
mod local_db;
mod mission;
mod pomodoro;
mod schema;
mod sync;
mod time_management;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance 必须第一个注册：重复启动时聚焦已有主窗口，避免两套实例写同一个 SQLite
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // 只记忆主窗口状态；快捷编辑/便签/词典等子窗口位置由前端实时计算，不得被旧状态覆盖
        .plugin(tauri_plugin_window_state::Builder::default().with_filter(|label| label == "main").build())
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
                schema::ensure_local_tables(&pool)
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
            file_dialog::pick_markdown_file,
            file_dialog::save_markdown_file,
            file_dialog::pick_multiple_markdown_files,
            file_dialog::save_multiple_markdown_files,
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
            list::commands::list_load_all,
            list::commands::list_upsert_folder,
            list::commands::list_delete_folder,
            list::commands::list_reorder_folders,
            list::commands::list_upsert_list,
            list::commands::list_delete_list,
            list::commands::list_reorder_lists,
            list::commands::list_move_list,
            list::commands::list_duplicate_list,
            list::commands::list_upsert_note,
            list::commands::list_delete_note,
            list::commands::list_move_note,
            list::commands::list_reorder_notes,
            list::commands::list_upsert_group,
            list::commands::list_delete_group,
            list::commands::list_upsert_template,
            list::commands::list_delete_template,
            list::migration::list_migrate_from_local,
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
