mod daily_review;
mod db;
mod dictionary;
mod error;
mod file_dialog;
mod habit;
mod list;
mod mission;
mod pomodoro;
mod reminder_scheduler;
mod schema;
mod sync;
mod time_management;

use db::TursoDb;
use tauri::Manager;

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
        // 只记忆主窗口状态；快捷编辑/便签/词典等子窗口位置由前端实时计算，不得被旧状态覆盖
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filter(|label| label == "main")
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .setup(|app| {
            if let Ok(dir) = app.path().app_data_dir() {
                db::set_app_config_dir(dir);
            }

            let handle = app.handle().clone();
            let handle_clone = handle.clone();
            let turso_db = std::thread::Builder::new()
                .name("db-setup".to_string())
                .stack_size(32 * 1024 * 1024) // 32 MB
                .spawn(move || {
                    tauri::async_runtime::block_on(async move {
                        let (db, is_remote, is_replica, init_err) = match db::establish_local_connection(&handle_clone).await {
                            Ok(quad) => quad,
                            Err(e) => {
                                let err_str = e.to_string();
                                eprintln!("[DB] Failed to connect to database: {}, fallbacking immediately to local SQLite mode", err_str);
                                let fallback_path = handle_clone
                                    .path()
                                    .app_data_dir()
                                    .unwrap_or_default()
                                    .join("data")
                                    .join("fishworker.db");
                                let path_str = fallback_path.to_string_lossy().to_string();
                                let local_db = libsql::Builder::new_local(path_str)
                                    .build()
                                    .await
                                    .unwrap_or_else(|e2| panic!("Fatal: Could not open local SQLite DB: {}", e2));
                                (local_db, false, false, Some(err_str))
                            }
                        };

                        if let Ok(conn) = db.connect() {
                            if let Err(e) = schema::ensure_local_tables(&conn).await {
                                eprintln!("[DB] Error ensuring local tables: {}", e);
                            }
                        } else {
                            eprintln!("[DB] Failed to get connection for schema setup");
                        }

                        TursoDb::new(db, is_remote, is_replica, init_err)
                    })
                })
                .expect("Failed to spawn db-setup thread")
                .join()
                .unwrap_or_else(|_| {
                    eprintln!("[DB] DB setup thread panicked!");
                    panic!("DB setup thread panicked");
                });

            app.manage(turso_db);
            let turso_state = app.state::<TursoDb>();
            let db_for_reminder = turso_state.inner().clone();
            reminder_scheduler::start_reminder_scheduler(app.handle().clone(), db_for_reminder);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_dialog::pick_markdown_file,
            file_dialog::save_markdown_file,
            file_dialog::pick_multiple_markdown_files,
            file_dialog::save_multiple_markdown_files,
            db::db_get_turso_config,
            db::db_save_turso_config,
            db::db_get_preference,
            db::db_set_preference,
            db::db_sync_now,
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
