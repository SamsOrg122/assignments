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

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

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

/// What the window listens for so it can put the caret back in the note.
///
/// The payload answers "were you already on screen when this was asked for",
/// and the window needs it to tell two different requests apart. Coming back
/// from hidden means *open the note*. Being asked for the note while already
/// showing it means *put the whole thing away* — a second press of a summon
/// shortcut has always meant that. Without the payload the frontend cannot
/// distinguish them, and the third press of the hotkey put the app away again
/// the instant it appeared.
pub const SHOWN_EVENT: &str = "note:shown";

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

    // Focusing the *window* is not focusing the *note*. The webview restores
    // whatever it had before it was hidden, which after a few toggles is
    // often a button on the header — so the note appears, you type, and
    // nothing happens. Caught by running the app rather than by reading it.
    //
    // `false`: it was not on screen a moment ago, so this is "come back",
    // never "put yourself away".
    let _ = window.emit(SHOWN_EVENT, false);
}

/// The two heights this window has.
///
/// Collapsed it is the bar: one row, 44 pixels, the height of a toolbar and
/// not of an application. Pressing a slot grows *this same window* downward
/// into a sheet; Escape or a commit shrinks it back.
///
/// One window rather than two, and it matters more than it looks.
/// `capabilities/default.json` scopes every permission to `"windows": ["note"]`
/// and `MAIN` above is that same string; a second window label would mean
/// widening that file, and its four entries are guarded by a test whose whole
/// job is to make widening it loud.
pub const BAR_HEIGHT: f64 = 44.0;
pub const SHEET_HEIGHT: f64 = 460.0;

/// Where the bar sits before anybody has moved it: top centre.
///
/// Only on a first run. `tauri-plugin-window-state` restores a remembered
/// position after that, and moving a window somebody deliberately put
/// somewhere is the kind of helpfulness people uninstall software over.
///
/// `center: true` in the config centres it on both axes, which for a 44-pixel
/// strip means the middle of the screen — where it covers what you are
/// reading. This keeps the centred x and lifts it to the top.
pub fn rest_at_the_top<R: Runtime>(window: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let screen = monitor.size().to_logical::<f64>(scale);
    let Ok(size) = window.outer_size() else {
        return;
    };
    let size = size.to_logical::<f64>(scale);

    let _ = window.set_position(tauri::LogicalPosition::new(
        ((screen.width - size.width) / 2.0).max(0.0),
        24.0,
    ));
}

/// Grow the window into a sheet, or shrink it back to the bar.
///
/// A named command rather than a `core:window:allow-set-size` grant in the
/// capability file, and the difference is the whole point: this takes a
/// boolean, so the widest thing a bug in the webview can do with it is make
/// the window the wrong one of two sizes. The permission would let it be any
/// size at all, including one pixel or larger than the screen. Four entries in
/// that file and a test guarding them are worth more than the convenience.
///
/// The width is left alone: somebody who widened the bar keeps their width.
pub fn set_sheet<R: Runtime>(app: &AppHandle<R>, open: bool) {
    let Some(window) = window(app) else { return };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = size.to_logical::<f64>(scale);

    let _ = window.set_size(tauri::LogicalSize::new(
        size.width,
        if open { SHEET_HEIGHT } else { BAR_HEIGHT },
    ));
}

/// Put it away without losing what is in it.
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = window(app) {
        let _ = window.hide();
    }
}

/// What the hotkey does, which is no longer what the tray does.
///
/// It used to be `toggle`, and that was right while the window started hidden:
/// press once to summon the note, press again to put it away. The bar changed
/// the first half of that. The window is now *always* visible, so the first
/// press of a "give me the note" shortcut was hiding the entire app —
/// caught by `prove-linux.sh`, which is the only test here that drives the
/// real window and the only one that could have caught it.
///
/// So the hotkey means "the note", and the window decides what that costs: if
/// the app is hidden it comes back; if it is already there the frontend gets
/// `SHOWN_EVENT` and either opens the note or, when the note is already open,
/// puts the whole thing away. The state that decides — which sheet is open —
/// lives in the webview, so the decision does too.
pub fn summon<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = window(app) else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.set_focus();
        let _ = window.emit(SHOWN_EVENT, true);
    } else {
        show(app);
    }
}

/// What the tray does: plainly show it, or plainly hide it.
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
