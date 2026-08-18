//! Making one small window behave like a sticky note rather than an app.
//!
//! Four of the five requirements are the same on every platform and are set
//! in `tauri.conf.json`: the size, no decorations, always on top, and out of
//! the taskbar. The fifth is only true on macOS, and it is the one that
//! decides whether this feature works at all.
//!
//! A macOS window belongs to the Space it was made in. Switch desktop, or put
//! an app into fullscreen — which is its own Space — and an always-on-top
//! window is still dutifully on top, of a Space nobody is looking at. Two
//! collection-behaviour flags fix it: `CanJoinAllSpaces` follows you between
//! desktops, and `FullScreenAuxiliary` earns the right to float over a
//! fullscreen app instead of being hidden behind it. Neither has a
//! cross-platform equivalent, so this reaches into AppKit.

use tauri::WebviewWindow;

/// Apply everything that cannot be said in the config file.
pub fn make_it_float(window: &WebviewWindow) {
    // The portable half. On macOS this alone is not enough — see below — but
    // on Windows and on the Linux compositors that implement it, it is the
    // whole of "follows me between desktops".
    let _ = window.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    join_all_spaces(window);
}

#[cfg(target_os = "macos")]
fn join_all_spaces(window: &WebviewWindow) {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let Ok(handle) = window.ns_window() else { return };
    if handle.is_null() {
        return;
    }

    // Safety: `ns_window()` hands back the NSWindow AppKit made for this
    // webview window; it outlives this call, and this runs on the main thread
    // because Tauri's setup and event handlers do.
    let ns_window: Retained<NSWindow> =
        unsafe { Retained::retain(handle.cast::<NSWindow>()) }.expect("window is not null");

    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
}
