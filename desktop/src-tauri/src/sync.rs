//! Getting notes to the account, and back.
//!
//! The rule this obeys, and the reason the whole app is shaped the way it is:
//! **nothing here is ever between a keystroke and the disk.** The window
//! writes to SQLite and stops. This runs afterwards, on its own, and if it
//! cannot reach the network it simply does not run — the note is already
//! safe, and the queue is a column in the table rather than a thing that can
//! be lost when the app closes.
//!
//! One round is: send everything this machine has that the account has not
//! been told about, then take everything the account has that is newer than
//! what is here. Conflicts are settled by `updated_at`, last write wins. That
//! is a real choice with a real cost — two people editing the same note on
//! two machines at once will lose one of the edits — and it is the right cost
//! for a sticky note, where the alternative is a merge algorithm nobody asked
//! for on something that is usually one line long.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::auth::{commands::access_token, gotrue::Config, Auth};
use crate::store::{notes, Store};

/// How the window is told where things stand.
#[derive(Debug, Clone, Serialize, Default)]
pub struct Standing {
    /// Notes written here that the account has not been told about yet.
    pub waiting: i64,
    /// When the last round finished, in milliseconds. Zero if never.
    pub at: i64,
    /// Why the last round did not finish, if it did not.
    pub problem: Option<String>,
    /// True while a round is running.
    pub running: bool,
}

/// A note as the account holds it.
#[derive(Debug, Deserialize)]
struct Row {
    id: String,
    #[serde(default)]
    body: String,
    updated_at: String,
    #[serde(default)]
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct Outgoing {
    id: String,
    body: String,
    updated_at: String,
    deleted_at: Option<String>,
}

pub const CHANGED_EVENT: &str = "notes:changed";
pub const SYNC_EVENT: &str = "sync:standing";

/// Do one round. Quiet when there is nothing to do or nobody signed in.
///
/// Returns `Ok(true)` when something on this machine changed as a result, so
/// the caller knows whether the window needs to reload its list.
pub async fn once<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let config = {
        let auth = app.state::<Auth>();
        let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        // Not signed in, or the site was never reached. Neither is an error:
        // the app works without an account, and saying so on a timer every
        // thirty seconds would be noise.
        if state.session.is_none() {
            return Ok(false);
        }
        state.config.clone()
    };
    let Some(config) = config else {
        return Ok(false);
    };

    let token = access_token(app).await?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("could not start the network client: {e}"))?;

    push(app, &client, &config, &token).await?;
    push_files(app, &client, &config, &token).await?;
    pull(app, &client, &config, &token).await
}

/// Send what this machine has and the account has not been told about.
///
/// Tombstones go too. A note deleted here has to be deleted there, and the
/// only way to say "this is gone" is to send the row saying so.
async fn push<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    config: &Config,
    token: &str,
) -> Result<(), String> {
    let pending = {
        let store = app.state::<Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        notes::unsent(&connection)?
    };
    if pending.is_empty() {
        return Ok(());
    }

    let outgoing: Vec<Outgoing> = pending
        .iter()
        .map(|note| Outgoing {
            id: note.id.clone(),
            body: note.body.clone(),
            updated_at: as_timestamp(note.updated_at),
            deleted_at: note.deleted_at.map(as_timestamp),
        })
        .collect();

    let response = client
        .post(format!(
            "{}/rest/v1/notes",
            config.url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        // Upsert. The account may already hold a copy of this note from
        // another machine, and the id is the same everywhere.
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(&outgoing)
        .send()
        .await
        .map_err(|e| format!("Could not reach your account: {e}"))?;

    if !response.status().is_success() {
        return Err(refusal(response).await);
    }

    // Only now, and stamped with what was actually sent rather than with the
    // clock — a keystroke that landed while this was in flight has to stay
    // queued. See `mark_sent`.
    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
    for note in &pending {
        notes::mark_sent(&connection, &note.id, note.updated_at)?;
    }
    Ok(())
}

/// Send dropped files up, one at a time.
///
/// One at a time rather than batched, unlike notes: a file is megabytes
/// where a note is bytes, and a batch where one file trips the account's
/// size cap would fail all of them with an error naming none.
async fn push_files<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    config: &Config,
    token: &str,
) -> Result<(), String> {
    use base64::Engine;

    let pending = {
        let store = app.state::<Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        crate::store::files::unsent(&connection)?
    };

    for file in pending {
        let body = serde_json::json!({
            "id": file.id,
            "name": file.name,
            "mime": file.mime,
            "size": file.content.len(),
            "content_b64": base64::engine::general_purpose::STANDARD.encode(&file.content),
            "updated_at": as_timestamp(file.updated_at),
            "deleted_at": null,
        });
        let response = client
            .post(format!(
                "{}/rest/v1/kit_files",
                config.url.trim_end_matches('/')
            ))
            .header("apikey", &config.anon_key)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Could not reach your account: {e}"))?;

        if !response.status().is_success() {
            return Err(refusal(response).await);
        }

        let store = app.state::<Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        crate::store::files::mark_sent(&connection, &file.id, file.updated_at)?;
    }
    Ok(())
}

/// Take what the account has that is newer than what is here.
///
/// Everything, every round. A note is a few hundred bytes and there are tens
/// of them, so the bookkeeping needed to ask for "only what changed" would
/// cost more than it saves — and getting that bookkeeping wrong loses notes,
/// where getting this wrong costs a few kilobytes.
async fn pull<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    config: &Config,
    token: &str,
) -> Result<bool, String> {
    let response = client
        .get(format!(
            "{}/rest/v1/notes?select=id,body,updated_at,deleted_at",
            config.url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Could not reach your account: {e}"))?;

    if !response.status().is_success() {
        return Err(refusal(response).await);
    }

    let rows: Vec<Row> = response
        .json()
        .await
        .map_err(|e| format!("Your account sent notes this app could not read: {e}"))?;

    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
    let mut changed = false;
    for row in rows {
        let Some(updated_at) = as_millis(&row.updated_at) else {
            continue;
        };
        let deleted_at = row.deleted_at.as_deref().and_then(as_millis);
        if notes::accept_remote(&connection, &row.id, &row.body, updated_at, deleted_at)? {
            changed = true;
        }
    }
    Ok(changed)
}

async fn refusal(response: reqwest::Response) -> String {
    let status = response.status();
    let said = response.text().await.unwrap_or_default();
    // PostgREST returns a JSON object with a `message`; anything else is
    // shown as it came, because a truncated error helps nobody.
    serde_json::from_str::<serde_json::Value>(&said)
        .ok()
        .and_then(|v| {
            v.get("message")
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("Your account refused the change ({status})."))
}

/// Milliseconds to the timestamp Postgres wants.
///
/// Hand-built rather than pulling in a date library for one format. UTC, with
/// milliseconds kept — dropping them would collapse two edits a few
/// milliseconds apart into the same instant, which is exactly the tie that
/// last-write-wins cannot break.
fn as_timestamp(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60,
    )
}

/// The other direction, for what comes back.
fn as_millis(timestamp: &str) -> Option<i64> {
    let bytes = timestamp.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let n = |from: usize, to: usize| timestamp.get(from..to)?.parse::<i64>().ok();
    let (year, month, day) = (n(0, 4)?, n(5, 7)?, n(8, 10)?);
    let (hour, minute, second) = (n(11, 13)?, n(14, 16)?, n(17, 19)?);

    // Postgres writes as many fractional digits as it has, or none at all.
    let millis = timestamp
        .get(19..)
        .and_then(|tail| tail.strip_prefix('.'))
        .map(|tail| {
            let digits: String = tail.chars().take_while(char::is_ascii_digit).collect();
            let mut padded = format!("{digits:0<3}");
            padded.truncate(3);
            padded.parse::<i64>().unwrap_or(0)
        })
        .unwrap_or(0);

    let days = days_from_civil(year, month, day);
    Some(((days * 86_400) + hour * 3600 + minute * 60 + second) * 1000 + millis)
}

/// Days since 1970-01-01 from a calendar date, and back.
///
/// Howard Hinnant's `days_from_civil`, which is the standard answer and is
/// correct for every date this will ever see. Written out rather than taken
/// as a dependency: it is twenty lines, and it is the only calendar maths
/// here.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Read where things stand, for the line along the bottom of the window.
pub fn standing<R: Runtime>(app: &AppHandle<R>, at: i64, problem: Option<String>) -> Standing {
    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
    Standing {
        waiting: notes::waiting(&connection).unwrap_or(0)
            + crate::store::files::waiting(&connection).unwrap_or(0),
        at,
        problem,
        running: false,
    }
}

/// Tell the window what happened.
pub fn announce<R: Runtime>(app: &AppHandle<R>, changed: bool, standing: Standing) {
    if changed {
        let _ = app.emit(CHANGED_EVENT, ());
    }
    let _ = app.emit(SYNC_EVENT, standing);
}

/* ── When it runs ────────────────────────────────────────────────────── */

/// The beat, and the nudge.
///
/// A timer rather than a connectivity API: "is there internet" has no honest
/// answer that is not "try it and see", and every platform lies about it
/// differently. So this tries, and a failure is just a round that did
/// nothing — the note is already on disk, which is the only thing that had to
/// happen.
///
/// The beat is slow and the nudge is what makes it feel immediate: saving a
/// note wakes the loop, and it settles again afterwards. Between them, a note
/// typed on one machine is on the other within a couple of seconds, and a
/// machine sitting idle overnight makes about a hundred requests instead of a
/// hundred thousand.
const BEAT: std::time::Duration = std::time::Duration::from_secs(60);
const AFTER_A_CHANGE: std::time::Duration = std::time::Duration::from_secs(2);
/// How long to wait after a failure before trying again, and the ceiling.
const FIRST_RETRY: std::time::Duration = std::time::Duration::from_secs(5);
const LONGEST_RETRY: std::time::Duration = std::time::Duration::from_secs(300);

/// Ask for a round soon. Called after anything that changes a note.
pub fn nudge<R: Runtime>(app: &AppHandle<R>) {
    if let Some(nudge) = app.try_state::<Nudge>() {
        // A send that fails means the loop is already awake with a nudge
        // waiting, which is the same outcome.
        let _ = nudge.0.try_send(());
    }
}

/// The end the loop listens on.
pub struct Nudge(pub tokio::sync::mpsc::Sender<()>);

/// Start the loop. Runs for the life of the app.
pub fn keep_in_step<R: Runtime>(app: &AppHandle<R>) {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<()>(1);
    app.manage(Nudge(tx));

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut wait = BEAT;
        let mut failures: u32 = 0;

        loop {
            // Whichever comes first: the beat, or somebody typing.
            let nudged = tokio::time::timeout(wait, rx.recv()).await.is_ok();
            if nudged {
                // Let the autosave finish before asking what needs sending,
                // or the first round after a keystroke always misses it and
                // the next beat is a minute away.
                tokio::time::sleep(AFTER_A_CHANGE).await;
                // Drain anything that arrived while waiting, so a burst of
                // typing is one round rather than one round per keystroke.
                while rx.try_recv().is_ok() {}
            }

            match once(&app).await {
                Ok(changed) => {
                    failures = 0;
                    wait = BEAT;
                    let standing = standing(&app, crate::store::notes::now_ms(), None);
                    announce(&app, changed, standing);
                }
                Err(problem) => {
                    // Offline, most of the time. Back off rather than
                    // hammering a network that is not there, and tell the
                    // window so the footer can stop claiming to be current.
                    failures = failures.saturating_add(1);
                    wait = (FIRST_RETRY * 2_u32.saturating_pow(failures.min(6))).min(LONGEST_RETRY);
                    let standing = standing(&app, 0, Some(problem));
                    announce(&app, false, standing);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timestamp_survives_the_round_trip() {
        for ms in [
            0_i64,
            1,
            1_000,
            1_787_125_705_821,
            946_684_800_000,
            2_000_000_000_123,
        ] {
            let text = as_timestamp(ms);
            assert_eq!(as_millis(&text), Some(ms), "{ms} became {text}");
        }
    }

    #[test]
    fn a_known_instant_is_written_the_way_postgres_writes_it() {
        // 2020-01-01T00:00:00.000Z
        assert_eq!(as_timestamp(1_577_836_800_000), "2020-01-01T00:00:00.000Z");
        // A leap day, because February is where calendar maths goes wrong.
        assert_eq!(as_timestamp(1_582_934_400_000), "2020-02-29T00:00:00.000Z");
    }

    #[test]
    fn milliseconds_are_kept_rather_than_rounded_away() {
        // Two edits a few milliseconds apart must not collapse into the same
        // instant — that is precisely the tie last-write-wins cannot break.
        let a = as_timestamp(1_700_000_000_001);
        let b = as_timestamp(1_700_000_000_009);
        assert_ne!(a, b);
        assert!(as_millis(&a).unwrap() < as_millis(&b).unwrap());
    }

    #[test]
    fn the_shapes_postgres_actually_sends_are_all_understood() {
        // It writes as many fractional digits as it has, and none when there
        // are none. Every one of these has to come back as the same instant.
        assert_eq!(
            as_millis("2024-03-01T12:00:00Z"),
            as_millis("2024-03-01T12:00:00.000Z")
        );
        assert_eq!(
            as_millis("2024-03-01T12:00:00.5Z"),
            as_millis("2024-03-01T12:00:00.500Z")
        );
        assert_eq!(
            as_millis("2024-03-01T12:00:00.123456Z"),
            as_millis("2024-03-01T12:00:00.123Z")
        );
        // And the space-separated form, which PostgREST uses in some versions.
        assert_eq!(
            as_millis("2024-03-01 12:00:00.250Z"),
            as_millis("2024-03-01T12:00:00.250Z")
        );
    }

    #[test]
    fn nonsense_is_refused_rather_than_turned_into_1970() {
        // A note stamped 1970 would lose every comparison for ever, so a
        // timestamp that cannot be read must be skipped, not guessed.
        assert_eq!(as_millis(""), None);
        assert_eq!(as_millis("yesterday"), None);
        assert_eq!(as_millis("2024-03-01"), None);
    }
}
