// Unified command error type. Tauri serializes command errors to the frontend,
// so AppError carries a display message and implements Serialize.
// All `#[tauri::command]` fns return `AppResult<T>` and use `?` instead of
// scattering `.map_err(|e| e.to_string())` at every call site.

use serde::{Serialize, Serializer};

#[derive(Debug)]
pub struct AppError(pub String);

pub type AppResult<T> = Result<T, AppError>;

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(msg: String) -> Self {
        AppError(msg)
    }
}

impl From<&str> for AppError {
    fn from(msg: &str) -> Self {
        AppError(msg.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError(e.to_string())
    }
}
