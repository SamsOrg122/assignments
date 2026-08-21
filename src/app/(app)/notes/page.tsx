"use client";

/**
 * The notepad.
 *
 * It used to be a page *about* the desktop app with a read-only list under
 * it: no way to start a note, no way to search one, and a Save button under
 * every textarea. That was honest when the only way to write a note was to
 * install something, and it stopped being honest the moment the account grew
 * a table both ends could write to. A notepad you cannot write in is a
 * viewer, and calling it Notes in the sidebar was the tool over-promising.
 *
 * So: a rail of notes you can search, a note that saves itself, and an
 * assistant beside it that can either rewrite what is there or make a real
 * document out of it — the same endpoint, the same tools and the same
 * refusals as the floating desktop window, because two assistants with
 * different rules is two sets of bugs.
 *
 * The desktop app moved to Settings. It was the first thing on this page and
 * the least urgent thing on it; somebody who came here to write does not
 * want a download table first.
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

  const box = useRef<HTMLTextAreaElement>(null);

  /*
   * Writing, and what the list is told afterwards.
   *
   * The row in the rail carries the note's first line, so it has to move as
   * the note is typed — but re-reading the table on every save would be a
   * round trip per pause and would fight the caret. The list is patched from
   * what was just written instead, which is the same thing the database now
   * holds.
   */
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
    if (change.kind === "new") {
      await startNew(change.body);
      return;
    }
    if (!activeId) {
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
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[12px] transition-colors duration-150",
              asking
                ? "border-accent text-fg"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            <Icon name="sparkle" size={12} className={asking ? "text-accent" : undefined} />
            Ask
          </button>
        }
      >
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg md:hidden"
          aria-label={railOpen ? "Hide the list" : "Show the list"}
          aria-expanded={railOpen}
        >
          <Icon name="sticky" size={14} />
        </button>
        <span className="text-[13px] font-medium text-fg">Notes</span>
        {notes.length > 0 && (
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
            {notes.length}
          </span>
        )}
      </TopBar>

      <main className="relative flex min-h-0 flex-1">
        {/* ── The rail ─────────────────────────────────────────────── */}
        <aside
          className={cn(
            "w-[248px] shrink-0 flex-col border-r border-line bg-canvas",
            "absolute inset-y-0 left-0 z-20 md:static md:z-auto",
            railOpen ? "flex" : "hidden md:flex",
          )}
        >
          <div className="shrink-0 border-b border-line p-2">
            <div className="relative">
              <Icon
                name="search"
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes"
                aria-label="Search your notes"
                className="w-full rounded-sm border border-line bg-surface py-1.5 pl-7 pr-2 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => void startNew()}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-sm bg-accent px-2 py-1.5 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
            >
              <Icon name="plus" size={12} />
              New note
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {load === "reading" ? (
              <p className="px-2 py-3 text-[11.5px] text-fg-subtle">Looking…</p>
            ) : shown.length === 0 ? (
              <p className="px-2 py-3 text-[11.5px] leading-relaxed text-fg-subtle">
                {query.trim()
                  ? "Nothing matches that."
                  : email
                    ? "No notes yet. Press New note."
                    : "No notes yet. Sign in and they will follow you between machines."}
              </p>
            ) : (
              <ul className="grid gap-px">
                {shown.map((note) => (
                  <li key={note.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => void open(note)}
                      className={cn(
                        "w-full rounded-xs px-2 py-1.5 pr-7 text-left transition-colors duration-150",
                        note.id === activeId ? "bg-surface-2" : "hover:bg-surface",
                      )}
                    >
                      <span className="block truncate text-[12.5px] text-fg">
                        {titleOf(note) || "Empty note"}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-fg-subtle">
                        {previewOf(note) || formatDateTime(note.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(note)}
                      aria-label={`Delete ${titleOf(note) || "empty note"}`}
                      className="absolute right-1 top-1.5 rounded-xs p-1 text-fg-subtle opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg"
                    >
                      <Icon name="trash" size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-line px-2 py-1.5">
            {undo ? (
              <p className="flex items-center gap-2 text-[11px] text-fg-subtle">
                Deleted.
                <button
                  type="button"
                  onClick={() => void undoDelete()}
                  className="text-accent hover:underline"
                >
                  Undo
                </button>
              </p>
            ) : (
              <Link
                href="/settings#desktop"
                className="flex items-center gap-1.5 text-[11px] text-fg-subtle transition-colors duration-150 hover:text-fg"
              >
                <Icon name="download" size={11} />
                Get the floating note
              </Link>
            )}
          </div>
        </aside>

        {/* ── The note ─────────────────────────────────────────────── */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            asking ? "hidden lg:flex" : "flex",
          )}
        >
          {active ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[720px] px-5 py-6 sm:px-8">
                  <textarea
                    ref={box}
                    value={draft}
                    spellCheck
                    placeholder="Write it down…"
                    onChange={(e) => type_(e.target.value)}
                    onBlur={() => void flush()}
                    className="min-h-[60vh] w-full resize-none bg-transparent text-[14.5px] leading-[1.75] text-fg outline-none placeholder:text-fg-subtle"
                  />
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-1.5 sm:px-4">
                <span className="text-[11px] text-fg-subtle">
                  {saved === "saving"
                    ? "Saving…"
                    : saved === "failed"
                      ? "Not saved"
                      : saved === "saved"
                        ? "Saved"
                        : formatDateTime(active.updatedAt)}
                </span>
                <span className="text-[11px] text-fg-subtle">
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
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-[380px] text-center">
                <Icon name="sticky" size={22} className="mx-auto text-fg-subtle" />
                <p className="mt-3 text-[13px] text-fg">Nothing open.</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
                  Notes are kept in your account and reach the floating desktop
                  window within a minute — and it reaches back here.
                </p>
                <button
                  type="button"
                  onClick={() => void startNew()}
                  className="mt-4 rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  Write one
                </button>
              </div>
            </div>
          )}

          {problem && (
            <p className="shrink-0 border-t border-line px-3 py-1.5 text-[11px] text-warn" role="alert">
              {problem}
            </p>
          )}
        </section>

        {/* ── The assistant ────────────────────────────────────────── */}
        {asking && (
          <aside className="flex min-w-0 flex-1 flex-col border-line lg:w-[356px] lg:flex-none lg:border-l">
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

/** One of the small buttons under the note. */
function Tool({
  icon,
  children,
  onClick,
  title,
}: {
  icon: "copy" | "download" | "trash" | "sparkle";
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 rounded-xs px-1.5 py-1 text-[11px] text-fg-subtle transition-colors duration-150 hover:text-fg"
    >
      <Icon name={icon} size={11} />
      {children}
    </button>
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
