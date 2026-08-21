//! Asking, and doing what comes back.

use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::{Assistant, FileForModel, FRAME_EVENT};
use crate::store::Store;

/// A frame as the window receives it.
///
/// Deliberately re-emitted rather than forwarded verbatim: the reply from
/// the site is untrusted input to this process, and a frame that does not
/// parse must not reach the window as anything at all. What the window sees
/// is always one of these shapes.
#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Frame {
    /// Which model answered.
    Model { value: String },
    /// A piece of the reply, as it arrives.
    Text { value: String },
    /// Something was done to a note. The window reloads its list.
    Did { value: String },
    /// A document was made and is on its way to the account.
    Made { value: String },
    /// It went wrong, in words.
    Error { value: String },
    /// Nothing more is coming.
    Done,
}

fn tell<R: Runtime>(app: &AppHandle<R>, frame: Frame) {
    let _ = app.emit(FRAME_EVENT, frame);
}

/// Ask, and let the answer arrive as events.
///
/// Returns as soon as the request is on its way rather than when the answer
/// is complete: the window has a transcript to draw and the whole point of
/// streaming is that it fills in. Errors after this point come back as an
/// `error` frame, not as a rejected promise.
#[tauri::command]
pub async fn assistant_ask<R: Runtime>(
    app: AppHandle<R>,
    prompt: String,
    note_id: String,
) -> Result<(), String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Ask it something first.".into());
    }

    {
        let assistant = app.state::<Assistant>();
        let mut busy = assistant.0.lock().unwrap_or_else(|p| p.into_inner());
        if busy.session.is_some() {
            return Err("It is still answering the last one.".into());
        }
        busy.session = Some(note_id.clone());
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = converse(&handle, &prompt, &note_id).await;
        if let Err(why) = outcome {
            tell(&handle, Frame::Error { value: why });
        }
        tell(&handle, Frame::Done);
        let assistant = handle.state::<Assistant>();
        let mut busy = assistant.0.lock().unwrap_or_else(|p| p.into_inner());
        busy.session = None;
    });

    Ok(())
}

/// Forget that anything is in flight.
///
/// Idempotent, and called from the quit path: a streaming answer must be
/// abandoned rather than waited for, or the app would take an extra two
/// minutes to close because a model was being thoughtful.
#[tauri::command]
pub fn assistant_cancel<R: Runtime>(app: AppHandle<R>) {
    let assistant = app.state::<Assistant>();
    let mut busy = assistant.0.lock().unwrap_or_else(|p| p.into_inner());
    busy.session = None;
}

/// The whole exchange: gather, ask, read, apply.
async fn converse<R: Runtime>(
    app: &AppHandle<R>,
    prompt: &str,
    note_id: &str,
) -> Result<(), String> {
    let site = crate::auth::site(app);
    let token = crate::auth::commands::access_token(app).await?;

    // The note being looked at, and the shelf, as the model will see them.
    let (note_body, files) = {
        let store = app.state::<Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        let body = crate::store::notes::get(&connection, note_id)?
            .map(|n| n.body)
            .unwrap_or_default();
        let recent = crate::store::files::recent(&connection, 12)?;
        let described = recent
            .into_iter()
            .map(|file| FileForModel {
                text: super::text_of(&file),
                bytes: file.content.len(),
                id: file.id,
                name: file.name,
                mime: file.mime,
            })
            .collect::<Vec<_>>();
        (body, described)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Could not start the request: {e}"))?;

    let response = client
        .post(format!("{}/api/assist", site.trim_end_matches('/')))
        .bearer_auth(&token)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "prompt": prompt,
            "note": { "id": note_id, "body": note_body },
            "files": files,
        }))
        .send()
        .await
        .map_err(|e| format!("Could not reach tougather.com: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        // The endpoint refuses in JSON with a sentence meant to be read.
        let said = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string));
        return Err(said.unwrap_or_else(|| format!("tougather.com said {status}.")));
    }

    read_frames(app, response, note_id).await
}

/// Read the NDJSON stream, one line at a time, acting as each frame lands.
async fn read_frames<R: Runtime>(
    app: &AppHandle<R>,
    mut response: reqwest::Response,
    note_id: &str,
) -> Result<(), String> {
    let mut tail = String::new();
    let mut made = 0usize;
    let mut touched = false;

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| format!("The answer stopped early: {e}"))?;
        let Some(bytes) = chunk else { break };
        tail.push_str(&String::from_utf8_lossy(&bytes));

        // Everything up to the last newline is complete lines; the rest is
        // half a frame and waits for the next chunk.
        while let Some(at) = tail.find('\n') {
            let line: String = tail.drain(..=at).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match act(app, line, note_id) {
                Ok(Acted::Nothing) => {}
                Ok(Acted::Note) => touched = true,
                Ok(Acted::Artefact) => made += 1,
                Err(why) => tell(app, Frame::Error { value: why }),
            }
        }
    }

    if touched {
        let _ = app.emit(crate::sync::CHANGED_EVENT, ());
    }
    if touched || made > 0 {
        crate::sync::nudge(app);
    }
    Ok(())
}

enum Acted {
    Nothing,
    Note,
    Artefact,
}

/// One frame: pass it on, or do what it says.
fn act<R: Runtime>(app: &AppHandle<R>, line: &str, note_id: &str) -> Result<Acted, String> {
    let frame: serde_json::Value =
        serde_json::from_str(line).map_err(|_| "The answer arrived malformed.".to_string())?;
    let kind = frame.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let value = frame.get("value");

    match kind {
        "model" => {
            if let Some(model) = value.and_then(|v| v.as_str()) {
                tell(
                    app,
                    Frame::Model {
                        value: model.to_string(),
                    },
                );
            }
            Ok(Acted::Nothing)
        }
        "text" => {
            if let Some(text) = value.and_then(|v| v.as_str()) {
                tell(
                    app,
                    Frame::Text {
                        value: text.to_string(),
                    },
                );
            }
            Ok(Acted::Nothing)
        }
        "error" => {
            if let Some(text) = value.and_then(|v| v.as_str()) {
                tell(
                    app,
                    Frame::Error {
                        value: text.to_string(),
                    },
                );
            }
            Ok(Acted::Nothing)
        }
        "note" => apply_note(app, value, note_id),
        "artefact" => keep_artefact(app, value),
        // A frame this build does not know is not an error — a newer site
        // may send one — but it is also not something to guess at.
        _ => Ok(Acted::Nothing),
    }
}

/// Change what is written.
fn apply_note<R: Runtime>(
    app: &AppHandle<R>,
    value: Option<&serde_json::Value>,
    note_id: &str,
) -> Result<Acted, String> {
    let Some(value) = value else {
        return Ok(Acted::Nothing);
    };
    let kind = value.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let body = value.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let label = value
        .get("label")
        .and_then(|v| v.as_str())
        .unwrap_or("Changed the note");
    if body.is_empty() {
        return Ok(Acted::Nothing);
    }

    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());

    match kind {
        "append" => {
            let existing = crate::store::notes::get(&connection, note_id)?
                .map(|n| n.body)
                .unwrap_or_default();
            let joined = if existing.trim().is_empty() {
                body.to_string()
            } else {
                format!("{}\n\n{}", existing.trim_end(), body)
            };
            crate::store::notes::save(&connection, note_id, &joined)?;
        }
        "replace" => {
            crate::store::notes::save(&connection, note_id, body)?;
        }
        "new" => {
            let note = crate::store::notes::create(&connection)?;
            crate::store::notes::save(&connection, &note.id, body)?;
        }
        _ => return Ok(Acted::Nothing),
    }

    tell(
        app,
        Frame::Did {
            value: label.to_string(),
        },
    );
    Ok(Acted::Note)
}

/// What the app calls a document it made: a JSON file in the queue.
///
/// The suffix is what the web app looks for. A plain `.json` would be
/// indistinguishable from a JSON file somebody dropped on the note, and
/// offering to turn that into a presentation would be a nonsense.
pub const ARTEFACT_SUFFIX: &str = ".tougather-doc.json";

/// Keep a made document, so the next sync round carries it up.
fn keep_artefact<R: Runtime>(
    app: &AppHandle<R>,
    value: Option<&serde_json::Value>,
) -> Result<Acted, String> {
    let Some(value) = value else {
        return Ok(Acted::Nothing);
    };
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .trim()
        .to_string();
    let blocks = value
        .get("blocks")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    if !blocks.is_array() || blocks.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return Ok(Acted::Nothing);
    }
    let label = value
        .get("label")
        .and_then(|v| v.as_str())
        .unwrap_or("Made a document");

    let artefact = serde_json::json!({
        "v": 1,
        "name": name,
        "made_at": crate::store::notes::now_ms(),
        "blocks": blocks,
    });
    let bytes =
        serde_json::to_vec(&artefact).map_err(|e| format!("Could not write the document: {e}"))?;

    // Slashes would make a filename that is not one, and the account's own
    // name column is what the web app shows.
    let safe = name.replace(['/', '\\'], "-");
    let filename = format!("{safe}{ARTEFACT_SUFFIX}");

    let store = app.state::<Store>();
    let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
    crate::store::files::keep(&connection, &filename, "application/json", &bytes)?;

    tell(
        app,
        Frame::Made {
            value: label.to_string(),
        },
    );
    Ok(Acted::Artefact)
}
