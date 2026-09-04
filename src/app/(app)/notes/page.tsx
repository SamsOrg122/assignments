"use client";

/**
 * The notepad.
 *
 * The layout is three blocks on a dark ground: the rail of notes, the sheet
 * somebody writes on, and the assistant when it is open. Everything that used
 * to be a hairline dividing two flat greys is now an edge on a real block —
 * the page reads as objects rather than as regions, which is the whole
 * difference between this and a settings screen.
 *
 * It deliberately does not use the app accent. That is a *preference*, and a
 * writing surface whose character changes when somebody picks teal has no
 * character. What it had instead was the default blue carrying the design: a
 * saturated slab for New note and a blue send button, with nothing else
 * holding any weight. The palette is in `globals.css` under `.pad`.
 *
 * Motion is doing real work here, not decoration. The selection in the rail
 * is one block that slides between rows, so switching notes reads as a
 * mechanism rather than as a repaint; the sheet lands when the note changes;
 * the assistant comes in from its own edge. All of it collapses under
 * `prefers-reduced-motion`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { download } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { useAuth } from "@/lib/auth/store";
import {
  createNote,
  deleteNote,
  listNotes,
  previewOf,
  saveNote,
  titleOf,
  type Note,
} from "@/lib/db/notes";
import { useAutosave } from "@/components/notes/useAutosave";
import { startTranscription } from "@/components/transcript/Recorder";
import { recorderAvailable } from "@/lib/transcript";
// Side effect, no exports: this is what registers the thing that turns a
// finished recording into a document. See the file — a surface that can start
// a recording and does not import it records an hour and then cannot file it.
import "@/lib/transcript/wire";
import { NoteAssistant } from "@/components/notes/NoteAssistant";
import type { AssistNote } from "@/lib/ai/assist/client";

type Load = "reading" | "ready" | "unavailable";
type Saved = "clean" | "saving" | "saved" | "failed";

export default function NotesPage() {
  const configured = useRemoteConfigured();
  const email = useAuth((s) => s.identity.email);

  const [notes, setNotes] = useState<Note[]>([]);
  const [load, setLoad] = useState<Load>("reading");
  const [problem, setProblem] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<Saved>("clean");
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState<Note | null>(null);
  const [asking, setAsking] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /**
   * Whether this browser can transcribe at all. `null` until it has been
   * asked, so the control claims nothing either way in the server's HTML —
   * the answer is a browser API and rendering it on the server would tell
   * every Chrome user their browser cannot do this until they hydrate.
   */
  const [canTranscribe, setCanTranscribe] = useState<boolean | null>(null);
  /** Ids that arrived after the first read, so only they animate in. */
  const [fresh, setFresh] = useState<string[]>([]);

  const box = useRef<HTMLTextAreaElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  const marker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Off the effect body: a setState inside one cascades a second render.
    void Promise.resolve().then(() => setCanTranscribe(recorderAvailable()));
  }, []);

  const write = useCallback(async (id: string, body: string) => {
    setSaved("saving");
    try {
      await saveNote(id, body);
      const updatedAt = Date.now();
      setNotes((all) =>
        all
          .map((n) => (n.id === id ? { ...n, body, updatedAt } : n))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
      setSaved("saved");
      setProblem(null);
    } catch (error) {
      // Never silently. The words are still in the box, and saying so is the
      // difference between somebody retyping them and losing them.
      setSaved("failed");
      setProblem(String((error as Error).message ?? error));
    }
  }, []);

  const { schedule, flush, forget } = useAutosave(write);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listNotes();
        if (!alive) return;
        setNotes(all);
        setLoad("ready");
        if (all[0]) {
          setActiveId(all[0].id);
          setDraft(all[0].body);
        }
      } catch (error) {
        if (!alive) return;
        // A deployment without migration 0005 has no `notes` table, which is
        // not a fault — it is a feature nobody has switched on yet.
        setLoad("unavailable");
        setProblem(String((error as Error).message ?? error));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active = notes.find((n) => n.id === activeId) ?? null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((n) => n.body.toLowerCase().includes(needle));
  }, [notes, query]);

  /*
   * Put the selection block over whichever row is open.
   *
   * Written straight onto the element rather than held in state: this is a
   * measurement, nothing renders from it, and a `setState` here would be a
   * second render on every keystroke that changes a row's height. The
   * transition lives in CSS, so all this does is name the destination.
   */
  useEffect(() => {
    const list = rail.current;
    const mark = marker.current;
    if (!list || !mark) return;

    const row = activeId
      ? list.querySelector<HTMLElement>(`[data-row="${CSS.escape(activeId)}"]`)
      : null;

    if (!row) {
      mark.style.opacity = "0";
      return;
    }
    mark.style.opacity = "1";
    mark.style.height = `${row.offsetHeight}px`;
    mark.style.transform = `translate3d(0, ${row.offsetTop}px, 0)`;
    // `railOpen` matters even though nothing here reads it: until the rail is
    // opened on a narrow screen it is `display: none`, and a hidden element
    // measures zero. Without this the block is placed against nothing and
    // never appears for anyone on a phone.
  }, [activeId, shown, load, railOpen]);

  /*
   * The sheet grows with the note.
   *
   * Set from the content rather than fixed, because a two-line note in a
   * 52vh box reads as an empty container somebody forgot to fill. Written
   * onto the element for the same reason the marker is: it is a measurement,
   * and routing it through state would re-render the page on every keystroke
   * to arrive at the number the browser already knows.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, activeId]);

  const open = async (note: Note) => {
    if (note.id === activeId) {
      setRailOpen(false);
      return;
    }
    // The note being left almost always has an unwritten keystroke in it.
    await flush();
    setActiveId(note.id);
    setDraft(note.body);
    setSaved("clean");
    setRailOpen(false);
    requestAnimationFrame(() => box.current?.focus());
  };

  const startNew = async (body = "") => {
    await flush();
    try {
      const note = await createNote(body);
      setNotes((all) => [note, ...all]);
      setFresh((all) => [...all, note.id]);
      setActiveId(note.id);
      setDraft(note.body);
      setSaved("clean");
      setRailOpen(false);
      requestAnimationFrame(() => box.current?.focus());
      return note;
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
      return null;
    }
  };

  const remove = async (note: Note) => {
    // Deliberately no "are you sure". A note is small, and a confirmation on
    // every delete trains people to click through confirmations. The undo
    // below is the safety net, and it is a better one.
    if (note.id === activeId) forget();
    else await flush();

    try {
      await deleteNote(note.id);
      const left = notes.filter((n) => n.id !== note.id);
      setNotes(left);
      setUndo(note);
      if (note.id === activeId) {
        setActiveId(left[0]?.id ?? null);
        setDraft(left[0]?.body ?? "");
        setSaved("clean");
      }
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    }
  };

  const undoDelete = async () => {
    if (!undo) return;
    try {
      // Saving a note clears its tombstone — see `saveNote`. So bringing one
      // back is writing its own text over itself, which is also what makes it
      // reappear on every other machine at the next sync round.
      await saveNote(undo.id, undo.body);
      const back = { ...undo, updatedAt: Date.now() };
      setNotes((all) => [back, ...all.filter((n) => n.id !== back.id)]);
      setFresh((all) => [...all, back.id]);
      setUndo(null);
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    }
  };

  const type_ = (body: string) => {
    if (!activeId) return;
    setDraft(body);
    setSaved("saving");
    schedule(activeId, body);
  };

  /** What the assistant asked for, applied to the note it was asked about. */
  const apply = async (change: AssistNote) => {
    if (change.kind === "new" || !activeId) {
      await startNew(change.body);
      return;
    }
    const body =
      change.kind === "append"
        ? draft.trim()
          ? `${draft.replace(/\s+$/, "")}\n\n${change.body}`
          : change.body
        : change.body;
    setDraft(body);
    forget();
    await write(activeId, body);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setProblem("This browser wouldn't let the page use the clipboard.");
    }
  };

  const words = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );

  /* ── When there is no notepad to show ──────────────────────────────── */

  if (!configured || load === "unavailable")
    return (
      <>
        <TopBar>
          <span className="text-[13px] font-medium text-fg">Notes</span>
        </TopBar>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[640px] px-5 py-9 sm:px-8">
            <h1 className="text-[17px] font-medium tracking-tight text-fg">Notes</h1>
            <Unavailable configured={configured} problem={problem} />
          </div>
        </main>
      </>
    );

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() => setAsking((o) => !o)}
            aria-pressed={asking}
            data-on={asking}
            className="pad-chip flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium"
          >
            <Icon name="sparkle" size={12} />
            Ask
          </button>
        }
      >
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          className="pad-ghost p-1.5 md:hidden"
          aria-label={railOpen ? "Hide the list" : "Show the list"}
          aria-expanded={railOpen}
        >
          <Icon name="sticky" size={14} />
        </button>
        <span className="text-[13px] font-medium text-fg">Notes</span>
        {notes.length > 0 && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] tabular-nums text-fg-muted">
            {notes.length}
          </span>
        )}
      </TopBar>

      <main className="pad relative flex min-h-0 flex-1">
        {railOpen && (
          <button
            type="button"
            aria-label="Close the list"
            onClick={() => setRailOpen(false)}
            className="absolute inset-0 z-10 md:hidden"
            style={{ background: "rgba(0, 0, 0, 0.45)" }}
          />
        )}

        {/* ── The rail ─────────────────────────────────────────────── */}
        <aside
          className={cn(
            "w-[270px] shrink-0 flex-col",
            "absolute inset-y-0 left-0 z-20 md:static md:z-auto",
            railOpen ? "flex" : "hidden md:flex",
          )}
          style={{ background: "var(--pad-void)" }}
        >
          <div className="shrink-0 px-3 pt-3 pb-2">
            <div className="relative">
              <Icon
                name="search"
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--pad-ink-3)" }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes"
                aria-label="Search your notes"
                className="pad-field w-full py-2 pl-8 pr-3 text-[12.5px]"
              />
            </div>
            <button
              type="button"
              onClick={() => void startNew()}
              className="pad-primary mt-2 flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12.5px]"
            >
              <Icon name="plus" size={13} />
              New note
            </button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {/* The block that slides. Behind the rows, moved by the effect. */}
            <div ref={marker} className="pad-marker" style={{ opacity: 0 }} />

            {load === "reading" ? (
              <p
                className="px-3 py-4 text-[12px]"
                style={{ color: "var(--pad-ink-3)" }}
              >
                Looking…
              </p>
            ) : shown.length === 0 ? (
              <p
                className="px-3 py-4 text-[12px] leading-relaxed"
                style={{ color: "var(--pad-ink-3)" }}
              >
                {query.trim()
                  ? "Nothing matches that."
                  : email
                    ? "No notes yet. Press New note."
                    : "No notes yet. Sign in and they will follow you between machines."}
              </p>
            ) : (
              <ul ref={rail} className="relative z-[1] grid gap-0.5">
                {shown.map((note) => (
                  <li
                    key={note.id}
                    data-row={note.id}
                    className={cn("group relative", fresh.includes(note.id) && "pad-row-in")}
                  >
                    <button
                      type="button"
                      onClick={() => void open(note)}
                      className="pad-row w-full px-3 py-2.5 pr-9 text-left"
                    >
                      <span
                        className="block truncate text-[13px] font-medium"
                        style={{
                          color:
                            note.id === activeId
                              ? "var(--pad-ink)"
                              : "var(--pad-ink-2)",
                        }}
                      >
                        {titleOf(note) || "Empty note"}
                      </span>
                      <span
                        className="mt-1 block truncate text-[11px]"
                        style={{ color: "var(--pad-ink-3)" }}
                      >
                        {previewOf(note) || formatDateTime(note.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(note)}
                      aria-label={`Delete ${titleOf(note) || "empty note"}`}
                      className="pad-ghost absolute right-2 top-2.5 p-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 px-3 py-2.5">
            {undo ? (
              <p
                className="pad-turn flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11.5px]"
                style={{ background: "var(--pad-slab-2)", color: "var(--pad-ink-2)" }}
              >
                Note deleted.
                <button
                  type="button"
                  onClick={() => void undoDelete()}
                  className="font-medium underline underline-offset-2"
                  style={{ color: "var(--pad-signal)" }}
                >
                  Undo
                </button>
              </p>
            ) : (
              <Link
                href="/settings#desktop"
                className="pad-ghost flex items-center gap-2 px-2 py-1.5 text-[11.5px]"
              >
                <Icon name="download" size={12} />
                Get the floating note
              </Link>
            )}
          </div>
        </aside>

        {/* ── The sheet ────────────────────────────────────────────── */}
        <section
          className={cn("min-w-0 flex-1 flex-col", asking ? "hidden lg:flex" : "flex")}
        >
          {active ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[780px] px-5 py-7 sm:px-8">
                {/*
                 * Keyed on the note so switching plays the landing animation.
                 * Without the key React reuses the element and the change is a
                 * silent text swap — correct, and it looks like a glitch.
                 */}
                <article key={active.id} className="pad-sheet px-7 py-6 sm:px-9 sm:py-8">
                  <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span
                      className="text-[11px] tracking-wide uppercase"
                      style={{ color: "var(--pad-ink-3)" }}
                    >
                      {formatDateTime(active.updatedAt)}
                    </span>
                    <State state={saved} />
                  </header>

                  <textarea
                    ref={box}
                    value={draft}
                    spellCheck
                    placeholder="Write it down…"
                    onChange={(e) => type_(e.target.value)}
                    onBlur={() => void flush()}
                    className="pad-write w-full bg-transparent text-[15px] leading-[1.8] outline-none"
                    style={{ color: "var(--pad-ink)" }}
                  />
                </article>

                <footer className="pad-slab mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 px-2.5 py-2">
                  <span
                    className="px-2 text-[11.5px] tabular-nums"
                    style={{ color: "var(--pad-ink-3)" }}
                  >
                    {words} {words === 1 ? "word" : "words"}
                  </span>
                  <span className="flex-1" />
                  <Tool onClick={() => void copy()} icon="copy">
                    {copied ? "Copied" : "Copy"}
                  </Tool>
                  <Tool
                    onClick={() =>
                      download(
                        `${(titleOf(active) || "note").replace(/[^\w \-.]+/g, "").slice(0, 60) || "note"}.txt`,
                        draft,
                        "text/plain;charset=utf-8",
                      )
                    }
                    icon="download"
                  >
                    Download
                  </Tool>
                  <Tool
                    onClick={() =>
                      void startTranscription({
                        // A note is not a project, so there is nothing for the
                        // document to say it came from. It still lands in the
                        // library, labelled transcript, like any other.
                        projectId: null,
                      })
                    }
                    icon="mic"
                    title={
                      canTranscribe === false
                        ? "This browser can't reach a microphone at all, so there is nothing to record."
                        : "Record a conversation. It becomes a document, and the appointments and deadlines in it are filed."
                    }
                  >
                    {/* Said here rather than after the press: a button that
                        opens something which then refuses is a button that
                        wasted your time. */}
                    {canTranscribe === false ? "Record (not here)" : "Record"}
                  </Tool>
                  <Tool
                    onClick={() => setAsking(true)}
                    icon="sparkle"
                    title="Ask the assistant to make a document out of this note"
                  >
                    Make something
                  </Tool>
                  <Tool onClick={() => void remove(active)} icon="trash">
                    Delete
                  </Tool>
                </footer>

                {problem && (
                  <p
                    className="pad-turn mt-3 rounded-xl px-3 py-2 text-[11.5px]"
                    style={{
                      background: "var(--pad-slab)",
                      color: "var(--pad-danger)",
                    }}
                    role="alert"
                  >
                    {problem}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Empty onWrite={() => void startNew()} />
          )}
        </section>

        {/* ── The assistant ────────────────────────────────────────── */}
        {asking && (
          <aside className="pad-panel flex min-w-0 flex-1 flex-col lg:w-[380px] lg:flex-none">
            <NoteAssistant
              note={active ? { id: active.id, body: draft } : null}
              onApply={apply}
              onClose={() => setAsking(false)}
            />
          </aside>
        )}
      </main>
    </>
  );
}

/**
 * Where the note stands, as one object rather than three.
 *
 * The dot pulses while writing is in flight and settles when it lands, so
 * "saving" and "saved" are the same thing in two states instead of two labels
 * swapping places.
 */
function State({ state }: { state: Saved }) {
  const label =
    state === "saving"
      ? "Saving"
      : state === "failed"
        ? "Not saved"
        : state === "saved"
          ? "Saved"
          : "In your account";

  return (
    <span
      className="pad-state text-[11px]"
      data-state={state}
      style={{
        color:
          state === "failed"
            ? "var(--pad-danger)"
            : state === "saved"
              ? "var(--pad-signal)"
              : "var(--pad-ink-3)",
      }}
    >
      <i className="pad-state-dot" />
      <span>{label}</span>
    </span>
  );
}

/** One of the small buttons under the sheet. */
function Tool({
  icon,
  children,
  onClick,
  title,
}: {
  icon: "copy" | "download" | "trash" | "sparkle" | "mic";
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="pad-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px]"
    >
      <Icon name={icon} size={12} />
      {children}
    </button>
  );
}

function Empty({ onWrite }: { onWrite: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="pad-sheet max-w-[420px] px-8 py-9 text-center">
        <div
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: "var(--pad-slab-3)", color: "var(--pad-signal)" }}
        >
          <Icon name="sticky" size={18} />
        </div>
        <p className="mt-4 text-[15px] font-medium" style={{ color: "var(--pad-ink)" }}>
          Nothing open.
        </p>
        <p
          className="mt-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--pad-ink-3)" }}
        >
          Notes are kept in your account and reach the floating desktop window
          within a minute — and it reaches back here.
        </p>
        <button
          type="button"
          onClick={onWrite}
          className="pad-primary mt-5 px-4 py-2.5 text-[12.5px]"
        >
          Write one
        </button>
      </div>
    </div>
  );
}

/**
 * Why there is no notepad, in the terms of whoever is reading.
 *
 * Two different causes with two different fixes, and lumping them into
 * "something went wrong" would leave both unfixed.
 */
function Unavailable({
  configured,
  problem,
}: {
  configured: boolean;
  problem: string | null;
}) {
  if (!configured)
    return (
      <p className="mt-3 text-[12px] leading-relaxed text-fg-subtle">
        This deployment has no database configured, so there is nowhere for
        notes to be kept.{" "}
        <Link href="/settings#connection" className="text-accent hover:underline">
          Settings
        </Link>{" "}
        says what is missing. The desktop app still works — everything stays on
        that computer until there is an account to reach.
      </p>
    );

  return (
    <div className="mt-3 rounded-sm border border-line bg-surface px-3 py-2.5">
      <p className="text-[12px] leading-relaxed text-fg-muted">
        The notes table isn&apos;t there yet. Run{" "}
        <code className="rounded-xs bg-canvas px-1 py-0.5 text-[11px]">
          supabase/migrations/0005-notes-that-follow-you.sql
        </code>{" "}
        in the Supabase SQL editor and reload this page.
      </p>
      {problem ? (
        <p className="mt-1.5 text-[11px] text-fg-subtle">{problem}</p>
      ) : null}
    </div>
  );
}
