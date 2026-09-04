# The bar

**A plan for turning the desktop note into one tool among a few, and for saying honestly what the desktop cannot do.**

Read the two boxed findings first. They decide most of what follows.

---

## Finding one: the desktop window cannot hear

I did not take this on trust. I compiled a small GTK/WebKit program against the exact library Tauri links on Linux — `/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0`, version **2.52.3** — loaded a page into a real `WebKitWebView` with no settings changed, and asked it what it has. Verbatim:

```
SpeechRecognition        undefined
webkitSpeechRecognition  undefined
SpeechGrammarList        undefined
speechSynthesis          undefined
MediaRecorder            function
mediaDevices             object
getUserMedia             function
AudioContext             function
AudioWorklet             function
WebAssembly              object
SharedArrayBuffer        undefined
crossOriginIsolated      false
ua                       …AppleWebKit/605.1.15 … Version/60.5 Safari/605.1.15
```

`src/lib/speech/webspeech.ts` finds its constructor at `getCtor()` by reading exactly those two names. Both are `undefined`, so `webSpeechProvider.isAvailable()` returns `false` on Linux. Deterministically, not intermittently.

Windows: from this repository's own bundled data rather than from memory. `node_modules/caniuse-lite`, feature `speech-recognition`, records **Edge as `n` — no support — for versions 146 through 150**, against Chrome `a x` and Safari `a x`. WebView2 is Edge without the browser. Note in passing that `src/lib/speech/webspeech.ts:9` currently says *"Chrome and Edge do"*, which this repository's own `node_modules` contradicts. That comment should be corrected whatever we decide here.

macOS: `grep -ri speech` across the whole of `wry-0.55.1/src` returns **nothing** — no speech plumbing on any platform. wry does handle microphone capture on macOS (`src/wkwebview/class/wry_web_view_ui_delegate.rs:126-136` implements `requestMediaCapturePermissionForOrigin:` and unconditionally grants) but speech recognition in WKWebView is a separate permission with its own delegate that wry does not implement, and an unanswered permission request is a denied one.

**So the transcriber as built cannot run inside the desktop window on any of the three platforms.** Not degraded. Absent.

Three smaller things fell out of the same probe that are worth having in writing:

- `speechSynthesis` is also `undefined`. `src/lib/speech/speak.ts` is dead in the desktop window too, not only the recogniser.
- `SharedArrayBuffer` is `undefined` and `crossOriginIsolated` is `false`. That closes off any threaded WebAssembly speech model running *inside* the window — a wasm whisper build is not a shortcut here; it would have to be native Rust.
- The capture primitives (`MediaRecorder`, `getUserMedia`, `AudioContext`, `AudioWorklet`) all exist. That is the useful half: the window can in principle handle audio. It just cannot handle *words*.

**One correction to something you may have read.** I checked `enable-media-stream` directly on the settings object: it defaults to **TRUE** in WebKitGTK 2.52.3, not false. `navigator.mediaDevices` *is* exposed. So any claim that "the microphone is not even reachable on Linux" is wrong in its mechanism, even where it is right in its conclusion. What I actually measured in this container was `getUserMedia({audio:true})` **rejecting in 16 ms** with `OverconstrainedError`, and `enumerateDevices()` resolving with zero devices — because this container has no audio hardware. **I could not test what happens on a real Linux desktop that does have a microphone**, and that is a genuine gap: wry connects no `permission-request` handler anywhere in `src/webkitgtk/` (I listed every signal it connects), and WebKitGTK denies an unhandled permission request, so the expected result is a rejection — but I have not seen it. Flagged as uncertain, and it does not change the plan, because the plan never asks the webview for a microphone.

## Finding two: the app currently puts nothing on screen when you install it

`tauri.conf.json` sets `"visible": false`. I traced every call site of `visibility::show` in `src-tauri/src/lib.rs`: line 53 (a second copy of the app being launched by a deep link) and lines 155 and 163 (sign-in coming back from the browser). **`setup()` never shows the window.** A person who downloads this, installs it, and double-clicks it sees nothing happen. There is a tray icon and no other evidence the app exists.

That was a defensible decision for a note — the README explains it, and it is what keeps *Open at login* from putting a note on screen every morning. It is not defensible for a bar. A bar that is invisible until you guess a keystroke is not a bar.

---

## What the bar is

**The same window, reshaped: 420 × 44, top centre, always on top, visible from launch.**

One window, not several. `capabilities/default.json` scopes permissions to `"windows": ["note"]`, `visibility.rs::MAIN` is that same string, and the macOS floating behaviour in `window.rs` applies to it unchanged. A second window label costs a permission-surface change and buys nothing.

It has two heights. Collapsed it is the bar: 44 pixels, one row. Pressing a slot grows *this same window* downward into a sheet — roughly 420 × 420 for the note — and Escape or a commit shrinks it back. The resize is a named Rust command sitting beside `hide_window` in `commands.rs`, **not** a `core:window:allow-set-size` grant in the capability file. That file has four entries and a test (`config_check.rs::the_frontend_holds_no_dangerous_permissions`) whose whole job is to make widening it loud. This design should not be the first thing to widen it.

**What is on the bar, left to right:** the mark; three or four slot buttons, each with a **word on it, not only a glyph**; and on the right one status dot — `StatusPill.tsx` reduced to its state and its tooltip. Quiet when everything is sent, a slow pulse during a round, amber with the existing sentence when it cannot reach the account.

Words rather than glyphs is not decoration. A glyph for "note" is guessable and a glyph for "record" is guessable, but nothing in the world signals *"paste whatever is on my clipboard right now"*. A four-letter word does. The bar is 420 pixels wide because four short words and a dot need about that much.

**What it says when nothing is happening: nothing.** No "All clear", no greeting, no summary. After a week you learn that text on this bar means something and blankness means nothing, and that is the only property that makes an all-day presence tolerable rather than wallpaper.

**With one exception, and it is the one that decides whether anybody ever uses this.** On first run, before there is an account or a note or anything to be quiet about, blankness reads as broken. So on first run — and only until the first successful capture — the bar carries one line: *"⌘⇧N to write · drag a file here"*. It disappears permanently after the first thing lands and never comes back. Silence is the right resting state for somebody who has learned the product. It is the wrong opening move for somebody who installed it an hour ago, and the opening move is the only one they are guaranteed to see.

**Staleness is a state, not a nicety.** Anything the bar displays that came from the account carries the time of its last successful pull. Past fifteen minutes it stops asserting the thing and reverts to the connection wording that `Connection.tsx` and `StatusPill.tsx` already use. A bar quietly showing yesterday's truth all day is the same failure as an invented colleague, with a clock on it.

**Four rules that stop it becoming a notification bar:**

1. *It never appears; it only changes.* No pop, no slide, no flash, no focus steal for new information — it is already there. `visibility::show`'s activate-and-focus path fires only on the hotkey and the tray, which is to say only when a person asked.
2. *One thing at a time.* No "+3 more". There is no list on the bar.
3. *A floor on change.* Nothing recomputes more than once a minute, on the tokio timer `sync.rs` already runs.
4. *Only your own things.* No chat unread, no mentions, nothing another person can put there. The moment the bar carries other people's messages it becomes an interruption, and interruptions get muted.

## What the bar is not

- **It is not a second sidebar.** `src/app/(app)/more/page.tsx` exists because the sidebar hit ten rows and had to be cut to five. Every slot on this bar has to survive the admission rule below, and that rule exists because last time there wasn't one.
- **It is not where you look at your things.** No search, no library, no agenda, no browsing. The note sheet shows your notes because that is where they already are; nothing else in the product gets a viewer in a 420-pixel window. A small always-on-top strip is a fine place to write and a bad place to read.
- **It is not a transcriber.** It cannot hear. See below.
- **It is not the whole product in a window.** See below.
- **It does not get per-slot global hotkeys.** One hotkey — `CmdOrCtrl+Shift+N`, the one that already exists and that the tray menu already prints next to its row. Four more are four more collisions with whatever else somebody runs, and a capture tool that steals a shortcut from another app is a capture tool people uninstall.

---

## The tools at launch

### 1. Note — the existing app, re-housed

Type; it goes to SQLite first and to nothing else; the sync queue carries it up. Everything that works today keeps working: `useAutosave`, the flush-on-quit listener, the notes list, the undo row, the Ask panel, the sign-in door, the connection banner. `App.tsx` is 601 lines and almost all of it survives — what changes is that the header becomes the bar and the body becomes a sheet.

Two things I want to say explicitly because they are easy to get wrong while "simplifying":

- **The note list stays whole.** One version of this plan proposed cutting it to the last three with a link to `/notes` for the rest. Do not. Somebody with forty notes and no browser open would lose access to thirty-seven of them, and those notes are the reason this app has users. A sheet is 420 × 420; the list fits.
- **`note_save`'s 256 KB refusal stays**, including its sentence *"Put it in a document on tougather.com."* That refusal is where this half of the product ends and the other half begins, already written down, already tested.

**Ask does not get a slot.** `AskPanel.tsx` (249 lines) and `src-tauri/src/assistant/` work and stay exactly where they are — a control inside the note sheet. Asking a question is consulting, not capturing. Giving it a word on the bar would make the bar a place you go to have a conversation, and that is the browser's job. Nothing is removed; it is simply not promoted.

**Cost:** re-layout, not new machinery. Roughly a week including the test rewrites below. Based on: 601 lines of `App.tsx` of which the header and the drop halo move, one new Rust command (~30 lines beside `hide_window`), and two tests in `config_check.rs` that assert the old geometry.

### 2. Drop — a file, a screenshot, a PDF

**This already works and nobody can see it.** `lib.rs:197-212` takes dropped paths natively from the OS, `store/files.rs` keeps the bytes with an 8 MB cap and a written refusal message, `sync.rs::push_files` posts them to `kit_files`, and the web app already has the shelf waiting: `src/app/(app)/kit/page.tsx:65` declares `{ id: "desktop", label: "From your desktop" }`, and line 421 holds an empty state reading *"Nothing from the desktop note yet. Anything you drop on it lands here."* That empty state has never been filled by a real user, because the only affordance is a halo that appears *after* you have already begun dragging (`App.tsx:412-415`).

A permanently visible 420-pixel strip floating over every other window is the affordance that feature has been missing since step 4. Moving the halo onto the bar and putting the count of unsent files beside it — the `unsent` query in `store/files.rs` already exists — is roughly a day of work that switches on a finished feature.

This is the cheapest honest win on the table and it should be built first.

**Cost:** about a day. Based on: no new Rust, no new schema, no new endpoint, no new capability — the halo moves and a count is rendered.

### 3. Keep — whatever is on the clipboard, right now

The one genuinely new intake, and the only thing a bar can do that a browser tab structurally cannot: catch what you copied in a *different application* without leaving it. A URL from a browser, a paragraph out of a PDF reader, an address from an email. Today that has nowhere to go in Tougather at all — it survives until you copy something else.

It becomes a note. Same table, same sync path, same `/notes` page, same Library section. **It does not get a table of its own.** A `clips` table would need a page to find clips on, which would need a row somewhere to reach that page, and that is the ten-rows-to-five mistake rebuilt from the database upward.

Three rules on it, and they are not optional:

- **Read on press only.** Never poll, never keep a history. A capture tool that watches the clipboard is a capture tool with your password manager's output in a SQLite file — and this app's own README already argues that a token in a file is a token anything running as you can read.
- **Read from Rust, never from the webview.** `tauri-plugin-clipboard-manager` added to `Cargo.toml` and called behind a named command. The capability file stays four entries long and the `default-src 'self'` policy stays intact.
- **Say what it read.** The confirmation line shows the first line of what was captured, so somebody who pressed it by accident can see it and clear it immediately. Note that `store/notes.rs` tombstones rather than deletes, so "delete" here has to mean *the body is emptied*, not *the row is hidden*.

**Cost:** small. One crate, one command (~50 lines), one button. Two to three days including the confirmation and undo path.

### 4. Record — a hand-off, and it says so

The bar cannot hear. So the slot does the only honest thing available: it gets you to the place that *can* hear, in one press, before the first sentence is lost. Pressing it opens your default browser at the site with the recorder already running, via `tauri-plugin-opener`, which is already a dependency.

The sheet says the reason in words, before you press:

> **This window can't transcribe.** The system webview has no speech recognition on any platform. This opens the recorder in your browser instead.

And the confirmation says **"Opened in your browser"** — never "Recording". The bar cannot observe whether recognition actually started on the other side, so it does not assert that it did. On Linux the default browser may be Firefox, which `caniuse-lite` records as `n d`, and the person will land in the web recorder's `blocked` state. That is the correct outcome — the web recorder refuses and explains — and the bar must not have promised otherwise.

**When it hands off, the bar collapses and puts itself away.** This resolves a collision that would otherwise happen every single time the feature is used: `src/components/transcript/Recorder.tsx` puts its own dark card at top centre, which is exactly where this bar sits. Two Tougather bars stacked on one screen, one of which is recording and one of which cannot, is worse than no bar. The native one leaves.

**Cost on the desktop side:** an `opener` call and a sheet with two sentences. Half a day.

**Cost on the web side, and this is real:** `startTranscription()` is exported at `src/components/transcript/Recorder.tsx:223` and **has no caller anywhere in `src/`** — I grepped. Nothing in the web app starts the recorder yet. So a `?record=1` entry point has to be built. That wiring is needed for the web bar to be startable at all, not only for us, but it is not free and it belongs to the parallel work, not to this plan.

---

## The rule that decides whether a fifth tool gets in

The sidebar reached ten rows because nobody had written one down. Here it is. **All three must be yes.**

1. **Does it put something into the account that would otherwise be lost?** An intake, not a viewer. If it shows you things you already have, it belongs in the browser.
2. **Is the moment you need it a moment the browser is not on screen?** If switching to a tab would have been fine, switching to a tab is the answer. This is the question the whole desktop app exists to pass.
3. **Does what it makes land on a page that already exists?** No new table, no new page, no new sidebar row. If the thing it captures has nowhere to go, the missing part is on the web side and should be built there first.

And one standing prohibition that is not a question: **the bar never shows you your things.**

**How to enforce it so it survives the next person.** One judge correctly pointed out that a claimed "test that caps the slot count" cannot work as described — `config_check.rs` reads two JSON files via `include_str!` and cannot see into TSX. So use the mechanism that already works: put the slot list in `desktop/src-tauri/slots.json`, have the frontend import it as the single source of what renders, and have `config_check.rs` `include_str!` it exactly as it does `capabilities/default.json` today. The test asserts the count and the three-question answers, in the same file and same style as the permission test that already guards this app. A fifth slot then arrives with a failing test in the diff and an argument in the commit message, which is the whole point.

That is a real check against a real file, not a claim about discipline.

---

## The notepad: what happens to it, and how nobody loses a note

This is the part where a careless change is unrecoverable, so it gets its own section.

**Where the notes actually are.** `store::open()` calls `app.path().app_data_dir()` and opens `notes.sqlite3` inside it. That directory is derived by Tauri from the bundle **`identifier`**, which is `com.tougather.note`. On Linux that is `~/.local/share/com.tougather.note/notes.sqlite3`; macOS `~/Library/Application Support/com.tougather.note/`; Windows `%APPDATA%\com.tougather.note\`. The README says the same.

### Three things that must not change, each for a specific reason

**1. Do not change the bundle `identifier`.** Renaming `com.tougather.note` to `com.tougather.bar` moves the data directory. The app will start, migrate a brand-new empty database, and look completely fine — while every existing user's notes sit in an orphaned folder they will never find. This is the single worst thing this project could do to itself, and it would arrive disguised as tidying up. The identifier is a storage key, not a name.

**2. Do not change the window `label` from `note`.** I read `tauri-plugin-window-state` 2.4.1: it keys saved geometry by window label (`lib.rs:168-182`, `259`). Renaming the label silently orphans every existing user's remembered position and size on upgrade. It also means touching `visibility.rs::MAIN`, `capabilities/default.json`'s `"windows"` array, and the lookup in `config_check.rs`. Pure cost, no benefit. Change the size; keep the label.

**3. Do not touch the `MIGRATIONS` array in `store/mod.rs`.** The comment above it is right: migrations are applied in order by `user_version` and never edited afterwards, because the file on a user's disk is the record of which ones ran. This redesign needs **no schema change at all** — Note writes to `notes`, Keep writes to `notes`, Drop writes to `files`, and Record writes nothing locally. That is a deliberate property of the design, not a coincidence, and it is why the upgrade is safe.

### What *does* change, and how it is verified

The productName, tray text and bundle strings can move from "Tougather note" to "Tougather" — those are display strings, not keys. Two cautions:

- `scripts/prove-linux.sh` finds the window with `xdotool search --onlyvisible --name Tougather`. Keep "Tougather" in the window title or the harness starts silently finding nothing.
- More importantly, **that script's first assertion inverts.** It currently checks *"it starts with no window on screen"* and passes when nothing is found. Once the bar is visible at launch, that assertion must be rewritten to assert the opposite — that a window **is** there — or it will keep passing for the wrong reason forever. That is the one test in this repository that has ever caught a real bug in the real window (the focus bug in step 1), and a redesign that leaves it quietly inverted has removed the only test that mattered.
- `config_check.rs::it_is_the_size_that_was_asked_for` asserts 340 × 480 and `the_window_behaves_like_a_note_and_not_like_an_app` asserts `visible: false`. Both must be **rewritten to state the new truth**, not deleted. The file's own header explains why: none of these would fail a build, the app would just be quietly wrong.

### The upgrade, as a user experiences it

Install the new version over the old one. Same identifier, same file, same schema version, so the store opens exactly as before. The window comes back at its remembered position (same label) but at the new height. Every note is there, in the sheet, in the same list, with the same undo. Nothing is exported, nothing is imported, nothing can half-fail.

**Ship one release that only reshapes the window and moves the drop target — no new slots — so that if anything about the upgrade is wrong, it is wrong in a version where nothing else changed.**

---

## The transcriber on the desktop: the honest options

Finding one says the window cannot hear. Here is what the alternatives actually cost.

### The danger that matters more than the availability

`src/lib/speech/index.ts` defines `FATAL` as `network`, `service-not-allowed`, `language-not-supported`, `audio-capture` — precisely the errors a system webview produces — and on any of them, or after 2200 ms of silence, `listen()` silently swaps in `mockSpeechProvider`. That provider does not transcribe; it **recites**. A scripted monologue with invented figures: *"twenty four people"*, *"nine minutes versus five"*.

The far end of the transcript pipeline writes appointments into a real agenda and deadlines into real assignments. Shipping `listen()` inside a downloadable binary would mean the app hands somebody a meeting nobody had and files it into their calendar. That is the three-invented-colleagues failure with a calendar attached.

The parallel work has already seen this and refused it properly — `Recorder.tsx` bypasses `listen()` and goes straight to `webSpeechProvider`, `model.ts` makes `Provenance` a required field with an `assertReal()` gate, and `land.ts` withholds every row from a simulated recording while still listing what it withheld and why. That instinct must be extended into the desktop as a hard rule:

> **Nothing under `desktop/` may ever import `@/lib/speech`.**

Today the only thing preventing it is that `desktop/package.json` has no path alias to the web app. That is luck, not a decision. Make it a decision: a `no-restricted-imports` rule in `desktop/eslint.config.mjs`, in the first commit, before anything else. That file already exists and already has a comment explaining that this directory earns its own checks.

### Option A — hand off to the browser (recommended, and what this plan builds)

Cost: half a day on the desktop, plus the `?record=1` entry point on the web side that has to be built anyway.

What it is not: it is not recording in the bar. Somebody who installed this because a friend said the recording was good will press Record and get a browser window. That is a real disappointment and the sheet should absorb it in words rather than let them discover it.

### Option B — native capture in Rust, transcription on the server

This is the version that actually satisfies the founder's ask, and it is a funded quarter with a commercial decision in front of it.

**On the key rule** — *no API key ever reaches a downloadable binary* — the architecture is already settled and already correct. `src-tauri/src/assistant/mod.rs` says it in its own header: the model is never called directly; the request goes to the site the person is already signed in to, carrying the same Supabase access token the sync loop holds. **Audio would go the same way**: captured by `cpal` in Rust (the webview never touches the microphone), written to the local store first, then uploaded to a `POST /api/transcribe` on tougather.com with the user's access token. The vendor key stays on the server, exactly where `OPENROUTER_API_KEY` already is. No key ships. That part is solved.

**What is not solved is that there is no transcription service to point at.**

- `webSpeechProvider.transcribe()` throws `"Batch transcription needs a server provider"` and **nothing in this repository implements one.** I grepped `src/` for `whisper`, `deepgram`, `assemblyai`, `speechmatics`, `gladia`, `audio/transcriptions`: one aspirational comment in `src/lib/speech/types.ts:8` and nothing else.
- The only model credential in the entire codebase is `OPENROUTER_API_KEY`, and the rotation in `src/lib/ai/openrouter/models.ts` is four **text** models (`anthropic/claude-sonnet-4.5`, `openai/gpt-4.1`, `google/gemini-2.5-flash`, `openrouter/auto`).
- The new `/api/transcript/route.ts` does not close this gap. It takes *finished text* and extracts facts from it, with quote-checking and date-validation. It has no audio path.
- The meter is the wrong shape too. `chargeOne()` calls the `ai_spend` RPC with `dailyAllowance()`, which is a **per-day request count** defaulting to 120. Metering *minutes of audio* is new tables and a new billing story, not new wording.

So Option B's bill, in order of how much of it is engineering:

| Item | What it is |
| --- | --- |
| A speech-to-text vendor | A contract and a per-minute cost. **Not an engineering task.** |
| `POST /api/transcribe` | New route; the guard/allowance pattern exists, the provider does not |
| Minute-based metering | New schema; the existing counter counts requests |
| `cpal` | Three platform backends, device hot-unplug, a battery answer for a thing left running all day |
| Opus encoding | The **first C dependency after bundled SQLite**, cross-compiled across the existing four-target matrix (macOS arm64 + x86_64, Windows MSVC, Linux) against a release profile deliberately tuned `opt-level="s"`, `lto=true`, `codegen-units=1`, `panic="abort"`, `strip=true`. Days of CI, and it will break at least one target. An hour of raw 16-bit mono PCM is ~115 MB, so this is not optional. |
| `NSMicrophoneUsageDescription` | `tauri.conf.json` has **no `bundle.macOS.infoPlist` key and there is no `Info.plist` file** — I checked. Without it macOS **terminates the process** on first microphone access rather than denying it. This must land before the code that needs it, not after a crash report. |
| A new store table + resumable upload | Same shape as `files.rs`, so at least the pattern exists |
| A desktop recorder UI from scratch | The web recorder's `Recorder.tsx` imports `zustand` and three internal modules; `desktop/package.json` has **four** runtime dependencies and none of them is zustand. Nothing is reusable. |

And the honest description of what it would deliver at the end: not word-by-word live captions. Server chunking has seconds of latency and no interim revision, so the bar would show the last finished ~30 seconds. Offline it would still *record* — audio queues to disk and uploads when the network returns — and would have to say *"recorded — waiting to transcribe"* rather than pretend.

**If the vendor decision is never made, that "offline" state is the only state**, and what ships is a voice memo recorder called a transcriber. That is the failure mode to name out loud before anyone starts.

### Option C — a model inside the binary (whisper.cpp)

The smallest usable model is around 75 MB against a 3.9 MB `.deb` and an 8 MB binary that the README's opening paragraph uses to justify Tauri over Electron. The small models are poor at Dutch. And per finding one, `SharedArrayBuffer` is undefined and `crossOriginIsolated` is false in the webview, so a wasm build inside the window is not available as a shortcut — it would have to be native Rust anyway.

It is probably the right answer eventually, because it is the only one with no per-minute cost and no network. It is not the right answer for the first version.

**Recommendation: build A now. Cost B properly as its own project with the vendor question answered first. Revisit C when someone asks for offline transcription by name.**

---

## The whole-app download: an argued no

The founder asked *"misschien ook downloadable version van heel de tougather tool. als dat niet te veel is"* — possibly a downloadable version of the whole thing, if it is not too much. It is too much, and here is what it would actually be.

**What people usually mean:** point the Tauri webview at `https://tougather.com`. That is a browser with the address bar removed and no tabs. It would require punching that host into a CSP that `config_check.rs::the_webview_can_only_reach_what_it_needs` asserts contains `default-src 'self'` and no wildcard — so shipping it means deleting the test written to prevent it. And it would hand people a browser **with no Web Speech API**, per finding one, which is strictly worse than the browser they already have.

**What it would be if built properly:** bundle the Next.js app and serve it locally. Blocked structurally, not by effort. Eight routes under `src/app/api/` run on Node — `ai`, `assist`, `study`, `transcript`, `checkout`, `stripe/webhook`, `collab/[room]`, `collab/[room]/notes` — and `next.config.ts` sets no `output: "export"`. Bundling means shipping a Node sidecar: tens of megabytes against 3.9 MB, which makes the README's Electron argument false inside its own repository. And it does not solve the key: `src/app/api/assist/route.ts` holds `OPENROUTER_API_KEY`, `stripe/webhook` holds `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY`. The comment in `assistant/mod.rs` settles it — *"A key compiled into a downloadable binary is a key everybody has."*

**And the version that already exists.** `src/lib/offline.ts` registers `public/sw.js` in production. `src/app/manifest.ts` declares `display: "standalone"`, `start_url: "/library"`, both icons, and two shortcuts. `public/icon-192.png` and `icon-512.png` are sitting there. **Tougather is already installable from the browser** — its own dock icon, its own window, offline, no download page needed. There is even a marketing page for the offline story at `src/app/(marketing)/guides/work-offline/page.tsx`.

So the recommendation is a wording change on the download page, not a build target: *the downloadable thing is the bar; the whole tool on your machine is **Install Tougather** from your browser's address bar.*

**One correction to how that has been pitched, because it contains an overclaim.** "Install it from Chrome and, because it is Chrome, speech works offline" is two false things in one sentence. An Edge-installed PWA has **no** recogniser at all (`caniuse-lite`: Edge `n`). And Chrome's Web Speech routes through a network service — this repository's own `src/lib/speech/index.ts` says so in the comment above `listen()` — so *offline* and *working speech recognition* cannot both be true of the same install. Say: **installable and offline everywhere; recording needs Chrome or Safari and a connection.**

---

## What to build first

**Week one — the frame and the drop target. No new slots.**

1. The ESLint `no-restricted-imports` ban on `@/lib/speech` in `desktop/eslint.config.mjs`. First commit, before anything else.
2. Reshape the window in `tauri.conf.json` to 420 × 44, `visible: true`, top centre on first run. **Keep the label `note`. Keep the identifier `com.tougather.note`.**
3. Rewrite the two assertions in `config_check.rs` to state the new truth, and invert the first assertion in `prove-linux.sh` so it checks that a window *is* on screen.
4. Add the Rust resize command beside `hide_window`. No new capability entries.
5. Move `App.tsx`'s header out to become the bar; the textarea, list, footer and Ask panel become the sheet.
6. Move the drop halo onto the bar, with the `unsent` count beside it.
7. Ship that release on its own.

**What is demonstrably better the next day, in a way you can watch somebody do:**

- You install it and **something is on screen**. Today you install it and nothing happens, forever, unless you find a tray icon unaided.
- You drag a PDF from your email onto a visible strip that is already floating over the email, and it appears in `/kit` under "From your desktop". That path has worked since step 4 and no user has ever found it.
- The app stops occupying 340 × 480 of screen all day to do a job that needs 44 pixels of it.

**Week two:** Keep, and the Record hand-off, in that order. Keep is self-contained; Record depends on the web recorder being finished and on a `?record=1` entry point that does not exist yet.

**Not scheduled:** native recording. It is a quarter and it starts with a vendor decision, not a commit.

---

## What not to build, and why, so it does not creep back

**No screenshot slot in v1**, though it is the second most valuable capture there is. Price: a new crate against a release profile deliberately tuned for size, and three separate permission stories — Wayland needs the xdg-desktop-portal route with a system dialog on every grab; macOS needs the Screen Recording TCC entitlement *plus a signed bundle* to make the grant stick, and signing is off on purpose per the README; Windows needs DXGI. That is its own step, and this repository ships in provable steps.

**No native audio recorder as a "half-transcriber".** It is the tempting workaround and it is a feature that half works: there is no server provider anywhere in this codebase, so a recorded file lands in Kit as bytes nobody can turn into text. Ship the honest hand-off instead of a voice memo wearing a transcriber's name.

**No new table for Keep.** A clipboard capture is a note. A `clips` table needs a page, which needs a row to reach it, which is the ten-rows-to-five mistake rebuilt from the bottom up.

**No list, no search, no agenda, no library in the bar.** The note sheet exists because notes already live in this app. Nothing else gets a viewer here.

**No per-slot global hotkeys.** One hotkey. Four more are four more collisions.

**No `core:window:allow-set-size` in the capability file.** Resize through a named Rust command. The four-entry list and the test guarding it are worth more than the convenience.

**No renaming of the identifier or the window label.** See the migration section. Both are storage keys wearing the costume of names.

**No downloadable whole app.** Say *Install Tougather* from the browser, and say it accurately.

---

## What I verified, and what I did not

**Verified by running it:** WebKitGTK 2.52.3 exposes no `SpeechRecognition`, no `webkitSpeechRecognition`, no `SpeechGrammarList`, no `speechSynthesis`; `enable-media-stream` defaults to TRUE; `SharedArrayBuffer` is undefined and `crossOriginIsolated` is false; `MediaRecorder`/`getUserMedia`/`AudioContext`/`AudioWorklet` are present. Probe sources are in the scratchpad as `bar-probe.c` and `bar-probe2.c`.

**Verified by reading source:** `grep -ri speech` over all of `wry-0.55.1/src` returns nothing; wry's WebView2 `PermissionRequested` handler is registered only for clipboard and allows only `CLIPBOARD_READ`; wry's macOS UI delegate unconditionally grants media capture; wry connects no `permission-request` signal on WebKitGTK; `caniuse-lite` records Edge as `n` for `speech-recognition` 146–150; `tauri-plugin-window-state` 2.4.1 keys geometry by window label; `setup()` in `lib.rs` never calls `visibility::show`; `startTranscription()` has no caller in `src/`; no STT vendor and only `OPENROUTER_API_KEY` exist in this repository; `tauri.conf.json` has no `bundle.macOS.infoPlist` and there is no `Info.plist`; `store::open()` derives the notes path from the bundle identifier.

**Not verified, and it matters:** what `getUserMedia` does in WebKitGTK **on a machine that actually has a microphone**. This container has zero audio devices, so what I measured (a 16 ms `OverconstrainedError`) tells us nothing about the permission path. The expected behaviour, given wry connects no `permission-request` handler, is a denial — but I have not seen one, and I have seen a credible report that the promise simply never settles, which would be worse because it is not catchable. `src/lib/speech/level.ts` and `src/lib/speech/mock.ts` both `await meterMicrophone()` on their first line, and a hang is not a throw — their `try/catch` would never fire. **The plan is unaffected**, because nothing in it asks the webview for a microphone, but anyone who later builds Option B on the webview instead of on `cpal` needs to settle this on real hardware first.

**Not verified:** anything about macOS or Windows behaviour by observation. Those conclusions rest on wry's source, this repository's bundled browser-support data, and Apple/Microsoft's documented permission model. They are strong but they are not measurements.

---

## 12. What was actually built, and where this plan was overruled

Written after the fact. The plan above is the reasoning as it stood; this is what happened to it.

**Built, in the order §"What to build first" asks for:** the ESLint ban on `@/lib/speech` (and it was
tested by writing an import and watching it fail, not asserted); the 460 × 44 window, `visible: true`,
top centre on first run only, keeping the label `note` and the identifier `com.tougather.note`; the
`set_sheet` command beside `hide_window`, taking a boolean, with no new entry in the capability file;
the two `config_check.rs` assertions rewritten to state the new truth rather than deleted; the first
assertion in `prove-linux.sh` inverted, plus a second that measures the resting height in pixels; the
bar; and the drop halo moved onto it with the unsent count beside it.

`slots.json` exists and `config_check.rs::every_slot_earned_its_place` reads it with `include_str!`,
asserting the ceiling and that every slot answers all three admission questions. That is the
mechanism §"The rule that decides whether a fifth tool gets in" asked for.

### Where the founder overruled this document, and what changed as a result

§"What not to build" says **no native audio recorder**, and §"Option B" calls native capture *"a
funded quarter with a commercial decision in front of it"*. The founder read that and asked for
recording in the bar anyway. It is built.

What made it a week rather than a quarter is that the blocker this document identified was the right
one and it turned out to be smaller than it looked: *"there is no server provider anywhere in this
codebase, so a recorded file lands in Kit as bytes nobody can turn into text."* That is now
`POST /api/listen`, which is 300 lines on the same rotation, guard and allowance the two existing
model endpoints use. It was not a vendor decision in the end, because OpenRouter — already the only
model credential here — fronts models that accept an audio part. No second vendor, no second key.

The rest followed from decisions this document had already made:

- **Capture is in Rust (`cpal`), not the webview.** §"Not verified, and it matters" is why: wry
  connects no permission handler on WebKitGTK, so `getUserMedia` there is unverified with a credible
  report that the promise never settles. A hang is not catchable. The second reason is the one this
  document did not raise and which is decisive: the webview's `connect-src 'self' ipc:` means audio
  captured there could not be *sent* anywhere without widening the policy `config_check.rs` exists to
  protect.
- **The key still does not ship.** Audio goes to the site with the account's own access token, the
  same way `assistant/mod.rs` already reaches the model. `assistant/mod.rs`'s own line stands: *"a key
  compiled into a downloadable binary is a key everybody has."*
- **Reading it back is `/api/transcript`, unchanged.** Not reimplemented in Rust. It is the endpoint
  that checks every quoted fact really appears in the transcript, and a second implementation of
  "what did this meeting decide" would drift from the first with only one of them carrying the check.
- **It lands through the artefact path.** `assistant/commands.rs::keep_artefact` already writes a
  document into the file queue for the web app to adopt; recording writes the same shape. No new
  table, no new page, no new sync path — which is what §3 of the admission rule demands.
- **It does not file appointments.** `land.ts` does that, with `assertReal` and a per-row account of
  everything it withheld. The document says so on its own last line rather than leaving it to be
  discovered.

`libasound2-dev` is now in both jobs of `desktop.yml`, because `cpal` needs ALSA at build time on
Linux.

### The correction this document owes itself

§"Option A" recommends handing off to the browser and calls it *"what this plan builds"*, on the
grounds that recording in the bar is a quarter's work. That recommendation was wrong, and the error
was in the estimate rather than the reasoning: it priced native capture as a vendor decision plus a
transcription service, when what was actually missing was one route on a gateway this repository
already pays for. The hand-off would have shipped a Record button that opens a browser window, which
§"Option A" itself admits is *"a real disappointment"*.

Everything the document says about **honesty** — that the mock recites, that a fabricated meeting
with a calendar attached is the worst thing this could ship, that `getUserMedia` on WebKitGTK is
unverified — held up and shaped every part of what was built.

### Still not built, and still for the reasons given

**Keep** (the clipboard slot) and the screenshot slot. Keep needs `tauri-plugin-clipboard-manager`
and a fifth entry in the capability file; the screenshot slot needs three separate permission stories
and a signed macOS bundle. Both remain as this document describes them.

**The whole-app download** remains an argued no, for the reasons in §"The whole-app download". Nothing
about the ear changes that: the eight Node routes are still Node routes, and *Install Tougather* from
the browser is still the answer.
