//! Start, stop, and what lands afterwards.
//!
//! The shape of a recording, end to end:
//!
//!   press Record  → cpal opens the microphone, samples pile up
//!   every 30s     → a slice is mixed, resampled, measured and posted to
//!                   `/api/listen`; the words come back and go on screen
//!   press Stop    → the last slice is sent, then the whole transcript goes to
//!                   `/api/transcript`, which writes the title, the summary,
//!                   the conclusion and the points — with every quoted fact
//!                   checked against the words before it is passed on
//!   afterwards    → the document is written into the file queue and the next
//!                   sync round carries it up, exactly as a document the
//!                   assistant makes already does
//!
//! ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────
//!
//! It does not file appointments into the agenda, and it does not because
//! `src/lib/transcript/land.ts` does — 917 lines of it, with `assertReal`, a
//! per-row refusal path, and a written account of everything it withheld and
//! why. Reimplementing that here would produce a second set of rules for
//! writing into somebody's calendar, and only one of them would be the one
//! that has been tested. The document says so on its own last line rather
//! than pretending the question did not come up.
//!
//! Two consequences worth stating: the desktop cannot put a meeting nobody
//! had into a real calendar, because it cannot put anything into a calendar
//! at all; and the appointments are not lost, they are in the document, in
//! the words they came from.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::{
    hear, open, read_back, today_here, Done, Live, Recorder, DONE_EVENT, HEARD_EVENT, LEVEL_EVENT,
    PROBLEM_EVENT, SLICE_SECS,
};
use crate::auth::{commands::access_token, Auth};
use crate::store::{files, Store};

/// Below this there is nothing worth reading back.
const SHORTEST: usize = 40;

/// Where to send it, and as whom.
///
/// Both come from the same place the sync loop's do. Not being signed in is a
/// refusal rather than a silent no-op: recording an hour of a meeting and then
/// discovering it had nowhere to go is the worst possible moment to find out.
fn destination<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let auth = app.state::<Auth>();
    let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
    if state.session.is_none() {
        return Err(
            "Sign in first. The recording is read back on tougather.com, using your own account — \
             no key is kept in this app."
                .into(),
        );
    }
    state
        .config
        .clone()
        .map(|config| config.url)
        .ok_or_else(|| "This app has not reached tougather.com yet.".to_string())
}

#[tauri::command]
pub async fn record_start<R: Runtime>(
    app: AppHandle<R>,
    recorder: State<'_, Recorder>,
) -> Result<(), String> {
    {
        let held = recorder.0.lock().unwrap_or_else(|p| p.into_inner());
        if held.is_some() {
            return Err("Already recording.".into());
        }
    }

    let site = destination(&app)?;
    let token = access_token(&app).await?;

    let stop = Arc::new(AtomicBool::new(false));
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let (rate, channels) = open(buffer.clone(), stop.clone())?;

    let heard = Arc::new(Mutex::new(String::new()));
    let live = Live {
        stop: stop.clone(),
        buffer: buffer.clone(),
        rate,
        channels,
        heard: heard.clone(),
        started: crate::store::notes::now_ms(),
    };

    /*
     * The slicing task.
     *
     * It owns nothing the audio callback touches except the buffer, and it
     * takes that only to empty it — the callback appends on a real-time thread
     * and everything expensive happens here.
     */
    let ticking = app.clone();
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                let _ = ticking.emit(PROBLEM_EVENT, format!("No network client: {error}"));
                return;
            }
        };

        while !stop.load(Ordering::Relaxed) {
            // Checked every half second rather than slept through, so pressing
            // Stop is not followed by up to thirty seconds of nothing.
            for _ in 0..(SLICE_SECS * 2) {
                if stop.load(Ordering::Relaxed) {
                    return;
                }
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }

            let raw = {
                let mut held = buffer.lock().unwrap_or_else(|p| p.into_inner());
                std::mem::take(&mut *held)
            };
            if raw.is_empty() {
                continue;
            }

            let before = heard.lock().unwrap_or_else(|p| p.into_inner()).clone();
            match hear(&client, &site, &token, &raw, rate, channels, &before).await {
                Ok(words) if !words.trim().is_empty() => {
                    let whole = {
                        let mut held = heard.lock().unwrap_or_else(|p| p.into_inner());
                        if !held.is_empty() {
                            held.push(' ');
                        }
                        held.push_str(words.trim());
                        held.clone()
                    };
                    let _ = ticking.emit(HEARD_EVENT, whole);
                }
                Ok(_) => {
                    // Silence, and silence is not news. The level meter is
                    // already telling somebody that nobody is talking.
                }
                Err(problem) => {
                    // One slice failing is not the recording failing. Said out
                    // loud, and the next slice still goes: a meeting that
                    // loses thirty seconds is worth more than one that stops
                    // at minute four.
                    let _ = ticking.emit(PROBLEM_EVENT, problem);
                }
            }
        }
    });

    // The meter, from the same buffer, so the bars move because somebody is
    // making noise rather than because a timer is running.
    let metering = app.clone();
    let watching = live.buffer.clone();
    let meter_stop = live.stop.clone();
    tauri::async_runtime::spawn(async move {
        while !meter_stop.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            let level = {
                let held = watching.lock().unwrap_or_else(|p| p.into_inner());
                // The tail only: the peak of a buffer that has been filling for
                // twenty seconds is the loudest moment of twenty seconds ago.
                let tail = held.len().saturating_sub(4_800);
                super::wav::peak(&held[tail..])
            };
            let _ = metering.emit(LEVEL_EVENT, level);
        }
    });

    *recorder.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(live);
    Ok(())
}

/// Stop, read it back, and land it as a document.
#[tauri::command]
pub async fn record_stop<R: Runtime>(
    app: AppHandle<R>,
    recorder: State<'_, Recorder>,
) -> Result<Done, String> {
    let live = {
        let mut held = recorder.0.lock().unwrap_or_else(|p| p.into_inner());
        held.take()
            .ok_or_else(|| "Nothing is recording.".to_string())?
    };
    live.stop.store(true, Ordering::Relaxed);

    let site = destination(&app)?;
    let token = access_token(&app).await?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("No network client: {e}"))?;

    // The audio thread checks its flag every 120 ms; this gives it time to
    // stop appending before the last slice is taken. Without it the final
    // sentence — routinely the one somebody actually wanted — is cut in half.
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let last = super::drain(&live);
    let before = live.heard.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if !last.is_empty() {
        match hear(
            &client,
            &site,
            &token,
            &last,
            live.rate,
            live.channels,
            &before,
        )
        .await
        {
            Ok(words) if !words.trim().is_empty() => {
                let mut held = live.heard.lock().unwrap_or_else(|p| p.into_inner());
                if !held.is_empty() {
                    held.push(' ');
                }
                held.push_str(words.trim());
            }
            Ok(_) => {}
            Err(problem) => {
                let _ = app.emit(PROBLEM_EVENT, problem);
            }
        }
    }

    let transcript = live
        .heard
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .trim()
        .to_string();
    let seconds = (crate::store::notes::now_ms() - live.started) / 1000;
    let words = transcript.split_whitespace().count();

    if transcript.len() < SHORTEST {
        let done = Done {
            name: None,
            words,
            seconds,
            note: "Nothing was said that could be made out, so no document was written.".into(),
        };
        let _ = app.emit(DONE_EVENT, done.clone());
        return Ok(done);
    }

    let reading = read_back(&client, &site, &token, &transcript, &today_here()).await?;

    let title = reading
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Recording")
        .trim()
        .to_string();

    let name = keep_document(&app, &title, &reading, &transcript)?;
    crate::sync::nudge(&app);

    let done = Done {
        name: Some(name.clone()),
        words,
        seconds,
        note: "The dates and deadlines in it are in the document, not in your agenda — \
               filing those is done on the site, where every one of them is checked \
               against the words it came from."
            .into(),
    };
    let _ = app.emit(DONE_EVENT, done.clone());
    Ok(done)
}

/// Stop and keep nothing.
#[tauri::command]
pub fn record_cancel(recorder: State<'_, Recorder>) {
    if let Some(live) = recorder.0.lock().unwrap_or_else(|p| p.into_inner()).take() {
        live.stop.store(true, Ordering::Relaxed);
    }
}

/// Whether something is being recorded right now.
#[tauri::command]
pub fn record_standing(recorder: State<'_, Recorder>) -> bool {
    recorder
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .is_some()
}

/// Escape the five characters that would otherwise be markup.
///
/// The transcript is words somebody said, and somebody saying "less than five
/// and greater than three" must not become an element. The web app sanitises
/// this again on arrival — `readArtefact` puts every block through the same
/// validator a share link goes through — and both are right: the server is
/// where an answer is shaped, not where it earns trust.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Build the document and put it in the queue the sync round already drains.
///
/// Three text blocks, in the order somebody reads them: what it was about,
/// what was said in it, and then the words themselves. The transcript comes
/// last deliberately — it is the evidence, and evidence goes under the
/// argument, not in front of it.
fn keep_document<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    reading: &serde_json::Value,
    transcript: &str,
) -> Result<String, String> {
    let artefact = serde_json::json!({
        "v": 1,
        "name": title,
        "made_at": crate::store::notes::now_ms(),
        "blocks": blocks_from(reading, transcript),
    });
    let bytes =
        serde_json::to_vec(&artefact).map_err(|e| format!("Could not write the document: {e}"))?;

    // Slashes would make a filename that is not one.
    let safe = title.replace(['/', '\\'], "-");
    let filename = format!("{safe}{}", crate::assistant::commands::ARTEFACT_SUFFIX);

    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
    files::keep(&connection, &filename, "application/json", &bytes)?;

    Ok(title.to_string())
}

/// The blocks themselves, with no app handle in sight so they can be tested.
///
/// This is the part a reader actually sees, and the part where an escaping
/// mistake would be a script tag in somebody's document — so it is separated
/// from the file writing rather than left where only a running app could
/// exercise it.
fn blocks_from(reading: &serde_json::Value, transcript: &str) -> Vec<serde_json::Value> {
    let text = |html: String| {
        serde_json::json!({
            "id": nanoid::nanoid!(12),
            "type": "text",
            "html": html,
        })
    };

    let mut blocks = Vec::new();

    if let Some(summary) = reading.get("summary").and_then(|v| v.as_str()) {
        blocks.push(text(format!(
            "<h2>What this was about</h2><p>{}</p>",
            escape(summary.trim())
        )));
    }

    // The points, each carrying the words it came from. `/api/transcript` has
    // already checked that those words really appear in the transcript, in
    // that order and next to each other — a quote a model composed is a
    // fabrication with a citation stapled to it.
    let points = reading
        .get("points")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if !points.is_empty() {
        let items: Vec<String> = points
            .iter()
            .filter_map(|point| {
                let said = point.get("text").or_else(|| point.get("title"))?.as_str()?;
                let quote = point.get("quote").and_then(|v| v.as_str());
                Some(match quote {
                    Some(quote) if !quote.trim().is_empty() => format!(
                        "<li><strong>{}</strong><br><em>“{}”</em></li>",
                        escape(said.trim()),
                        escape(quote.trim())
                    ),
                    _ => format!("<li>{}</li>", escape(said.trim())),
                })
            })
            .collect();
        if !items.is_empty() {
            blocks.push(text(format!(
                "<h2>The points</h2><ul>{}</ul>",
                items.join("")
            )));
        }
    }

    if let Some(conclusion) = reading.get("conclusion").and_then(|v| v.as_str()) {
        blocks.push(text(format!(
            "<h2>Where it landed</h2><p>{}</p>",
            escape(conclusion.trim())
        )));
    }

    // Paragraph per pause, so an hour of speech is readable rather than one
    // enormous block. Splitting on sentence ends would be wrong in every
    // language that does not end sentences with a full stop.
    let spoken: String = transcript
        .split("\n\n")
        .filter(|part| !part.trim().is_empty())
        .map(|part| format!("<p>{}</p>", escape(part.trim())))
        .collect::<Vec<_>>()
        .join("");
    blocks.push(text(format!(
        "<h2>What was said</h2>{}",
        if spoken.is_empty() {
            format!("<p>{}</p>", escape(transcript))
        } else {
            spoken
        }
    )));

    blocks.push(text(
        "<blockquote><p>Recorded on this computer and read back on tougather.com. \
         Any dates or deadlines mentioned are above, in the words they were said in — \
         nothing from this has been put in your agenda.</p></blockquote>"
            .to_string(),
    ));

    blocks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn html_of(blocks: &[serde_json::Value]) -> String {
        blocks
            .iter()
            .map(|b| b["html"].as_str().unwrap_or("").to_string())
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn reading() -> serde_json::Value {
        serde_json::json!({
            "title": "Supervision, Thursday",
            "summary": "Chapter three needs a method section before the 14th.",
            "conclusion": "She will read it over the weekend.",
            "points": [
                { "text": "Method section first", "quote": "do the method before anything else" },
                { "text": "No quote on this one" }
            ]
        })
    }

    #[test]
    fn a_reading_becomes_a_document_somebody_can_read() {
        let blocks = blocks_from(&reading(), "so the first thing is the method");
        let html = html_of(&blocks);

        // The order is the argument: what it was about, what was said in it,
        // where it landed, then the evidence.
        assert!(html.contains("What this was about"));
        assert!(html.contains("The points"));
        assert!(html.contains("Where it landed"));
        assert!(html.contains("What was said"));
        assert!(html.contains("so the first thing is the method"));

        // Every block is a text block with an id, which is what the web app's
        // share validator requires before it will adopt one.
        for block in &blocks {
            assert_eq!(block["type"], "text");
            assert!(block["id"].as_str().is_some_and(|id| id.len() >= 8));
        }
    }

    #[test]
    fn a_point_carries_the_words_it_came_from() {
        let html = html_of(&blocks_from(&reading(), "irrelevant"));
        assert!(
            html.contains("do the method before anything else"),
            "the quote is the whole reason a point can be trusted"
        );
        // And a point without one is still shown rather than dropped.
        assert!(html.contains("No quote on this one"));
    }

    #[test]
    fn somebody_saying_something_that_looks_like_markup_is_not_markup() {
        // A real sentence: "less than five and greater than three" dictated as
        // symbols, or somebody reading a tag out loud in a design review.
        let said = "he said <script>alert(1)</script> was in the file & it broke";
        let html = html_of(&blocks_from(&serde_json::json!({}), said));
        assert!(
            !html.contains("<script>"),
            "a spoken tag became a tag: {html}"
        );
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("&amp;"));
    }

    #[test]
    fn a_reading_that_came_back_empty_still_produces_the_words() {
        // Every field of the reading is optional except in practice — a model
        // that returned only a title must not produce a document with nothing
        // in it, because the transcript is the part that cannot be regenerated.
        let blocks = blocks_from(&serde_json::json!({}), "we agreed to meet on Tuesday");
        let html = html_of(&blocks);
        assert!(html.contains("we agreed to meet on Tuesday"));
        assert!(!blocks.is_empty());
    }

    #[test]
    fn the_document_says_it_did_not_touch_the_agenda() {
        let html = html_of(&blocks_from(&reading(), "anything"));
        assert!(
            html.contains("nothing from this has been put in your agenda"),
            "the one thing a reader could otherwise assume wrongly"
        );
    }
}
