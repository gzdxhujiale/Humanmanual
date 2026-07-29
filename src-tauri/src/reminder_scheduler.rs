use chrono::{Datelike, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

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

pub async fn check_and_send_reminders(app_handle: &AppHandle, pool: &SqlitePool) {
    let rows = match sqlx::query(
        "SELECT id, title, deadline, scheduled_date, created_at, reminder 
         FROM time_management_tasks 
         WHERE completed = 0 AND deleted_at IS NULL AND reminder IS NOT NULL AND reminder != ''"
    )
    .fetch_all(pool)
    .await {
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

    for row in rows {
        let id: String = row.try_get("id").unwrap_or_default();
        let title: String = row.try_get("title").unwrap_or_default();
        let deadline: Option<i64> = row.try_get("deadline").ok();
        let scheduled_date: Option<String> = row.try_get("scheduled_date").ok();
        let created_at: i64 = row.try_get("created_at").unwrap_or(0);
        let reminder_raw: String = row.try_get("reminder").unwrap_or_default();

        let r = match parse_reminder(&reminder_raw) {
            Some(r) => r,
            None => continue,
        };

        let target_date = get_task_target_date(deadline, scheduled_date.as_deref(), created_at);
        let remind_day = target_date - chrono::Duration::days(r.offset_days);

        // Check if today is within the reminder window
        if today < remind_day || today > target_date {
            continue;
        }
        if !r.repeat && today != remind_day {
            continue;
        }

        // Parse reminder time "HH:mm"
        let parts: Vec<&str> = r.time.split(':').collect();
        if parts.len() != 2 {
            continue;
        }
        let target_h: u32 = parts[0].parse().unwrap_or(0);
        let target_m: u32 = parts[1].parse().unwrap_or(0);

        // Has the fire time arrived today?
        if current_hm < (target_h, target_m) {
            continue;
        }

        let key = format!("{}@{}:{}_{}", id, today_str, r.offset_days, r.time);

        // Check if already fired
        let fired_exists: bool = sqlx::query("SELECT 1 FROM task_reminder_fired WHERE key = ?")
            .bind(&key)
            .fetch_optional(pool)
            .await
            .map(|opt| opt.is_some())
            .unwrap_or(false);

        if fired_exists {
            continue;
        }

        // Record as fired first to avoid duplicate firing
        let now_ms = now_local.timestamp_millis();
        let _ = sqlx::query("INSERT OR REPLACE INTO task_reminder_fired (key, fired_at) VALUES (?, ?)")
            .bind(&key)
            .bind(now_ms)
            .execute(pool)
            .await;

        let days_left = (target_date - today).num_days();
        let body = build_deadline_body(&title, target_date, deadline, days_left);

        // Dispatch OS notification via tauri_plugin_notification
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

    // Clean up fired logs older than 14 days
    let cutoff = (now_local - chrono::Duration::days(14)).timestamp_millis();
    let _ = sqlx::query("DELETE FROM task_reminder_fired WHERE fired_at < ?")
        .bind(cutoff)
        .execute(pool)
        .await;
}

pub fn start_reminder_scheduler(app_handle: AppHandle, pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        // Sleep 5s initially to allow app to finish boot and SQLite setup
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            check_and_send_reminders(&app_handle, &pool).await;
        }
    });
}
