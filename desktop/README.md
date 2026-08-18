# Tougather note

A small window that stays above every other app, opens with a keystroke, and
keeps what you write in your Tougather account.

Tauri v2 — a Rust shell around the system's own webview — rather than
Electron. For a 340×480 note the difference is not ideology: an Electron build
ships a browser per app and starts around 150 MB, and this is a thing people
are meant to leave running all day.

## Where it is

Built in five steps, each one testable on its own.

| Step | What it adds | State |
| --- | --- | --- |
| 1 | Window behaviour, global hotkey, tray | **done** |
| 2 | Local SQLite and the note itself, fully offline | next |
| 3 | Device-code pairing with tougather.com | |
| 4 | Sync queue, and the notes section in the web Library | |
| 5 | GitHub Actions matrix build for macOS, Windows, Linux | |

## Running it

```sh
cd desktop
npm install
npm run app        # tauri dev — builds the Rust side the first time, so give it a few minutes
```

`npm run app:build` makes a real bundle. Unsigned for now — see *Signing*.

### What to check in step 1

The whole point of doing the window first is that none of this can be proved
by a test. It has to be looked at.

- **It is not there when it starts.** No window, no taskbar entry, no dock
  bounce. Just a tray icon.
- **⌘⇧N / Ctrl+Shift+N** brings it up **from inside another app**, with the
  caret ready — not behind the window you were reading. Press again to put it
  away.
- **The tray icon** does the same on a left click. Right-click for the menu:
  the hotkey is written next to *Show note*, and *Quit* is the only way to
  actually stop it.
- **It stays on top** of a browser, an editor, a video.
- **macOS only, and the one that matters:** switch to another Space, or put an
  app into fullscreen. The note should follow you and float over it. If it
  vanishes, `src-tauri/src/window.rs` is the file — that behaviour comes from
  two AppKit collection-behaviour flags with no cross-platform equivalent.
- **Move it, resize it, quit, start again.** It comes back where you left it,
  at the size you left it. It does *not* come back **open** — that is
  deliberate, so *Open at login* does not put a note on screen every morning.
- **Drag the header** to move it. There is no title bar; the header is it.
- **Open at login** in the tray menu. Tick it, log out and back in: the app is
  running, the window is not. Untick it and it should leave no login item
  behind.

### What is deliberately missing in step 1

Nothing is saved. There is no note to type in yet — that is step 2, and doing
it in this order means the window behaviour was judged on its own rather than
through a textarea.

## How it is put together

```
desktop/
  src/              the window's contents (React + TS, Vite)
  src-tauri/
    src/lib.rs      plugins, hotkey registration, app lifetime
    src/window.rs   the always-on-top behaviour, including the macOS half
    src/tray.rs     the tray icon and its menu
    src/visibility.rs  show / hide / toggle, in one place
    src/config_check.rs  tests that the config still says what it must
    tauri.conf.json    the window, the bundle, the policy
    capabilities/      what the webview is allowed to ask Rust for
```

Two rules worth keeping:

**Behaviour lives in Rust.** The hotkey, the tray, the always-on-top flags and
the remembered position are all decided on the Rust side, where the webview
cannot reach them. The frontend's whole permission list is in
`capabilities/default.json` and is deliberately short — a test fails if
anything filesystem-, shell- or process-shaped is added to it.

**The bundle is local.** The content policy allows `'self'` and nothing else.
Step 4 opens `connect-src` to exactly one host.

## Signing

Off, on purpose, for now. macOS will call an unsigned build damaged unless it
is opened through right-click → Open; Windows SmartScreen will warn.

The config keeps the slots so turning it on later is filling in blanks rather
than working out the schema again — `bundle.macOS.signingIdentity`,
`bundle.macOS.entitlements`, `bundle.windows.certificateThumbprint`, and a
timestamp URL that is already set (a signed build with no timestamp stops
validating the day the certificate expires). A test asserts those fields still
exist.
