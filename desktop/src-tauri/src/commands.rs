//! What the window is allowed to ask for.
//!
//! Eight functions, each one a verb. Deliberately not a SQL bridge: a plugin
//! that lets the webview run statements would mean any bug in the frontend is
//! a bug that can drop the table. The webview asks for notes; the shape of
//! the store is not its business.

use tauri::{AppHandle, Manager, Runtime, State};

use crate::store::{
    notes::{self, Note},
    Store,
};
use crate::visibility;

/// Run something against the open database.
///
/// A poisoned mutex means a previous command panicked while holding it. The
/// data is intact — SQLite either committed or did not — so recovering the
/// lock is right; refusing forever would turn one bad command into an app
/// that can never save again.
fn with<T>(
    store: &State<'_, Store>,
    work: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = store.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    work(&guard)
}

#[tauri::command]
pub fn notes_list(store: State<'_, Store>) -> Result<Vec<Note>, String> {
    with(&store, notes::list)
}

#[tauri::command]
pub fn note_create(store: State<'_, Store>) -> Result<Note, String> {
    with(&store, notes::create)
}

/// Where sync stands, for the line along the bottom.
#[tauri::command]
pub async fn sync_standing<R: Runtime>(app: AppHandle<R>) -> Result<crate::sync::Standing, ()> {
    Ok(crate::sync::standing(&app, 0, None))
}

/// Try a round now, because somebody asked.
#[tauri::command]
pub async fn sync_now<R: Runtime>(app: AppHandle<R>) -> Result<crate::sync::Standing, String> {
    let changed = crate::sync::once(&app).await?;
    let standing = crate::sync::standing(&app, crate::store::notes::now_ms(), None);
    crate::sync::announce(&app, changed, standing.clone());
    Ok(standing)
}

#[tauri::command]
pub fn note_save<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
    body: String,
) -> Result<Note, String> {
    // A body long enough to be a paste of somebody's dissertation is still a
    // note, but there is a point past which this is not a sticky note and the
    // window is the wrong tool. Refuse rather than write a megabyte per
    // keystroke and pretend the window can show it.
    const LIMIT: usize = 256 * 1024;
    if body.len() > LIMIT {
        return Err(format!(
            "That is longer than a note can be ({} KB of {} KB). Put it in a document on tougather.com.",
            body.len() / 1024,
            LIMIT / 1024
        ));
    }
    let saved = with(&store, |c| notes::save(c, &id, &body));
    if saved.is_ok() {
        crate::sync::nudge(&app);
    }
    saved
}

#[tauri::command]
pub fn note_delete<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
) -> Result<(), String> {
    let done = with(&store, |c| notes::delete(c, &id));
    if done.is_ok() {
        crate::sync::nudge(&app);
    }
    done
}

#[tauri::command]
pub fn note_restore<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
) -> Result<Option<Note>, String> {
    let back = with(&store, |c| notes::restore(c, &id));
    if back.is_ok() {
        crate::sync::nudge(&app);
    }
    back
}

/// Where the notes actually are, for the settings line that says so.
///
/// A local-first app that cannot tell you where your data is has the same
/// problem as one that syncs silently: you are asked to trust it.
#[tauri::command]
pub fn store_path<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("notes.sqlite3").to_string_lossy().into_owned())
        .map_err(|e| format!("could not work out where the notes are kept: {e}"))
}

/// Put the window away from inside the window.
#[tauri::command]
pub fn hide_window<R: Runtime>(app: AppHandle<R>) {
    visibility::hide(&app);
}

/// The window telling Rust it has finished writing and may be closed.
///
/// See `lib.rs`: quitting asks the window to flush first, and this is the
/// answer. Without it, quitting inside the autosave's debounce window throws
/// away the last thing typed — which is exactly the sentence somebody opened
/// the note to write down.
#[tauri::command]
pub fn ready_to_quit<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}
