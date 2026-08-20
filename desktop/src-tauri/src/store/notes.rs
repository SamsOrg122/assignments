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

/// The wall clock, forced to move forward.
///
/// Two problems, one answer.
///
/// The first is that a millisecond is a long time. Saving a note and then
/// deleting it can easily happen inside one, and both would carry the same
/// `updated_at` — so the deletion would not be newer than the last thing
/// synced, and would never be sent. The note comes back from the other
/// machine, for ever. This was found by a test that looked like a flake and
/// was not.
///
/// The second is that wall clocks go backwards: an NTP correction, a laptop
/// waking up, somebody fixing their timezone by changing the clock. Every
/// edit made during that window would look older than edits that came before
/// it, and last-write-wins would throw them away.
///
/// So the value never repeats and never decreases within a run. It stays a
/// wall-clock time — the other machine has to be able to compare it — but it
/// is a wall clock that has been told it may only go one way.
pub fn now_ms() -> i64 {
    use std::sync::atomic::{AtomicI64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static LAST: AtomicI64 = AtomicI64::new(0);

    let wall = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let mut last = LAST.load(Ordering::Acquire);
    loop {
        let next = if wall > last { wall } else { last + 1 };
        match LAST.compare_exchange(last, next, Ordering::AcqRel, Ordering::Acquire) {
            Ok(_) => return next,
            Err(now) => last = now,
        }
    }
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

/* ── What sync needs from the store ──────────────────────────────────── */

/// A note plus the bookkeeping sync cares about.
#[derive(Debug, Clone)]
pub struct Pending {
    pub id: String,
    pub body: String,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// Everything this machine has that the account has not been told about.
///
/// Tombstones included, and that is the point: a note deleted here must be
/// deleted on the other machine too, and the only way to say so is to send
/// the tombstone.
pub fn unsent(connection: &Connection) -> Result<Vec<Pending>, String> {
    let mut statement = connection
        .prepare(
            "select id, body, updated_at, deleted_at
               from notes
              where updated_at > coalesce(synced_at, 0)
              order by updated_at",
        )
        .map_err(|e| format!("could not work out what still needs sending: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Pending {
                id: row.get(0)?,
                body: row.get(1)?,
                updated_at: row.get(2)?,
                deleted_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("could not work out what still needs sending: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("a note could not be read: {e}"))
}

/// Record that a note reached the account as it stood at `updated_at`.
///
/// Stamped with the value that was *sent*, not with the clock now. A
/// keystroke that landed while the push was in flight leaves `updated_at`
/// ahead of `synced_at`, which is exactly right: that note still needs
/// sending. Stamping "now" would mark the newer text as already sent and lose
/// it silently.
pub fn mark_sent(connection: &Connection, id: &str, sent_at: i64) -> Result<(), String> {
    connection
        .execute(
            "update notes set synced_at = ?2 where id = ?1",
            rusqlite::params![id, sent_at],
        )
        .map_err(|e| format!("could not record that note as sent: {e}"))?;
    Ok(())
}

/// Take a note from the account, if it is newer than what is here.
///
/// Last-write-wins on `updated_at`, and a tie leaves the local copy alone —
/// the two are equal by the only measure there is, so churning the disk and
/// the screen for it would be noise.
///
/// Returns whether anything changed, so the window is only told to reload
/// when there is something to reload.
pub fn accept_remote(
    connection: &Connection,
    id: &str,
    body: &str,
    updated_at: i64,
    deleted_at: Option<i64>,
) -> Result<bool, String> {
    let mine: Option<i64> = connection
        .query_row("select updated_at from notes where id = ?1", [id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("could not compare that note: {e}"))?;

    if let Some(mine) = mine {
        if mine >= updated_at {
            return Ok(false);
        }
    }

    connection
        .execute(
            "insert into notes (id, body, updated_at, deleted_at, synced_at)
             values (?1, ?2, ?3, ?4, ?3)
             on conflict(id) do update set
               body       = excluded.body,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at,
               synced_at  = excluded.synced_at",
            rusqlite::params![id, body, updated_at, deleted_at],
        )
        .map_err(|e| format!("could not save the note from your account: {e}"))?;
    Ok(true)
}

/// How many notes are waiting to be sent, for the line along the bottom.
pub fn waiting(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "select count(*) from notes where updated_at > coalesce(synced_at, 0)",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("could not count what is waiting: {e}"))
}

/// Forget every sync stamp, so the next round sends everything again.
///
/// Used when the account changes: notes written while signed in as one person
/// have not been sent to the other, whatever the stamps say.
pub fn forget_sync_state(connection: &Connection) -> Result<(), String> {
    connection
        .execute("update notes set synced_at = null", [])
        .map_err(|e| format!("could not reset the sync state: {e}"))?;
    Ok(())
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
    fn the_clock_never_repeats_itself() {
        // Saving and then deleting inside one millisecond gave both the same
        // stamp, so the deletion was never newer than the last thing sent and
        // never went up. A thousand calls in a row must give a thousand
        // different answers.
        let mut seen = std::collections::HashSet::new();
        let mut previous = 0;
        for _ in 0..1_000 {
            let now = now_ms();
            assert!(now > previous, "the clock went backwards: {previous} then {now}");
            assert!(seen.insert(now), "the clock repeated {now}");
            previous = now;
        }
    }

    #[test]
    fn a_new_note_is_waiting_to_be_sent() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "unsent").unwrap();
        let pending = unsent(&c).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].body, "unsent");
    }

    #[test]
    fn a_sent_note_stops_being_waiting() {
        let c = scratch();
        let note = create(&c).unwrap();
        let saved = save(&c, &note.id, "sent").unwrap();
        mark_sent(&c, &note.id, saved.updated_at).unwrap();
        assert!(unsent(&c).unwrap().is_empty(), "still queued after sending");
        assert_eq!(waiting(&c).unwrap(), 0);
    }

    #[test]
    fn typing_during_a_push_is_not_marked_as_sent() {
        // The race that loses a sentence: a push is in flight, a keystroke
        // lands, the push returns. Stamping "now" would mark the newer text
        // as already sent and it would never go up. Stamping what was
        // actually sent leaves it queued.
        let c = scratch();
        let note = create(&c).unwrap();
        let pushed = save(&c, &note.id, "what went up").unwrap();
        // …meanwhile:
        c.execute(
            "update notes set body = 'typed while it flew', updated_at = ?2 where id = ?1",
            rusqlite::params![note.id, pushed.updated_at + 5],
        )
        .unwrap();
        mark_sent(&c, &note.id, pushed.updated_at).unwrap();

        let still = unsent(&c).unwrap();
        assert_eq!(still.len(), 1, "the newer text was marked as sent");
        assert_eq!(still[0].body, "typed while it flew");
    }

    #[test]
    fn a_deleted_note_is_still_sent() {
        // Otherwise the note comes back from the other machine, for ever.
        let c = scratch();
        let note = create(&c).unwrap();
        let saved = save(&c, &note.id, "gone").unwrap();
        mark_sent(&c, &note.id, saved.updated_at).unwrap();
        delete(&c, &note.id).unwrap();

        let pending = unsent(&c).unwrap();
        assert_eq!(pending.len(), 1, "the deletion was not queued");
        assert!(pending[0].deleted_at.is_some(), "the tombstone was not carried");
    }

    #[test]
    fn a_newer_note_from_the_account_wins() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "mine").unwrap();
        c.execute("update notes set updated_at = 1000 where id = ?1", [&note.id])
            .unwrap();

        let changed = accept_remote(&c, &note.id, "theirs, and newer", 2000, None).unwrap();
        assert!(changed);
        assert_eq!(get(&c, &note.id).unwrap().unwrap().body, "theirs, and newer");
    }

    #[test]
    fn an_older_note_from_the_account_is_ignored() {
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "mine, and newer").unwrap();
        c.execute("update notes set updated_at = 5000 where id = ?1", [&note.id])
            .unwrap();

        let changed = accept_remote(&c, &note.id, "theirs, stale", 1000, None).unwrap();
        assert!(!changed, "a stale copy overwrote a newer one");
        assert_eq!(get(&c, &note.id).unwrap().unwrap().body, "mine, and newer");
    }

    #[test]
    fn a_tie_leaves_the_local_copy_alone() {
        // Equal by the only measure there is. Rewriting the row would churn
        // the disk and reload the window for nothing.
        let c = scratch();
        let note = create(&c).unwrap();
        save(&c, &note.id, "same").unwrap();
        c.execute("update notes set updated_at = 4242 where id = ?1", [&note.id])
            .unwrap();
        assert!(!accept_remote(&c, &note.id, "also same", 4242, None).unwrap());
        assert_eq!(get(&c, &note.id).unwrap().unwrap().body, "same");
    }

    #[test]
    fn a_note_this_machine_has_never_seen_arrives() {
        let c = scratch();
        assert!(accept_remote(&c, "FromAnother1", "written elsewhere", 1234, None).unwrap());
        assert_eq!(list(&c).unwrap().len(), 1);
    }

    #[test]
    fn a_note_accepted_from_the_account_is_not_sent_straight_back() {
        // It came from up there. Queueing it would make every sync round
        // bounce every note back and forth for ever.
        let c = scratch();
        accept_remote(&c, "FromAnother1", "written elsewhere", 1234, None).unwrap();
        assert!(unsent(&c).unwrap().is_empty(), "an incoming note was queued for sending");
    }

    #[test]
    fn a_deletion_from_the_account_removes_it_here() {
        let c = scratch();
        accept_remote(&c, "FromAnother1", "written elsewhere", 1000, None).unwrap();
        accept_remote(&c, "FromAnother1", "", 2000, Some(2000)).unwrap();
        assert!(get(&c, "FromAnother1").unwrap().is_none(), "still listed after a remote delete");
    }

    #[test]
    fn changing_account_makes_everything_unsent_again() {
        // Notes written while signed in as one person have not been sent to
        // the other, whatever the stamps say.
        let c = scratch();
        let note = create(&c).unwrap();
        let saved = save(&c, &note.id, "under the old account").unwrap();
        mark_sent(&c, &note.id, saved.updated_at).unwrap();
        assert_eq!(waiting(&c).unwrap(), 0);

        forget_sync_state(&c).unwrap();
        assert_eq!(waiting(&c).unwrap(), 1);
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
