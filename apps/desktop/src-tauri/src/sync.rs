// Shared sync helpers: canonical timestamp formatting used across features.

/// Canonical storage timestamp: UTC `YYYY-MM-DD HH:MM:SS.mmm`.
pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// Current UNIX timestamp in milliseconds.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}


