use chrono::{Datelike, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db::TursoDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskReminderConfig {
    pub offset_days: i64,
    pub time: String,
    pub repeat: bool,
}

fn parse_reminder(raw: &str) -> Option<TaskReminderConfig> {
    if raw.trim().is_empty() {
        return None;
    }
    #[derive(Deserialize)]
    struct RawReminder {
        #[serde(alias = "offsetDays")]
        offset_days: Option<i64>,
        time: Option<String>,
        repeat: Option<bool>,
    }

    if let Ok(raw_obj) = serde_json::from_str::<RawReminder>(raw) {
        if let (Some(offset_days), Some(time)) = (raw_obj.offset_days, raw_obj.time) {
            return Some(TaskReminderConfig {
                offset_days,
                time,
                repeat: raw_obj.repeat.unwrap_or(false),
            });
        }
    }
    None
}

fn get_task_target_date(deadline: Option<i64>, scheduled_date: Option<&str>, created_at: i64) -> NaiveDate {
    if let Some(dl) = deadline {
        if let Some(dt) = chrono::DateTime::from_timestamp_millis(dl) {
            return dt.with_timezone(&Local).date_naive();
        }
    }
    if let Some(sd) = scheduled_date {
        if let Ok(date) = NaiveDate::parse_from_str(sd, "%Y-%m-%d") {
            return date;
        }
    }
    if let Some(dt) = chrono::DateTime::from_timestamp_millis(created_at) {
        return dt.with_timezone(&Local).date_naive();
    }
    Local::now().date_naive()
}

fn build_deadline_body(task_title: &str, target_date: NaiveDate, deadline_ms: Option<i64>, days_left: i64) -> String {
    let mut whole_day = true;
    let mut hm_str = String::new();
    if let Some(dl) = deadline_ms {
        if let Some(dt) = chrono::DateTime::from_timestamp_millis(dl) {
            let local_dt = dt.with_timezone(&Local);
            hm_str = local_dt.format("%H:%M").to_string();
            if hm_str != "23:59" && hm_str != "00:00" {
                whole_day = false;
            }
        }
    }

    let when = if days_left <= 0 {
        "今天到期".to_string()
    } else if days_left == 1 {
        "明天到期".to_string()
    } else {
        format!("{} 天后到期", days_left)
    };

    let formatted_date = if whole_day {
        format!("{}月{}日", target_date.month(), target_date.day())
    } else {
        format!("{}月{}日 {}", target_date.month(), target_date.day(), hm_str)
    };

    format!("「{}」{}（{}）", task_title, when, formatted_date)
}

pub async fn check_and_send_reminders(app_handle: &AppHandle, turso: &TursoDb) {
    let conn = match turso.conn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[ReminderScheduler] Failed to get DB connection: {}", e);
            return;
        }
    };

    let mut rows = match conn.query(
        "SELECT id, title, deadline, scheduled_date, created_at, reminder FROM time_management_tasks WHERE completed = 0 AND deleted_at IS NULL AND reminder IS NOT NULL AND reminder != ''",
        (),
    ).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[ReminderScheduler] DB query error: {}", e);
            return;
        }
    };

    let now_local = Local::now();
    let today = now_local.date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();
    let current_hm = (now_local.hour(), now_local.minute());

    let mut tasks: Vec<(String, String, Option<i64>, Option<String>, i64, String)> = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let id: String = row.get(0).unwrap_or_default();
        let title: String = row.get(1).unwrap_or_default();
        let deadline: Option<i64> = row.get(2).ok();
        let scheduled_date: Option<String> = row.get(3).ok();
        let created_at: i64 = row.get(4).unwrap_or(0);
        let reminder_raw: String = row.get(5).unwrap_or_default();
        tasks.push((id, title, deadline, scheduled_date, created_at, reminder_raw));
    }

    for (id, title, deadline, scheduled_date, created_at, reminder_raw) in tasks {
        let r = match parse_reminder(&reminder_raw) {
            Some(r) => r,
            None => continue,
        };

        let target_date = get_task_target_date(deadline, scheduled_date.as_deref(), created_at);
        let remind_day = target_date - chrono::Duration::days(r.offset_days);

        if today < remind_day || today > target_date {
            continue;
        }
        if !r.repeat && today != remind_day {
            continue;
        }

        let parts: Vec<&str> = r.time.split(':').collect();
        if parts.len() != 2 {
            continue;
        }
        let target_h: u32 = parts[0].parse().unwrap_or(0);
        let target_m: u32 = parts[1].parse().unwrap_or(0);

        if current_hm < (target_h, target_m) {
            continue;
        }

        let key = format!("{}@{}:{}", id, today_str, r.offset_days);

        let mut fired_rows = match conn.query(
            "SELECT 1 FROM task_reminder_fired WHERE key = ?1",
            libsql::params![key.clone()],
        ).await {
            Ok(r) => r,
            Err(_) => continue,
        };

        if let Ok(Some(_)) = fired_rows.next().await {
            continue;
        }

        let now_ms = now_local.timestamp_millis();
        let _ = conn.execute(
            "INSERT OR REPLACE INTO task_reminder_fired (key, fired_at) VALUES (?1, ?2)",
            libsql::params![key, now_ms],
        ).await;

        let days_left = (target_date - today).num_days();
        let body = build_deadline_body(&title, target_date, deadline, days_left);

        let res = app_handle
            .notification()
            .builder()
            .title("⏰ 任务提醒")
            .body(&body)
            .show();

        if let Err(e) = res {
            eprintln!("[ReminderScheduler] Failed to send OS notification for task '{}': {}", id, e);
        } else {
            println!("[ReminderScheduler] Sent notification for task '{}': {}", title, body);
        }
    }

    let cutoff = (now_local - chrono::Duration::days(14)).timestamp_millis();
    let _ = conn.execute(
        "DELETE FROM task_reminder_fired WHERE fired_at < ?1",
        libsql::params![cutoff],
    ).await;
}

pub fn start_reminder_scheduler(app_handle: AppHandle, turso: TursoDb) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            check_and_send_reminders(&app_handle, &turso).await;
        }
    });
}
