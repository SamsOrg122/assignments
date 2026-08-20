//! The local store — which is the store, not a cache of one.
//!
//! Everything typed into this window is written here first and to nothing
//! else. When sync arrives in step 4 it will read from this file and push
//! upwards; it will never be in the path between a keystroke and the disk.
//! That ordering is the whole design: a note taken on a train is not a
//! degraded version of a note taken at a desk.
//!
//! SQLite rather than a JSON file. Not for the query language — a note store
//! is four columns — but because a JSON file rewritten on every autosave is
//! one badly-timed power cut away from a zero-byte file where the notes were.
//! SQLite's write-ahead log makes a half-finished write recoverable, which is
//! the only durability property that actually matters here.

pub mod files;
pub mod notes;
pub mod settings;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

/// The open database, kept in Tauri's state so every command shares one.
///
/// A mutex rather than a pool: there is exactly one window and one user, the
/// writes are single-row, and a pool would add a dependency to solve
/// contention that cannot happen.
pub struct Store(pub Mutex<Connection>);

/// The schema, versioned by SQLite's own `user_version`.
///
/// Migrations are applied in order and never edited afterwards — the file on
/// a user's disk is the record of which ones ran, and rewriting step 1 after
/// somebody has run it means their database and this list no longer agree.
const MIGRATIONS: &[&str] = &[
    // 1
    "create table notes (
        id          text primary key,
        body        text    not null default '',
        -- Milliseconds since the epoch, and the tiebreak for last-write-wins
        -- once there are two machines. Stored as an integer so comparing two
        -- of them is comparing two numbers rather than two strings that
        -- happen to sort.
        updated_at  integer not null,
        -- A tombstone, not a hole. When sync lands, a row that is simply gone
        -- is ambiguous — deleted here, or never seen from there? — and
        -- resolving that wrongly takes somebody's note with it.
        deleted_at  integer,
        -- When this row last reached the account. Unused until step 4;
        -- carried now because adding a column to a table on other people's
        -- machines is a migration, and adding it to a table nobody has yet is
        -- a line of SQL. A note needs pushing when
        -- `updated_at > coalesce(synced_at, 0)`.
        synced_at   integer
     );
     create index notes_recent on notes(updated_at desc) where deleted_at is null;",
    // 2
    "create table settings (
        key   text primary key,
        value text not null
     );",
    // 3
    "create table files (
        id         text primary key,
        name       text not null,
        mime       text not null default '',
        -- The bytes themselves. A note store that holds files sounds odd
        -- until you remember what this is for: something dropped on the
        -- window on a train has to be *kept* before it can be sent.
        content    blob not null,
        size       integer not null,
        updated_at integer not null,
        deleted_at integer,
        synced_at  integer
     );",
];

pub fn open<R: Runtime>(app: &AppHandle<R>) -> Result<Store, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("nowhere to keep the notes: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not make {dir:?}: {e}"))?;

    let connection = Connection::open(dir.join("notes.sqlite3"))
        .map_err(|e| format!("could not open the note store: {e}"))?;

    // WAL is what makes a crash mid-write survivable, and it lets a read
    // happen while a write is in flight — which is every autosave.
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("could not turn on the write-ahead log: {e}"))?;
    // NORMAL rather than FULL: FULL fsyncs on every commit, which for an
    // autosave every 800ms is a spinning disk's worth of noise for a
    // durability guarantee WAL already gives us against everything except
    // losing power at the exact wrong microsecond.
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("could not set the sync mode: {e}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("could not turn on foreign keys: {e}"))?;

    migrate(&connection)?;
    Ok(Store(Mutex::new(connection)))
}

fn migrate(connection: &Connection) -> Result<(), String> {
    let applied: i64 = connection
        .query_row("pragma user_version", [], |row| row.get(0))
        .map_err(|e| format!("could not read the schema version: {e}"))?;

    let applied = applied.max(0) as usize;
    if applied > MIGRATIONS.len() {
        // A database written by a newer version of the app. Refusing is the
        // only safe move: running an older app against it would write rows
        // the newer schema cannot read back.
        return Err(format!(
            "this note store was made by a newer version of Tougather note \
             (schema {applied}, this build understands {})",
            MIGRATIONS.len()
        ));
    }

    for (index, statement) in MIGRATIONS.iter().enumerate().skip(applied) {
        connection
            .execute_batch(statement)
            .map_err(|e| format!("schema step {} failed: {e}", index + 1))?;
        connection
            .pragma_update(None, "user_version", (index + 1) as i64)
            .map_err(|e| format!("could not record schema step {}: {e}", index + 1))?;
    }

    Ok(())
}

/// Bring a scratch connection up to date, for the notes tests next door.
#[cfg(test)]
pub fn migrate_for_tests(connection: &Connection) {
    migrate(connection).expect("migrations run");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> Connection {
        let c = Connection::open_in_memory().expect("in-memory sqlite");
        migrate(&c).expect("migrations run");
        c
    }

    #[test]
    fn a_fresh_database_ends_up_at_the_current_version() {
        let c = scratch();
        let version: i64 = c
            .query_row("pragma user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version as usize, MIGRATIONS.len());
    }

    #[test]
    fn migrating_twice_changes_nothing() {
        // The path every launch after the first takes. If this were not true,
        // opening the app a second time would fail on `create table`.
        let c = scratch();
        migrate(&c).expect("second run is a no-op");
        let version: i64 = c
            .query_row("pragma user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version as usize, MIGRATIONS.len());
    }

    #[test]
    fn a_database_from_the_future_is_refused_rather_than_written_to() {
        let c = scratch();
        c.pragma_update(None, "user_version", 99_i64).unwrap();
        let refused = migrate(&c).expect_err("an unknown schema must not be written to");
        assert!(refused.contains("newer version"), "unhelpful: {refused}");
    }
}
