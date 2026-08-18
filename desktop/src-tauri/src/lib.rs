//! Tougather's floating note.
//!
//! Step one of five: the window behaves, the hotkey works, the tray works.
//! There is deliberately no data here yet — local storage is step two, the
//! account is step three — so that the part that is hardest to test by unit
//! test, and easiest to get subtly wrong on one platform, can be tried on its
//! own before anything depends on it.

mod config_check;
mod tray;
mod visibility;
mod window;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Position and size, and nothing else. VISIBLE is left out on
                // purpose: this app starts hidden, and a restored "was open
                // when you quit" would put a note on screen at every login for
                // people who turned on Open at login.
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            // Started by the OS rather than by a person, so it must come up
            // the way it always does: hidden, waiting for the hotkey.
            Some(vec!["--hidden"]),
        ))
        .plugin(global_shortcut())
        .setup(|app| {
            let handle = app.handle().clone();

            if let Some(window) = visibility::window(&handle) {
                window::make_it_float(&window);
            }

            tray::build(&handle)?;

            // Registered here rather than in the plugin builder because a
            // shortcut another app already holds is a refusal, not a crash:
            // the tray still opens the note, so say so in the log and carry
            // on rather than failing to start over a hotkey.
            if let Err(error) = register_hotkey(&handle) {
                eprintln!(
                    "Tougather note: {} is taken by another app ({error}). \
                     Use the tray icon instead.",
                    visibility::HOTKEY
                );
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window would destroy the webview and everything
            // half-typed in it. A note is put away, not shut down; quitting is
            // the tray's job, where it is spelled out.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                visibility::hide(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("Tougather note failed to start")
        .run(|_app, event| {
            // macOS: with the window hidden there is nothing to close, and the
            // default behaviour would quit the app the first time the note is
            // put away — taking the tray icon and the hotkey with it.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

fn global_shortcut<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            // Press, not release. Acting on both would toggle twice per tap
            // and leave the note exactly where it started.
            if event.state() == ShortcutState::Pressed {
                visibility::toggle(app);
            }
        })
        .build()
}

fn register_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), tauri_plugin_global_shortcut::Error> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    #[cfg(target_os = "macos")]
    let modifiers = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let modifiers = Modifiers::CONTROL | Modifiers::SHIFT;

    app.global_shortcut()
        .register(Shortcut::new(Some(modifiers), Code::KeyN))?;
    Ok(())
}
