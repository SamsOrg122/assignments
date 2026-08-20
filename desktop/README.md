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
| 2 | Local SQLite and the note itself, fully offline | **done** |
| 3 | Signing in, through your own browser | **done** |
| 4 | Sync queue, and the notes section in the web Library | **done** |
| 5 | GitHub Actions matrix build for macOS, Windows, Linux | **done** |

## Running it

```sh
cd desktop
npm install
npm run app        # tauri dev — builds the Rust side the first time, so give it a few minutes
```

`npm run app:build` makes a real bundle. Unsigned for now — see *Signing*.

### What to check in step 5

`.github/workflows/desktop.yml`, and it is the first CI in this repository.

Two jobs. **check** is cheap and runs on every push that touches `desktop/`:
`cargo fmt --check`, `clippy -D warnings`, the Rust tests, and the frontend
typecheck. None of those have a platform-specific answer, so they run on Linux
only. **bundle** is slow — a release build of a webview app is minutes per
platform — so it runs on the default branch, this branch, and on request.

Four targets: macOS on Apple silicon and on Intel, Windows, and Linux. Nothing
is shared between them except the cache key, and `fail-fast` is off, because
one platform failing must not hide whether the other two are fine.

Everything is path-filtered. The web app lives in this repository too, and
rebuilding three operating systems for a change to a marketing page would be
absurd.

**To cut a release:** push a `desktop-v*` tag, then run the workflow from the
Actions tab with that tag selected. It drafts a release with the four bundles
attached — draft, so nothing is published by a push. Tags are deliberately not
a push trigger: a `paths` filter applies to tag pushes too, so tagging a commit
that happened not to touch `desktop/` would silently build nothing, and a
release that quietly does not happen is worse than one that takes a click.

The Linux build was run here before the workflow was written, which is how the
`.desktop` file turned out to be wrong — see below. It produces a 3.9 MB
`.deb` around an 8 MB binary. That is the Electron comparison at the top of
this file, made concrete.

### What to check in step 4

Notes now travel. The footer stops saying *on this computer* and starts saying
where they actually are.

- **Type something while signed in.** Within a couple of seconds the footer
  reads *In your account · just now*.
- **Open tougather.com → Library.** There is a **Notes** section above your
  documents with what you just wrote. Edit it there; the desktop app picks the
  change up within a minute, or straight away if you touch a note.
- **Pull the network out and keep typing.** The footer says *can't reach your
  account* with a **Try now** beside it, and the note still saves. Plug it
  back in and it catches up on its own.
- **Delete a note in one place.** It goes in the other. Deleted notes are
  tombstones rather than removed rows — a row that is simply gone cannot be
  told from one the other machine has never seen, and it would come back for
  ever.
- **Sign out.** Every note is queued again, because notes sent to one account
  have not been sent to another.

Conflicts are last-write-wins on `updated_at`. That is a real choice with a
real cost — two machines editing the same note at the same moment will lose
one of the edits — and it is the right cost for something usually one line
long. A merge algorithm on a sticky note would be a worse product, not a
better one.

The clock behind that is forced to move forward: never repeating, never going
backwards. A millisecond is long enough to save and then delete inside, and
both carrying the same stamp meant the deletion was never newer than the last
thing sent, so it was never sent, so the note came back from the other machine
for ever. Wall clocks also step backwards — NTP, a laptop waking, somebody
fixing their timezone — and every edit made during that window would look
older than what came before it.

### What to check in step 3

Signing in happens in your own browser, not in this window.

- **Click a provider.** Your browser opens at tougather.com — where you can
  see the address bar and are probably signed in already — and comes back to
  the app on its own. The window raises itself when it does.
- **Quit and start again.** Still signed in. The refresh token is in the OS
  keychain, and the app trades it for a session at startup.
- **Sign out**, bottom right. The keychain entry goes, and so does the session
  on the server.
- **Pull the network out and start the app.** It says it can't reach
  tougather.com and lets you write anyway. Same if this machine has no
  keychain. Being unable to sign in is not the same as being signed out, and
  refusing to take a note because a server is down would defeat the point of
  the whole thing.

The footer says *on this computer* even when signed in, because nothing is
being synced yet — that is step 4. Saying "saved to your account" now would be
untrue, and the web app spent a week undoing exactly that sentence.

#### Why not the short code you asked for

The original plan was a device-code flow: the app shows `K7P2-M9QX`, you type
it on tougather.com, the app polls. That flow ends with the server minting a
session on your behalf, and minting sessions needs Supabase's service-role
key — the one that bypasses every rule keeping accounts apart. It would have
to exist, and be guarded, forever.

The browser flow needs no such key. The app makes a secret, sends only its
hash to the browser, and trades the authorization code plus the original
secret for a session. A code intercepted on the way back is half a pair and
worth nothing. That is standard PKCE, and it is fewer steps for the person
signing in.

Device-code is the right answer for a device with no browser — a TV, a
headless server. A laptop is not that.

### What to check in step 2

Notes are kept in a SQLite file on this machine and nowhere else. There is no
account yet, and the line along the bottom of the window says so.

- **Type something, wait a second.** The footer changes to *Saved just now ·
  on this computer*. Quit from the tray, start it again: it is still there.
- **`Notes (n)`** in the header opens the list. Each row is the note's first
  line, what follows it, and when it was last touched. Clicking one opens it.
- **`+`** starts a new note. The one you were in is written first.
- **`×`** on a list row deletes it — with no confirmation, on purpose. *Undo*
  appears along the bottom instead, which is a better safety net than a dialog
  people learn to click through.
- **Pull the plug test.** Type, then put the note away with the hotkey inside
  the first second. Bring it back: what you typed is there. Hiding does not
  destroy the webview, so the pending save still happens.
- **Where it lives.** Hover the footer and it shows the path. On Linux that is
  `~/.local/share/com.tougather.note/notes.sqlite3`; macOS
  `~/Library/Application Support/com.tougather.note/`; Windows
  `%APPDATA%\com.tougather.note\`.

Deleted notes stay in the file as tombstones rather than being removed. That
looks like clutter and is not: when sync arrives, a row that is simply *gone*
cannot be told apart from one this machine has never seen, and guessing wrong
takes somebody's note with it.

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

### What is deliberately missing so far

Nothing leaves this machine. There is no account, no pairing and no sync —
steps 3 and 4 — and until then the footer says "on this computer only" rather
than implying otherwise.

## How it is put together

```
desktop/
  src/              the window's contents (React + TS, Vite)
    App.tsx           the note, the list, the footer
    autosave.ts       debounce and flush, as plain functions so they can be tested
    notes.ts          the eight calls into Rust
  src-tauri/
    src/lib.rs        plugins, hotkey registration, app lifetime, flush-on-quit
    src/window.rs     the always-on-top behaviour, including the macOS half
    src/tray.rs       the tray icon and its menu
    src/visibility.rs show / hide / toggle, in one place
    src/store/        SQLite: the schema, its migrations, and notes CRUD
    src/auth/         signing in: the HTTP calls, PKCE, and the OS keychain
    src/sync.rs       the queue: push, pull, and when it runs
    src/commands.rs   what the window may ask for — eight verbs, no SQL
    src/config_check.rs  tests that the config still says what it must
    tauri.conf.json   the window, the bundle, the policy
    capabilities/     what the webview is allowed to ask Rust for
  scripts/prove-linux.sh   drives the real app and checks the real disk
```

Two rules worth keeping:

**Behaviour lives in Rust.** The hotkey, the tray, the always-on-top flags and
the remembered position are all decided on the Rust side, where the webview
cannot reach them. The frontend's whole permission list is in
`capabilities/default.json` and is deliberately short — a test fails if
anything filesystem-, shell- or process-shaped is added to it.

**The bundle is local.** The content policy allows `'self'` and nothing else.
Step 4 opens `connect-src` to exactly one host.

**The store is the store, not a cache.** Everything typed is written to SQLite
first and to nothing else; when sync arrives it will read from that file and
push upwards, never sit between a keystroke and the disk.

## Testing

```sh
cargo test --manifest-path src-tauri/Cargo.toml   # store, schema, config, PKCE
./scripts/prove-linux.sh                          # the real app, on a virtual display
./scripts/prove-auth-linux.sh                     # the whole sign-in, against a stand-in
./scripts/prove-sync-linux.sh                     # notes travelling, both directions
```

`prove-auth-linux.sh` needs a build pointed at its stand-in:

```sh
TOUGATHER_SITE=http://localhost:4599 cargo build --manifest-path src-tauri/Cargo.toml
```

Both scripts need a D-Bus session. So does the app: the tray, the deep-link
handler and the keychain all use it, and on a Linux box without one the global
hotkey never fires. Every real desktop has one; a bare container does not.

The unit tests cover the schema and its migrations, the tombstones, the id
shape, and — on the TypeScript side — the autosave's ordering, which is where
losing a sentence would actually come from.

What they cannot cover is whether a keystroke in the real window, through the
real webview and IPC, reaches the real file. `prove-linux.sh` does that: it
runs the app on an Xvfb display, presses the hotkey, types, and reads the
SQLite file. It found a bug the unit tests could not have — the window came
back from the hotkey with focus on a header button rather than in the note, so
you could type into it and nothing happened.

It is Linux-only and that is fine: the wiring it tests is the same everywhere.
The part that genuinely differs is the macOS window behaviour, which needs a
Mac and a pair of eyes.

The sign-in script earned its place the same way, twice over. It found that a
failed sign-in showed nothing at all — the window sat on "Waiting for your
browser…" while the reason sat one prop away — and that a *locked* keychain
was being reported as a *missing* one, which would have sent somebody off to
install a keyring they already had.

## The Linux desktop entry

`src-tauri/tougather-note.desktop` exists for one character.

Tauri's own template writes `Exec=tougather-desktop` with no `%u`. A handler
for `x-scheme-handler/tougather` without `%u` is launched *without* the URL
when the browser hands one over — so on Linux the app would open after
sign-in, having been told nothing, and sit on the same screen. Found by
unpacking a built `.deb` and reading the file inside it, not by trusting it
would be right. A test asserts both the `%u` and that the config still points
at this template.

## Signing

Off, on purpose, for now. macOS will call an unsigned build damaged unless it
is opened through right-click → Open; Windows SmartScreen will warn.

The config keeps the slots so turning it on later is filling in blanks rather
than working out the schema again — `bundle.macOS.signingIdentity`,
`bundle.macOS.entitlements`, `bundle.windows.certificateThumbprint`, and a
timestamp URL that is already set (a signed build with no timestamp stops
validating the day the certificate expires). A test asserts those fields still
exist.
