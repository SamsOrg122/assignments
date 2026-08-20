//! Files dropped on the window, kept and queued.
//!
//! The same shape as notes: written here first, pushed to the account by the
//! sync loop, tombstoned rather than deleted. The one extra rule is a size
//! cap — this is a dropbox for briefs and PDFs, not a backup tool, and a
//! two-gigabyte video would sit in the queue failing forever.

use rusqlite::Connection;

/// Per file. Base64 grows content by a third on the way up, and the account
/// table caps what it accepts — this cap is set so the encoded form still
/// fits under that one, with the refusal happening here, at drop time, where
/// the person can see it.
pub const MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct DroppedFile {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub content: Vec<u8>,
    pub updated_at: i64,
}

pub fn keep(
    connection: &Connection,
    name: &str,
    mime: &str,
    content: &[u8],
) -> Result<DroppedFile, String> {
    if content.len() > MAX_BYTES {
        return Err(format!(
            "{name} is {} MB — this keeps files up to {} MB. Bigger things belong in a project.",
            content.len() / (1024 * 1024),
            MAX_BYTES / (1024 * 1024),
        ));
    }
    if content.is_empty() {
        return Err(format!("{name} is empty, so there is nothing to keep."));
    }

    let file = DroppedFile {
        id: crate::store::notes::new_id(),
        name: name.to_string(),
        mime: mime.to_string(),
        content: content.to_vec(),
        updated_at: crate::store::notes::now_ms(),
    };
    connection
        .execute(
            "insert into files (id, name, mime, content, size, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                file.id,
                file.name,
                file.mime,
                file.content,
                file.content.len() as i64,
                file.updated_at
            ],
        )
        .map_err(|e| format!("could not keep {name}: {e}"))?;
    Ok(file)
}

/// Everything the account has not been told about yet.
pub fn unsent(connection: &Connection) -> Result<Vec<DroppedFile>, String> {
    let mut statement = connection
        .prepare(
            "select id, name, mime, content, updated_at
               from files
              where updated_at > coalesce(synced_at, 0) and deleted_at is null
              order by updated_at",
        )
        .map_err(|e| format!("could not read the file queue: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DroppedFile {
                id: row.get(0)?,
                name: row.get(1)?,
                mime: row.get(2)?,
                content: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("could not read the file queue: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("a queued file could not be read: {e}"))
}

pub fn mark_sent(connection: &Connection, id: &str, sent_at: i64) -> Result<(), String> {
    connection
        .execute(
            "update files set synced_at = ?2 where id = ?1",
            rusqlite::params![id, sent_at],
        )
        .map_err(|e| format!("could not record that file as sent: {e}"))?;
    Ok(())
}

/// How many are waiting, for the pill.
pub fn waiting(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "select count(*) from files where updated_at > coalesce(synced_at, 0) and deleted_at is null",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("could not count the file queue: {e}"))
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
    fn a_dropped_file_is_kept_and_queued() {
        let c = scratch();
        let file = keep(&c, "brief.pdf", "application/pdf", b"not really a pdf").unwrap();
        let queued = unsent(&c).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].id, file.id);
        assert_eq!(queued[0].content, b"not really a pdf");
    }

    #[test]
    fn sending_empties_the_queue_and_the_bytes_survive() {
        let c = scratch();
        let file = keep(&c, "logo.png", "image/png", &[137, 80, 78, 71]).unwrap();
        mark_sent(&c, &file.id, file.updated_at).unwrap();
        assert!(unsent(&c).unwrap().is_empty());
        assert_eq!(waiting(&c).unwrap(), 0);
        let bytes: Vec<u8> = c
            .query_row("select content from files where id = ?1", [&file.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(bytes, vec![137, 80, 78, 71]);
    }

    #[test]
    fn an_oversized_file_is_refused_at_the_door() {
        // Refused here, where the person dropping it can be told — not queued
        // to fail against the account cap forever.
        let c = scratch();
        let big = vec![0u8; MAX_BYTES + 1];
        let refused = keep(&c, "video.mp4", "video/mp4", &big).expect_err("kept");
        assert!(refused.contains("MB"), "unhelpful: {refused}");
        assert_eq!(waiting(&c).unwrap(), 0, "it was queued anyway");
    }

    #[test]
    fn an_empty_file_is_refused_with_a_reason() {
        let c = scratch();
        assert!(keep(&c, "nothing.txt", "text/plain", b"").is_err());
    }
}
