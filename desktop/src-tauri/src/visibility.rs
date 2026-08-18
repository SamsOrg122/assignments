//! Showing and hiding the one window there is.
//!
//! Two rules, both learned from how a note gets used rather than from how a
//! window works.
//!
//! Showing must also focus. A note you cannot type into the instant it
//! appears is a note you close again, and on macOS a hidden app has no
//! foreground claim at all — so the app is activated first, then the window
//! raised. Without that the window appears behind whatever you were reading.
//!
//! Hiding must not close. Closing destroys the webview, which in step 2 means
//! throwing away a half-typed sentence to save a few megabytes of memory.

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

/// The one window. Named in `tauri.conf.json`, referred to nowhere else.
pub const MAIN: &str = "note";

/// The hotkey, in the one spelling both the shortcut plugin and the tray menu
/// understand. `CmdOrCtrl` resolves to Command on macOS and Control elsewhere,
/// which is what people on each platform expect a shortcut to be.
pub const HOTKEY: &str = "CmdOrCtrl+Shift+N";

/// The same thing, spelled for a human. The menu shows this rather than the
/// accelerator so a Mac user reads ⌘⇧N instead of "CmdOrCtrl".
#[cfg(target_os = "macos")]
pub const HOTKEY_LABEL: &str = "⌘⇧N";
#[cfg(not(target_os = "macos"))]
pub const HOTKEY_LABEL: &str = "Ctrl+Shift+N";

pub fn window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN)
}

/// Bring the note up and put the caret in it.
pub fn show<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = window(app) else { return };

    // macOS only, and it has to come first: an app with no visible windows is
    // not in the foreground, and a window shown by a background app opens
    // behind the one you are looking at.
    #[cfg(target_os = "macos")]
    let _ = app.show();

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Put it away without losing what is in it.
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = window(app) {
        let _ = window.hide();
    }
}

/// What the hotkey and the tray both do.
///
/// "Visible" is asked of the window rather than remembered here, so the two
/// entry points cannot drift apart, and a window the user closed with the
/// keyboard still toggles correctly afterwards.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = window(app) else { return };
    if window.is_visible().unwrap_or(false) {
        hide(app);
    } else {
        show(app);
    }
}
