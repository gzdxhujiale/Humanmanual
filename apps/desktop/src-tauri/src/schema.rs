// Single home for SQLite connection initialization and PRAGMA settings.

use libsql::Connection;

/// Apply essential connection-level SQLite PRAGMA settings.
pub async fn ensure_local_tables(conn: &Connection) -> Result<(), libsql::Error> {
    // PRAGMA journal_mode=WAL returns a result row → must use query(), not execute().
    let _ = conn.query("PRAGMA journal_mode=WAL", ()).await;
    // Set busy timeout so concurrent reads/writes wait up to 5 seconds instead of failing with "database is locked"
    let _ = conn.execute("PRAGMA busy_timeout=5000", ()).await;
    let _ = conn.execute("PRAGMA synchronous=NORMAL", ()).await;
    let _ = conn.execute("PRAGMA foreign_keys=ON", ()).await;

    Ok(())
}
