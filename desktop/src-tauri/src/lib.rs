//! Tougather's floating note.
//!
//! Steps one and two of five: the window behaves, and what you type into it
//! is kept in a local SQLite file. The account is step three and sync is step
//! four — and in that order on purpose, so that the note works before it is
//! ever asked to depend on a network.

mod auth;
mod commands;
mod config_check;
mod store;
mod sync;
mod tray;
mod visibility;
mod window;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set once, when a quit has been asked for and the window has been told to
    // write. The second exit request — the window answering — must go
    // through, or the app could never be quit at all.
    let flushing = Arc::new(AtomicBool::new(false));

    let builder = tauri::Builder::default();

    // Windows and Linux hand a `tougather://` link to a fresh copy of the app.
    // Without this, signing in would open a second note window and the first
    // one would sit there waiting for a link it never receives.
    //
    // On Linux it talks over the session bus, and a machine with no session
    // bus — a bare X session, a container, some minimal window managers —
    // has none to talk over. Loading it there hangs the app before the window
    // is ever created: no note, no tray, no message, nothing to see. Found by
    // running it, because with a session bus present everything works.
    //
    // So: skip it there rather than hang. Deep links stop being forwarded,
    // which costs the browser sign-in on exactly the machines that have no
    // browser session to speak of, and the app itself still runs.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = if has_a_session_bus() {
        builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let _ = app.deep_link().register_all();
            visibility::show(app);
        }))
    } else {
        eprintln!(
            "Tougather note: no D-Bus session, so signing in through the browser \
             is unavailable on this machine. Notes still work."
        );
        builder
    };

    builder
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
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            commands::notes_list,
            commands::note_create,
            commands::note_save,
            commands::note_delete,
            commands::note_restore,
            commands::store_path,
            commands::sync_standing,
            commands::sync_now,
            commands::hide_window,
            commands::ready_to_quit,
            auth::commands::auth_standing,
            auth::commands::auth_begin,
            auth::commands::auth_with_password,
            auth::commands::auth_sign_out,
            auth::commands::site_address,
            auth::commands::site_set,
            auth::commands::site_reset,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Before the window is shown, and before the hotkey is live: if
            // there is nowhere to write, this app has nothing to offer, and
            // saying so at startup is far better than a window that takes
            // dictation into nothing.
            app.manage(store::open(&handle).map_err(|e| {
                eprintln!("Tougather note: {e}");
                e
            })?);

            if let Some(window) = visibility::window(&handle) {
                window::make_it_float(&window);
            }

            tray::build(&handle)?;

            app.manage(auth::Auth::default());
            sync::keep_in_step(&handle);
            wake_up_the_account(&handle);

            // The browser comes back through here. On Windows and Linux the
            // link arrives in a second copy of the app, which the single
            // instance below hands to this one; on macOS it arrives directly.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            let links_work = has_a_session_bus();
            #[cfg(not(any(target_os = "windows", target_os = "linux")))]
            let links_work = true;

            if links_work {
                use tauri_plugin_deep_link::DeepLinkExt;
                let for_links = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    let Some(link) = event.urls().first().cloned() else {
                        return;
                    };
                    let app = for_links.clone();
                    tauri::async_runtime::spawn(async move {
                        match auth::commands::finish(&app, link.as_str()).await {
                            Ok(standing) => {
                                let _ = app.emit(SIGNED_IN_EVENT, standing);
                                // Everything written before signing in is
                                // waiting; send it now rather than at the
                                // next beat.
                                sync::nudge(&app);
                                // Sign-in happened in the browser, so the note
                                // window is behind it. Bring it back, or the
                                // user is left looking at a web page wondering
                                // whether it worked.
                                visibility::show(&app);
                            }
                            Err(problem) => {
                                // To the log as well as to the window. A
                                // failure that exists only as an event is a
                                // failure nobody can investigate afterwards.
                                eprintln!("Tougather note: sign-in did not finish — {problem}");
                                let _ = app.emit(SIGN_IN_FAILED_EVENT, problem);
                                visibility::show(&app);
                            }
                        }
                    });
                });
            }

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
        .run(move |app, event| match event {
            // macOS: with the window hidden there is nothing to close, and the
            // default behaviour would quit the app the first time the note is
            // put away — taking the tray icon and the hotkey with it.
            tauri::RunEvent::ExitRequested { api, code, .. } if code.is_none() => {
                api.prevent_exit();
            }
            // A deliberate quit, from the tray. Hiding needs no flush — the
            // webview survives, so the autosave timer still fires — but
            // quitting does: inside the 800ms debounce the last sentence typed
            // exists only in the textarea, and that sentence is usually the
            // reason the note was opened. So ask the window to write, and let
            // it say when it has.
            tauri::RunEvent::ExitRequested { api, .. }
                if !flushing.swap(true, Ordering::SeqCst) =>
            {
                api.prevent_exit();
                ask_the_window_to_flush(app);
            }
            _ => {}
        });
}

/// Tell the window to save, and quit when it answers — or shortly anyway.
///
/// The answer comes back as the `ready_to_quit` command. The timeout is not
/// belt-and-braces: without it, a webview that has crashed or is stuck in a
/// loop would leave an app that cannot be quit except by killing it, which is
/// a worse failure than losing 800ms of typing. A second is far longer than a
/// single-row SQLite write and short enough that nobody wonders whether the
/// menu item worked.
fn ask_the_window_to_flush<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Emitter;

    let asked = app.emit(FLUSH_EVENT, ()).is_ok();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(if asked {
            1000
        } else {
            0
        }));
        app.exit(0);
    });
}

/// What the window listens for when it is about to be shut.
pub const FLUSH_EVENT: &str = "note:flush";

/// Sign-in finished in the browser and came back through the deep link.
pub const SIGNED_IN_EVENT: &str = "auth:signed-in";
/// It came back, and it did not work.
pub const SIGN_IN_FAILED_EVENT: &str = "auth:failed";

/// Read the site's configuration and resume a session, without holding up
/// the window.
///
/// Both are network calls, and a note-taking app that will not open until
/// tougather.com answers is a note-taking app that is useless on a train.
/// The window draws immediately and finds out it is signed in a moment later.
fn wake_up_the_account<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let config = match auth::gotrue::config(&auth::site(&app)).await {
            Ok(config) => config,
            Err(problem) => {
                eprintln!("Tougather note: {problem}");
                {
                    // Written down as well as announced. The window may not
                    // be listening yet — it is still being built — and a
                    // failure nobody hears is a window that says nothing is
                    // wrong.
                    let held = app.state::<auth::Auth>();
                    let mut state = held.0.lock().unwrap_or_else(|p| p.into_inner());
                    state.problem = Some(problem.clone());
                }
                let _ = app.emit(SIGN_IN_FAILED_EVENT, problem);
                return;
            }
        };
        {
            let held = app.state::<auth::Auth>();
            let mut state = held.0.lock().unwrap_or_else(|p| p.into_inner());
            state.config = Some(config.clone());
            state.problem = None;
        }

        // A refresh token from a previous run. Trading it for a session is
        // also how we find out it has been revoked.
        match auth::keychain::read() {
            Ok(Some(token)) => match auth::gotrue::refresh(&config, &token).await {
                Ok(session) => {
                    if let Ok(standing) = auth::adopt(&app, session) {
                        let _ = app.emit(SIGNED_IN_EVENT, standing);
                        sync::nudge(&app);
                    }
                }
                Err(_) => {
                    // Revoked, or simply too old. Clear it rather than
                    // retrying a dead token at every launch forever.
                    let _ = auth::keychain::clear();
                    let _ = app.emit(
                        SIGNED_IN_EVENT,
                        auth::commands::standing_now(&app.state::<auth::Auth>()),
                    );
                }
            },
            _ => {
                let _ = app.emit(
                    SIGNED_IN_EVENT,
                    auth::commands::standing_now(&app.state::<auth::Auth>()),
                );
            }
        }
    });
}

/// Whether there is a session bus to talk over.
///
/// Linux only in practice; on Windows and macOS this is always true, because
/// the single-instance plugin there uses the platform's own mechanism.
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn has_a_session_bus() -> bool {
    if cfg!(target_os = "windows") {
        return true;
    }
    std::env::var("DBUS_SESSION_BUS_ADDRESS")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
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
