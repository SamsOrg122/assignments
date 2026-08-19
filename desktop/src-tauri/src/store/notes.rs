//! Reading and writing notes.
//!
//! Every function here takes an open connection and returns a `Result<_,
//! String>` whose error is a sentence rather than a type. The only reader of
//! these errors is a 340-pixel-wide window, and "UNIQUE constraint failed:
//! notes.id" tells the person holding it nothing they can act on.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// A note, as it crosses to the window.
///
/// No title field. The title is the first line of the body, worked out where
/// it is displayed — storing it separately means two things that must agree
/// and one day will not.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub body: String,
    /// Milliseconds since the epoch.
    pub updated_at: i64,
}

/// Ten characters of the same alphabet the web app uses.
///
/// Deliberately the same shape: `[A-Za-z0-9_-]{10}` passes the id constraint
/// on the server, so a note made offline on a laptop needs no translation to
/// become a row in the account later. An id the server would refuse is a note
/// that syncs on the day it is written and never again.
const ALPHABET: [char; 64] = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
    'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4',
    '5', '6', '7', '8', '9', '_', '-',
];

pub fn new_id() -> String {
    nanoid::nanoid!(10, &ALPHABET)
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Every note that has not been deleted, newest first.
pub fn list(connection: &Connection) -> Result<Vec<Note>, String> {
    let mut statement = connection
        .prepare(
            "select id, body, updated_at
               from notes
              where deleted_at is null
              order by updated_at desc",
        )
        .map_err(|e| format!("could not read the notes: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                body: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("could not read the notes: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("a note could not be read: {e}"))
}

pub fn get(connection: &Connection, id: &str) -> Result<Option<Note>, String> {
    connection
        .query_row(
            "select id, body, updated_at from notes where id = ?1 and deleted_at is null",
            [id],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    body: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("could not read that note: {e}"))
}

pub fn create(connection: &Connection) -> Result<Note, String> {
    let note = Note {
        id: new_id(),
        body: String::new(),
        updated_at: now_ms(),
    };
    connection
        .execute(
            "insert into notes (id, body, updated_at) values (?1, ?2, ?3)",
            rusqlite::params![note.id, note.body, note.updated_at],
        )
        .map_err(|e| format!("could not start a new note: {e}"))?;
    Ok(note)
}

/// Write a note's body, and return what is now on disk.
///
/// An insert-or-update rather than an update, so a save can never fail on the
/// grounds that the row is missing. The window is the only writer, but the
/// row it is writing to could have been removed by a delete that raced it,
/// and losing what somebody typed to win an argument about ordering is not a
/// trade worth making.
///
/// Writing to a deleted note un-deletes it, for the same reason: continuing
/// to type in something is a decision to keep it.
pub fn save(connection: &Connection, id: &str, body: &str) -> Result<Note, String> {
    let updated_at = now_ms();
    connection
        .execute(
            "insert into notes (id, body, updated_at) values (?1, ?2, ?3)
             on conflict(id) do update set
               body       = excluded.body,
               updated_at = excluded.updated_at,
               deleted_at = null",
            rusqlite::params![id, body, updated_at],
        )
        .map_err(|e| format!("could not save that note: {e}"))?;

    Ok(Note {
        id: id.to_string(),
        body: body.to_string(),
        updated_at,
    })
}

/// Mark a note deleted without removing the row.
pub fn delete(connection: &Connection, id: &str) -> Result<(), String> {
    let now = now_ms();
    connection
        .execute(
            "update notes set deleted_at = ?2, updated_at = ?2 where id = ?1 and deleted_at is null",
            rusqlite::params![id, now],
        )
        .map_err(|e| format!("could not delete that note: {e}"))?;
    Ok(())
}

/// Bring a deleted note back. The tombstone is what makes this possible.
pub fn restore(connection: &Connection, id: &str) -> Result<Option<Note>, String> {
    connection
        .execute(
            "update notes set deleted_at = null, updated_at = ?2 where id = ?1",
            rusqlite::params![id, now_ms()],
        )
        .map_err(|e| format!("could not restore that note: {e}"))?;
    get(connection, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::store::migrate_for_tests(&c);
        c
    }

    #[test]
    fn an_id_is_one_the_server_would_accept() {
        // The exact shape migration 0003 put on `projects.id`. A desktop note
        // that cannot become a row is a note that syncs once and then never.
        let shape = regex_lite_matches;
        for _ in 0..200 {
            let id = new_id();
            assert_eq!(id.chars().count(), 10, "wrong length: {id}");
            assert!(shape(&id), "an id the server would refuse: {id}");
        }
    }

    /// `[A-Za-z0-9_-]{8,64}`, without pulling in a regex crate for one check.
    fn regex_lite_matches(id: &str) -> bool {
        (8..=64).contains(&id.chars().count())
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    }

    #[test]
    fn ids_do_not_collide() {
        use std::collections::HashSet;
        let ids: HashSet<String> = (0..5_000).map(|_| new_id()).collect();
        assert_eq!(ids.len(), 5_000, "two notes were given the same id");
    }

    #[test]
    fn a_saved_note_comes_back() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "buy milk").unwrap();
        let back = get(&c, &note.id).unwrap().expect("it is still there");
        assert_eq!(back.body, "buy milk");
    }

    #[test]
    fn saving_the_same_note_twice_leaves_one_note() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "first").unwrap();
        save(&c, &note.id, "second").unwrap();
        let all = list(&c).unwrap();
        assert_eq!(all.len(), 1, "autosave made {} notes", all.len());
        assert_eq!(all[0].body, "second");
    }

    #[test]
    fn saving_a_note_that_is_gone_still_keeps_what_was_typed() {
        // The race: a delete lands between a keystroke and the debounced
        // write. The typing must win — it is the newer intent, and it is the
        // one that cannot be recovered.
        let c = scratch();
        let note = create(&c).unwrap();
        delete(&c, &note.id).unwrap();
        save(&c, &note.id, "still wanted").unwrap();
        let back = get(&c, &note.id).unwrap().expect("un-deleted by the write");
        assert_eq!(back.body, "still wanted");
    }

    #[test]
    fn deleting_leaves_a_tombstone_rather_than_a_hole() {
        let c = scratch();
        let note = create(&c).unwrap();
        delete(&c, &note.id).unwrap();
        assert!(get(&c, &note.id).unwrap().is_none(), "still listed");
        let rows: i64 = c
            .query_row("select count(*) from notes where id = ?1", [&note.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(rows, 1, "the row was removed; sync could not tell why");
    }

    #[test]
    fn a_deleted_note_can_come_back() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "not rubbish after all").unwrap();
        delete(&c, &note.id).unwrap();
        let back = restore(&c, &note.id).unwrap().expect("restored");
        assert_eq!(back.body, "not rubbish after all");
    }

    #[test]
    fn the_list_is_newest_first() {
        let c = scratch();
        let a = create(&c).unwrap();
        let b = create(&c).unwrap();
        // Two notes made in the same millisecond would tie, which is a real
        // possibility on a fast machine — so order them explicitly rather
        // than sleeping and hoping.
        c.execute("update notes set updated_at = 1000 where id = ?1", [&a.id])
            .unwrap();
        c.execute("update notes set updated_at = 2000 where id = ?1", [&b.id])
            .unwrap();
        let all = list(&c).unwrap();
        assert_eq!(all[0].id, b.id, "the one just touched is not at the top");
    }

    #[test]
    fn every_save_moves_the_clock_forward() {
        // `updated_at` is what last-write-wins will compare in step 4. A save
        // that does not move it is a save the other machine will ignore.
        let c = scratch();
        let note = create(&c).unwrap();
        c.execute("update notes set updated_at = 1 where id = ?1", [&note.id])
            .unwrap();
        let saved = save(&c, &note.id, "newer").unwrap();
        assert!(saved.updated_at > 1, "the clock did not move");
    }
}
