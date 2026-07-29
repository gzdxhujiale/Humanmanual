// TursoDb: Tauri-managed state wrapping a libsql::Database.
// All Tauri command handlers that need DB access accept `State<'_, TursoDb>`
// and call `.conn()` to get a fresh connection for the request.

use std::sync::Arc;
use libsql::Database;

/// Wrapper around a libsql Database. Held as Tauri managed state.
/// Uses Arc internally so it can be cloned cheaply for background tasks.
#[derive(Clone)]
pub struct TursoDb {
    pub db: Arc<Database>,
}

impl TursoDb {
    pub fn new(db: Database) -> Self {
        Self { db: Arc::new(db) }
    }

    /// Get a new connection. Each Tauri command should call this once per invocation.
    pub fn conn(&self) -> Result<libsql::Connection, libsql::Error> {
        self.db.connect()
    }
}
