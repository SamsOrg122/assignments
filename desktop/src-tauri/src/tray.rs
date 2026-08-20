//! The tray icon, and the menu behind it.
//!
//! The tray is not decoration here. This window starts hidden and has no
//! decorations, so if the hotkey is taken by something else — and
//! Ctrl+Shift+N is taken by a browser's private window on more machines than
//! you would like — the tray is the only way back in. It carries the hotkey
//! in its own menu for the same reason: somewhere the user can read what the
//! shortcut is without going to find the documentation.

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Runtime,
};
use tauri_plugin_autostart::ManagerExt;

use crate::visibility::{self, HOTKEY_LABEL};

pub const TRAY_ID: &str = "tougather-note";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show note", true, Some(HOTKEY_LABEL))?;
    // Whether it is already on is a question for the OS, not for a setting we
    // keep ourselves — a user who removed the login item by hand must not see
    // a tick claiming otherwise.
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Open at login",
        true,
        enabled,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Tougather note", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // The tick has to be reachable from the click handler, and a built tray
    // does not hand its menu back — so the item itself is carried into the
    // closure rather than looked up later.
    let tick = autostart.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon().cloned().ok_or_else(|| {
                tauri::Error::AssetNotFound("the bundle has no window icon".into())
            })?,
        )
        .icon_as_template(true)
        .tooltip("Tougather note")
        .menu(&menu)
        // The menu belongs to right-click. A left-click that opened a menu
        // would put two clicks between the user and a note they wanted to
        // write down before they forgot it.
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "toggle" => visibility::toggle(app),
            "autostart" => flip_autostart(app, &tick),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                visibility::toggle(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Turn the login item on or off, and put the menu back in step with reality.
///
/// The tick is set from what the OS reports *after* the change rather than
/// from what was asked for: if the write failed — a locked-down machine, a
/// managed profile — the menu says so by not moving, instead of lying.
fn flip_autostart<R: Runtime>(app: &AppHandle<R>, tick: &CheckMenuItem<R>) {
    let manager = app.autolaunch();
    let was_on = manager.is_enabled().unwrap_or(false);
    let _ = if was_on {
        manager.disable()
    } else {
        manager.enable()
    };

    let _ = tick.set_checked(manager.is_enabled().unwrap_or(was_on));
}
