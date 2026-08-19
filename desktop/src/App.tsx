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
  titleOf,
  type Note,
} from "./notes";
import { useAutosave } from "./useAutosave";
import { when } from "./when";
import { HOTKEY_LABEL } from "./platform";

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

  const { schedule, flush } = useAutosave(write);

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
      await flush();
      await readyToQuit();
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [flush]);

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

  return (
    <div className="note">
      <header className="bar" data-tauri-drag-region>
        <button
          type="button"
          className="chip"
          aria-expanded={listOpen}
          onClick={() => setListOpen((o) => !o)}
        >
          {listOpen ? "Close" : `Notes (${notes.length})`}
        </button>

        <span className="name" data-tauri-drag-region>
          {active ? titleOf(active) || "New note" : ""}
        </span>

        <button type="button" className="icon" title="New note" onClick={startNew}>
          <span aria-hidden="true">+</span>
          <span className="sr-only">New note</span>
        </button>
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

      {listOpen ? (
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
        <label className="write">
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
        {undo ? (
          <>
            <span>Deleted.</span>
            <button type="button" className="link" onClick={() => void undoDelete()}>
              Undo
            </button>
          </>
        ) : (
          <Saved status={status} where={where} />
        )}
      </footer>
    </div>
  );
}

function Saved({ status, where }: { status: Status; where: string | null }) {
  if (status.kind === "failed")
    return (
      <span className="bad" role="alert">
        Not saved — {status.why}
      </span>
    );
  if (status.kind === "saving") return <span>Saving…</span>;
  if (status.kind === "saved")
    return (
      <span title={where ?? undefined}>
        Saved {when(status.at)} · on this computer
      </span>
    );
  return (
    <span title={where ?? undefined}>
      On this computer only — sign in comes in step 3
    </span>
  );
}
