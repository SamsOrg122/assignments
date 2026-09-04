import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createNote,
  deleteNote,
  filesWaiting,
  hideWindow,
  listNotes,
  previewOf,
  readyToQuit,
  restoreNote,
  recordStanding,
  saveNote,
  setSheetOpen,
  storePath,
  syncNow,
  syncStanding,
  titleOf,
  type Note,
  type SyncStanding,
} from "./notes";
import { useAutosave } from "./useAutosave";
import { when } from "./when";
import { HOTKEY_LABEL } from "./platform";
import { signOut, standing as readStanding, type Standing } from "./auth";
import { SignIn } from "./SignIn";
import { StatusPill, type Flash } from "./StatusPill";
import { Connection } from "./Connection";
import { AskPanel } from "./AskPanel";
import { cancel as cancelAssistant } from "./assistant";
import { SLOTS } from "./slots";
import { DropSheet } from "./DropSheet";
import { RecordSheet } from "./RecordSheet";

type Status =
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; why: string };

/**
 * The bar, and the sheet under it.
 *
 * This was a 340 × 480 window that started hidden. Two things were wrong with
 * that and neither was visible from inside the code. It occupied a note-sized
 * rectangle of screen all day to do a job that needs 44 pixels of it — and
 * because `visible: false` and nothing in `setup()` ever showed it, installing
 * the app put *nothing* on screen, forever, unless somebody found the tray
 * icon unaided. A capture tool nobody can see captures nothing.
 *
 * So: a 460 × 44 strip at the top of the screen, always on top, there from the
 * moment it is installed. Pressing a slot grows this same window downward into
 * a sheet; Escape shrinks it back. One window, one label, one identifier —
 * see `visibility.rs` and the migration section of docs/desktop.md for why
 * those three are storage keys wearing the costume of names.
 *
 * What is on the bar comes from `src-tauri/slots.json` and nowhere else, and
 * `config_check.rs` reads that same file. A fourth slot arrives with a failing
 * test.
 *
 * The note itself is unchanged: same store, same autosave, same list, same
 * undo, same 256 KB refusal, same Ask panel. It is a sheet now instead of the
 * whole window.
 */
export function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "ready" });
  const [listOpen, setListOpen] = useState(false);
  const [undo, setUndo] = useState<Note | null>(null);
  const [where, setWhere] = useState<string | null>(null);
  // `null` while the first read is in flight, so the window does not flash
  // the sign-in screen at somebody who is already signed in.
  const [account, setAccount] = useState<Standing | null>(null);
  const [sync, setSync] = useState<SyncStanding | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [askingAI, setAskingAI] = useState(false);
  /** Which sheet is open under the bar, or null when it is just the bar. */
  const [sheet, setSheet] = useState<string | null>(null);
  /* The event listener below is registered once and would otherwise close
     over the first value this ever had. */
  const sheetRef = useRef<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  /**
   * Shown until the first thing is captured, and then never again.
   *
   * The resting state of this bar is blankness: after a week you learn that
   * text on it means something and nothing means nothing, and that is the only
   * property that makes an all-day presence tolerable rather than wallpaper.
   * But blankness on the first run reads as broken, and the opening move is
   * the only one somebody is guaranteed to see.
   */
  const [firstRun, setFirstRun] = useState(false);
  /**
   * Something is being recorded, whether or not the sheet is open.
   *
   * This is the one thing on the bar that has to be true when nobody is
   * looking at it. Closing the sheet does not stop a recording — it should
   * not, because the point of a recording is that you get on with the meeting
   * — and a bar that gives no sign of it is a bar somebody leaves listening
   * for an afternoon.
   */
  const [recording, setRecording] = useState(false);

  const box = useRef<HTMLTextAreaElement>(null);
  // The id the pending write belongs to. Switching notes flushes first, but a
  // write that is already in flight must still land on the note it came from.
  const writingFor = useRef<string | null>(null);

  const write = useCallback(async (body: string) => {
    const id = writingFor.current;
    if (!id) return;
    setStatus({ kind: "saving" });
    try {
      const saved = await saveNote(id, body);
      setNotes((all) =>
        [saved, ...all.filter((n) => n.id !== saved.id)].sort(
          (a, b) => b.updated_at - a.updated_at,
        ),
      );
      setStatus({ kind: "saved", at: saved.updated_at });
    } catch (error) {
      // Never silently. The text is still in the box, and saying so is the
      // difference between a user retyping it and a user losing it.
      setStatus({ kind: "failed", why: String(error) });
    }
  }, []);

  const { schedule, flush, pending } = useAutosave(write);

  /* ── Opening ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listNotes();
        if (!alive) return;
        const first = all[0] ?? (await createNote());
        if (!alive) return;
        /* Nothing written and nothing dropped means nobody has used this yet,
           which is the one moment the bar says something out loud. Derived
           rather than stored: a flag in settings would be a third thing that
           can disagree with the other two. */
        setFirstRun(all.length === 0 || (all.length === 1 && !all[0]!.body.trim()));
        setNotes(all.length ? all : [first]);
        setActiveId(first.id);
        writingFor.current = first.id;
        setDraft(first.body);
        setStatus({ kind: "ready" });
      } catch (error) {
        if (alive) setStatus({ kind: "failed", why: String(error) });
      }
    })();
    storePath().then(setWhere).catch(() => setWhere(null));
    readStanding().then(setAccount).catch(() => setAccount(null));
    syncStanding().then(setSync).catch(() => setSync(null));
    return () => {
      alive = false;
    };
  }, []);

  /* ── Quitting ────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Rust asks before it shuts the app down; see `ask_the_window_to_flush`.
    // Hiding needs no such thing — the webview survives, so the debounce
    // timer still fires — but quitting inside those 800ms would take the last
    // sentence with it.
    const stop = listen("note:flush", async () => {
      // A streaming answer is abandoned rather than waited for: the quit
      // path allows one second, and a model being thoughtful takes minutes.
      void cancelAssistant();
      await flush();
      await readyToQuit();
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [flush]);

  useEffect(() => {
    // Sync runs in Rust on its own beat, so the window is told rather than
    // asking. Two things arrive: where sync stands, and — separately —
    // whether anything on this machine actually changed, because reloading
    // the list on every round would fight with whatever is being typed.
    const stood = listen<SyncStanding>("sync:standing", (event) => setSync(event.payload));
    const changed = listen("notes:changed", () => {
      listNotes()
        .then((all) => {
          setNotes(all);
          // Whatever is open stays open, and its text is only replaced if the
          // note actually changed underneath — otherwise a round arriving
          // mid-sentence would move the caret to the end of a copy from
          // another machine.
          setDraft((mine) => {
            const fresh = all.find((n) => n.id === writingFor.current);
            return fresh && fresh.body !== mine && !pending() ? fresh.body : mine;
          });
        })
        .catch(() => {});
    });
    return () => {
      void stood.then((off) => off());
      void changed.then((off) => off());
    };
    // `pending` belongs here even though it never changes: the autosave is
    // built once, so this is a stable value and listing it costs a comparison
    // rather than a re-subscription. Leaving it out would be claiming a
    // guarantee about another module's internals from this one.
  }, [pending]);

  useEffect(() => {
    // Dropped files are taken natively — the OS hands Rust the paths — so
    // the window only hears about it afterwards. The halo says "yes, here";
    // the pill says what happened.
    let flashes = 0;
    const over = listen<boolean>("drop:over", (event) => setDropping(event.payload));
    const kept = listen<string>("drop:kept", (event) =>
      setFlash({ id: ++flashes, tone: "green", label: `Kept ${event.payload}` }),
    );
    const refused = listen<string>("drop:refused", (event) =>
      setFlash({ id: ++flashes, tone: "red", label: event.payload }),
    );
    return () => {
      void over.then((off) => off());
      void kept.then((off) => off());
      void refused.then((off) => off());
    };
  }, []);

  useEffect(() => {
    /* `record:level` arrives eight times a second while the microphone is
       open, so it doubles as the liveness signal; `record:done` is the end.
       Asked once at start too, because the window can be reloaded while Rust
       is still recording. */
    recordStanding().then(setRecording).catch(() => {});
    const level = listen("record:level", () => setRecording(true));
    const done = listen("record:done", () => setRecording(false));
    return () => {
      void level.then((off) => off());
      void done.then((off) => off());
    };
  }, []);

  useEffect(() => {
    /* The count beside Drop. Read once at start and again after every drop,
       because `store/files.rs::waiting` has counted these since the drop
       target was built and nothing has ever asked it — which is why the
       feature has worked for months and has no users. */
    const read = () => filesWaiting().then(setWaiting).catch(() => {});
    read();
    const kept = listen("drop:kept", read);
    const sent = listen("sync:stood", read);
    return () => {
      void kept.then((off) => off());
      void sent.then((off) => off());
    };
  }, []);

  useEffect(() => {
    /* Escape closes the nearest thing, and on this window the nearest thing
       is the sheet. It does not hide the bar: the bar is the app now, and a
       key that makes the whole product vanish is a key people press once. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showConnection) return setShowConnection(false);
      if (askingAI) {
        void cancelAssistant();
        return setAskingAI(false);
      }
      if (listOpen) return setListOpen(false);
      if (sheet !== null) setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, listOpen, askingAI, showConnection]);

  useEffect(() => {
    // Rust does the signing in, so it is Rust that knows when it finished —
    // the browser came back through a link this window never sees.
    const done = listen<Standing>("auth:signed-in", (event) => {
      setAccount(event.payload);
    });
    const failed = listen<string>("auth:failed", (event) => {
      // Read standing again rather than only stamping the message on: whether
      // the app is configured, and whether there is a keychain, may both have
      // changed by the time a sign-in fails.
      readStanding()
        .then((next) => setAccount({ ...next, problem: event.payload }))
        .catch(() =>
          setAccount((was) => (was ? { ...was, problem: event.payload } : was)),
        );
    });
    return () => {
      void done.then((off) => off());
      void failed.then((off) => off());
    };
  }, []);

  useEffect(() => {
    // Rust raises the window; this puts the caret where somebody who just
    // pressed the hotkey is about to start typing. Focusing the window is not
    // the same as focusing the note — the webview restores whatever had focus
    // when it was hidden, which after a couple of toggles is a header button.
    const stop = listen<boolean>("note:shown", (event) => {
      /*
       * The hotkey means "the note", and pressing it twice puts the app away.
       *
       * Rust shows the window when it is hidden and sends this event when it
       * is not; which of the two the second press should do depends on
       * whether the note is already open, and that is known here rather than
       * in Rust. So: closed → open the note. Already open → put the whole
       * thing away, which is what a second press of a summon shortcut has
       * always meant.
       */
      // The payload is "were you already on screen". Already showing the
      // note and asked for the note again means put it away; anything else
      // means give me the note.
      if (event.payload === true && sheetRef.current === "note") {
        // The same two steps `putAway` takes, inlined because that helper is
        // declared below this effect and a listener registered once must not
        // close over a stale copy of it.
        void flush().then(hideWindow);
        return;
      }
      setSheet("note");
      setListOpen(false);
      requestAnimationFrame(() => {
        const field = box.current;
        if (!field) return;
        field.focus();
        // At the end of what is already there, which is where you were.
        const end = field.value.length;
        field.setSelectionRange(end, end);
      });
    });
    return () => {
      void stop.then((off) => off());
    };
    // `flush` is built once by `useAutosave`, so this is a stable value and
    // listing it costs a comparison rather than a re-subscription — the same
    // reasoning as `pending` on the sync effect above.
  }, [flush]);

  /* ── Typing ──────────────────────────────────────────────────────────── */

  const type_ = (body: string) => {
    setDraft(body);
    schedule(body);
  };

  const open = async (note: Note) => {
    if (note.id === activeId) {
      setListOpen(false);
      return;
    }
    // Before anything else: the note being left has an unwritten keystroke in
    // it more often than not.
    await flush();
    writingFor.current = note.id;
    setActiveId(note.id);
    setDraft(note.body);
    setStatus({ kind: "ready" });
    setListOpen(false);
    requestAnimationFrame(() => box.current?.focus());
  };

  const startNew = async () => {
    await flush();
    try {
      const note = await createNote();
      setNotes((all) => [note, ...all]);
      writingFor.current = note.id;
      setActiveId(note.id);
      setDraft("");
      setStatus({ kind: "ready" });
      setListOpen(false);
      setSheet("note");
      setFirstRun(false);
      requestAnimationFrame(() => box.current?.focus());
    } catch (error) {
      setStatus({ kind: "failed", why: String(error) });
    }
  };

  const remove = async (note: Note) => {
    // Deliberately no "are you sure". A note is small, and a confirmation on
    // every delete trains people to click through confirmations. The undo
    // below is the safety net, and it is a better one.
    await flush();
    try {
      await deleteNote(note.id);
      const left = notes.filter((n) => n.id !== note.id);
      setNotes(left);
      setUndo(note);
      if (note.id === activeId) {
        const next = left[0] ?? (await createNote());
        if (!left.length) setNotes([next]);
        writingFor.current = next.id;
        setActiveId(next.id);
        setDraft(next.body);
      }
    } catch (error) {
      setStatus({ kind: "failed", why: String(error) });
    }
  };

  const undoDelete = async () => {
    if (!undo) return;
    try {
      const back = await restoreNote(undo.id);
      setUndo(null);
      if (back)
        setNotes((all) =>
          [back, ...all.filter((n) => n.id !== back.id)].sort(
            (a, b) => b.updated_at - a.updated_at,
          ),
        );
    } catch (error) {
      setStatus({ kind: "failed", why: String(error) });
    }
  };

  const putAway = async () => {
    // The timer would fire anyway — the window is hidden, not destroyed — but
    // waiting for it means the note is briefly on screen as unsaved in
    // another window if one is opened. Cheap to just write it.
    await flush();
    await hideWindow();
  };

  const active = notes.find((n) => n.id === activeId) ?? null;

  /*
   * When to insist on signing in.
   *
   * Only when signing in is actually possible: the site answered, and this
   * machine has somewhere safe to keep the session. A network that is down
   * and a keychain that is missing are not the user being signed out, and
   * refusing to let somebody write a note because tougather.com is
   * unreachable would be exactly the failure this whole app is built to
   * avoid. In those two cases the note works and a line says why nothing is
   * leaving the machine.
   */
  const mustSignIn = Boolean(
    account && !account.signed_in && account.configured && account.can_remember,
  );
  /*
   * The line above the note when something is degraded.
   *
   * It used to say "Can't reach tougather.com" and stop there, while the
   * actual reason — a deployment with no database configured, a domain not
   * serving yet, a certificate — sat on stderr where nobody looks. A message
   * that names the wrong cause is worse than no message: it sends people to
   * check DNS when the answer was a missing environment variable.
   */
  const workingAlone =
    account && !account.signed_in && !mustSignIn
      ? account.can_remember
        ? (account.problem ?? "Can't reach tougather.com.")
        : "No keychain on this computer, so signing in can't be remembered."
      : null;

  /*
   * The window is exactly two heights, and this is the only place either is
   * asked for. `open` is derived rather than stored so the sign-in door and
   * the connection panel — which must be readable and are not slots — cannot
   * end up showing inside a 44-pixel strip.
   */
  const sheetOpen = sheet !== null || mustSignIn || showConnection;
  useEffect(() => {
    void setSheetOpen(sheetOpen).catch(() => {});
    // Read by the hotkey listener, which is registered once and would
    // otherwise be looking at whatever was open when the app started.
    sheetRef.current = sheet;
  }, [sheetOpen, sheet]);

  return (
    <div className={sheetOpen ? "note open" : "note"}>
      <header className="bar" data-tauri-drag-region>
        <span className="mark" aria-hidden="true" data-tauri-drag-region />

        {/*
          * The slots, from `src-tauri/slots.json` and from nowhere else.
          *
          * Words rather than glyphs, and the file's own comment says why: a
          * picture of a page is guessable and a picture of a microphone is
          * guessable, but nothing in the world signals "paste whatever is on
          * my clipboard right now". Four short words and a dot is what decides
          * this window's width.
          */}
        {mustSignIn
          ? null
          : SLOTS.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={sheet === slot.id ? "slot on" : "slot"}
                aria-pressed={sheet === slot.id}
                title={slot.what}
                onClick={() => {
                  setFirstRun(false);
                  setAskingAI(false);
                  setListOpen(false);
                  setSheet((was) => (was === slot.id ? null : slot.id));
                }}
              >
                {slot.word}
                {slot.id === "drop" && waiting > 0 ? (
                  <span className="count">{waiting}</span>
                ) : null}
                {slot.id === "record" && recording ? (
                  <span className="live-dot" aria-label="recording" />
                ) : null}
              </button>
            ))}

        <span className="name" data-tauri-drag-region>
          {mustSignIn
            ? "Tougather"
            : firstRun
              ? `${HOTKEY_LABEL} to write · drag a file here`
              : askingAI
                ? "Assistant"
                : sheet === "note" && active
                  ? titleOf(active) || "New note"
                  : ""}
        </span>

        {sheet === "note" && !mustSignIn ? (
          <>
            <button
              type="button"
              className={askingAI ? "icon on" : "icon"}
              aria-pressed={askingAI}
              title="Ask the assistant"
              onClick={() => {
                setListOpen(false);
                setAskingAI((was) => {
                  // Leaving the panel abandons anything in flight rather than
                  // letting an answer arrive into a window nobody is reading.
                  if (was) void cancelAssistant();
                  return !was;
                });
              }}
            >
              <span aria-hidden="true">✦</span>
              <span className="sr-only">Ask the assistant</span>
            </button>
            <button
              type="button"
              className="icon"
              aria-expanded={listOpen}
              title={`All notes (${notes.length})`}
              onClick={() => {
                setAskingAI(false);
                setListOpen((o) => !o);
              }}
            >
              <span aria-hidden="true">☰</span>
              <span className="sr-only">All notes</span>
            </button>
            <button type="button" className="icon" title="New note" onClick={startNew}>
              <span aria-hidden="true">+</span>
              <span className="sr-only">New note</span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="icon"
          title={`Put away (${HOTKEY_LABEL})`}
          onClick={putAway}
        >
          <span aria-hidden="true">–</span>
          <span className="sr-only">Put away</span>
        </button>
      </header>

      <StatusPill
        saving={status.kind === "saving"}
        failed={status.kind === "failed" ? status.why : null}
        sync={sync}
        flash={flash}
      />

      {/*
        * The halo, moved onto the bar.
        *
        * `lib.rs` has taken dropped paths natively since step 4,
        * `store/files.rs` keeps them, `sync.rs::push_files` sends them, and
        * `/kit` has had the shelf and the empty state waiting the whole time.
        * The only affordance was a glow that appeared *after* you had already
        * begun dragging — over a window that was hidden. A permanently visible
        * strip floating above the email you are dragging out of is the
        * affordance that feature has been missing since the day it was built.
        */}
      {dropping ? (
        <div className="drop-halo" aria-hidden>
          <p>Drop it here — it lands in your library</p>
        </div>
      ) : null}

      {sheetOpen && workingAlone && !showConnection ? (
        <p className="banner">
          <span className="banner-text">{workingAlone}</span>
          <button
            type="button"
            className="link"
            onClick={() => setShowConnection(true)}
          >
            Fix
          </button>
        </p>
      ) : null}

      {!sheetOpen ? null : showConnection ? (
        <Connection
          problem={account?.problem ?? null}
          onChanged={setAccount}
          onClose={() => setShowConnection(false)}
        />
      ) : mustSignIn && account ? (
        <SignIn standing={account} onSignedIn={setAccount} />
      ) : askingAI && activeId ? (
        <AskPanel
          noteId={activeId}
          onClose={() => {
            void cancelAssistant();
            setAskingAI(false);
          }}
          onNotesChanged={() => {
            // The assistant writes straight to the store, so the window has
            // to read it back — the same reload a sync round triggers.
            listNotes()
              .then((all) => {
                setNotes(all);
                const fresh = all.find((n) => n.id === writingFor.current);
                if (fresh && !pending()) setDraft(fresh.body);
              })
              .catch(() => {});
          }}
        />
      ) : listOpen ? (
        <ul className="list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                className={note.id === activeId ? "row on" : "row"}
                onClick={() => void open(note)}
              >
                <span className="row-title">{titleOf(note) || "Empty note"}</span>
                <span className="row-sub">
                  <span className="row-preview">{previewOf(note)}</span>
                  <span className="row-when">{when(note.updated_at)}</span>
                </span>
              </button>
              <button
                type="button"
                className="row-bin"
                title="Delete"
                onClick={() => void remove(note)}
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Delete {titleOf(note) || "empty note"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : sheet === "record" ? (
        <RecordSheet />
      ) : sheet === "drop" ? (
        <DropSheet waiting={waiting} />
      ) : (
        <label className="write note-enter" key={activeId ?? "none"}>
          <span className="sr-only">Note</span>
          <textarea
            ref={box}
            value={draft}
            spellCheck
            autoFocus
            placeholder="Write it down…"
            onChange={(e) => type_(e.target.value)}
            // The moment focus leaves is a moment the pending write might not
            // survive. Cheap insurance.
            onBlur={() => void flush()}
          />
        </label>
      )}

      {sheetOpen ? (
      <footer className="foot">
        {mustSignIn ? (
          <span>Your notes stay on this computer until you sign in.</span>
        ) : undo ? (
          <>
            <span>Deleted.</span>
            <button type="button" className="link" onClick={() => void undoDelete()}>
              Undo
            </button>
          </>
        ) : (
          <Saved
            status={status}
            where={where}
            account={account}
            sync={sync}
            onSignOut={setAccount}
            onSynced={setSync}
          />
        )}
      </footer>
      ) : null}
    </div>
  );
}

function Saved({
  status,
  where,
  account,
  sync,
  onSignOut,
  onSynced,
}: {
  status: Status;
  where: string | null;
  account: Standing | null;
  sync: SyncStanding | null;
  onSignOut: (next: Standing) => void;
  onSynced: (next: SyncStanding) => void;
}) {
  if (status.kind === "failed")
    return (
      <span className="bad" role="alert">
        Not saved — {status.why}
      </span>
    );

  const signedIn = Boolean(account?.signed_in);

  /*
   * Two different sentences, and they are not interchangeable.
   *
   * Signed out, the note is on this computer and that is the whole truth.
   * Signed in, what matters is not whether it saved — it always saves — but
   * whether it has reached the account yet, because that is the difference
   * between losing this machine and losing nothing.
   */
  const line = !signedIn
    ? status.kind === "saved"
      ? `Saved ${when(status.at)} · on this computer`
      : "On this computer"
    : sync?.problem
      ? "On this computer — can't reach your account"
      : sync && sync.waiting > 0
        ? `${sync.waiting} ${sync.waiting === 1 ? "note" : "notes"} still to send`
        : sync && sync.at > 0
          ? `In your account · ${when(sync.at)}`
          : "On this computer";

  return (
    <>
      <span
        className={sync?.problem && signedIn ? "warn" : undefined}
        title={sync?.problem ?? where ?? undefined}
      >
        {line}
        {account?.email ? ` · ${account.email}` : ""}
      </span>
      {signedIn ? (
        sync?.problem || (sync && sync.waiting > 0) ? (
          <button
            type="button"
            className="link"
            onClick={() => void syncNow().then(onSynced).catch(() => {})}
          >
            Try now
          </button>
        ) : (
          <button
            type="button"
            className="link"
            onClick={() => void signOut().then(onSignOut)}
          >
            Sign out
          </button>
        )
      ) : null}
    </>
  );
}
