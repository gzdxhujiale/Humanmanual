// Unified command error type. Tauri serializes command errors to the frontend,
// so AppError carries a kind + display message and implements Serialize as
// `{ kind, message }` — the frontend reads `err.message` for display and can
// branch on `err.kind` ("db" | "io" | "serde" | "network" | "not_found" | "other").
// All `#[tauri::command]` fns return `AppResult<T>` and use `?` instead of
// scattering `.map_err(|e| e.to_string())` at every call site.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug)]
pub enum AppError {
    Db(String),
    Io(String),
    Serde(String),
    Network(String),
    NotFound(String),
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Db(_) => "db",
            AppError::Io(_) => "io",
            AppError::Serde(_) => "serde",
            AppError::Network(_) => "network",
            AppError::NotFound(_) => "not_found",
            AppError::Other(_) => "other",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            AppError::Db(m)
            | AppError::Io(m)
            | AppError::Serde(m)
            | AppError::Network(m)
            | AppError::NotFound(m)
            | AppError::Other(m) => m,
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind(), self.message())
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", self.message())?;
        s.end()
    }
}

impl From<libsql::Error> for AppError {
    fn from(e: libsql::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serde(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(msg: String) -> Self {
        AppError::Other(msg)
    }
}

impl From<&str> for AppError {
    fn from(msg: &str) -> Self {
        AppError::Other(msg.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Network(e.to_string())
    }
}
