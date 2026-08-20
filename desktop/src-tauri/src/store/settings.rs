//! Small settings that belong to this machine.
//!
//! Not notes, and not the session — a handful of strings that decide how the
//! app behaves before either of those exist. Kept in the same SQLite file
//! because a second store would be a second thing to open, migrate and back
//! up for the sake of two rows.

use rusqlite::{Connection, OptionalExtension};

/// Which tougather.com to talk to.
pub const SITE: &str = "site";

pub fn get(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row("select value from settings where key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| format!("could not read that setting: {e}"))
}

pub fn set(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "insert into settings (key, value) values (?1, ?2)
             on conflict(key) do update set value = excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(|e| format!("could not save that setting: {e}"))?;
    Ok(())
}

pub fn clear(connection: &Connection, key: &str) -> Result<(), String> {
    connection
        .execute("delete from settings where key = ?1", [key])
        .map_err(|e| format!("could not clear that setting: {e}"))?;
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
    fn nothing_is_set_to_begin_with() {
        assert_eq!(get(&scratch(), SITE).unwrap(), None);
    }

    #[test]
    fn what_goes_in_comes_out() {
        let c = scratch();
        set(&c, SITE, "https://staging.example.com").unwrap();
        assert_eq!(
            get(&c, SITE).unwrap().as_deref(),
            Some("https://staging.example.com")
        );
    }

    #[test]
    fn setting_it_twice_leaves_one_row() {
        let c = scratch();
        set(&c, SITE, "https://one.example.com").unwrap();
        set(&c, SITE, "https://two.example.com").unwrap();
        let rows: i64 = c
            .query_row("select count(*) from settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
        assert_eq!(
            get(&c, SITE).unwrap().as_deref(),
            Some("https://two.example.com")
        );
    }

    #[test]
    fn clearing_goes_back_to_the_default() {
        let c = scratch();
        set(&c, SITE, "https://one.example.com").unwrap();
        clear(&c, SITE).unwrap();
        assert_eq!(get(&c, SITE).unwrap(), None);
    }
}
