import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createNote,
  deleteNote,
  hideWindow,
  listNotes,
  previewOf,
  readyToQuit,
  restoreNote,
  saveNote,
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
import { Assistant } from "./Assistant";
import { cancel as cancelAssistant } from "./assistant";

type Status =
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; why: string };

/**
 * The note.
 *
 * One note on screen at a time, and a list you pull down over it. In a
 * 340-pixel window a permanent sidebar would leave about 200 pixels to write
 * in, and the thing this app is for is writing something down before you
 * forget it — not browsing.
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
    const stop = listen("note:shown", () => {
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
  }, []);

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

  return (
    <div className="note">
      <header className="bar" data-tauri-drag-region>
        {mustSignIn ? null : (
          <button
            type="button"
            className="chip"
            aria-expanded={listOpen}
            onClick={() => {
              setAskingAI(false);
              setListOpen((o) => !o);
            }}
          >
            {listOpen ? "Close" : `Notes (${notes.length})`}
          </button>
        )}

        <span className="name" data-tauri-drag-region>
          {mustSignIn
            ? "Tougather note"
            : askingAI
              ? "Assistant"
              : active
                ? titleOf(active) || "New note"
                : ""}
        </span>

        {mustSignIn ? null : (
          <>
            <button
              type="button"
              className={askingAI ? "chip on" : "chip"}
              aria-pressed={askingAI}
              title="Ask the assistant"
              onClick={() => {
                setListOpen(false);
                setAskingAI((open) => {
                  // Leaving the panel abandons anything in flight rather than
                  // letting an answer arrive into a window nobody is reading.
                  if (open) void cancelAssistant();
                  return !open;
                });
              }}
            >
              Ask
            </button>
            <button type="button" className="icon" title="New note" onClick={startNew}>
              <span aria-hidden="true">+</span>
              <span className="sr-only">New note</span>
            </button>
          </>
        )}
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

      {dropping ? (
        <div className="drop-halo" aria-hidden>
          <p>Drop to keep it in your library</p>
        </div>
      ) : null}

      {workingAlone && !showConnection ? (
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

      {showConnection ? (
        <Connection
          problem={account?.problem ?? null}
          onChanged={setAccount}
          onClose={() => setShowConnection(false)}
        />
      ) : mustSignIn && account ? (
        <SignIn standing={account} onSignedIn={setAccount} />
      ) : askingAI && activeId ? (
        <Assistant
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
