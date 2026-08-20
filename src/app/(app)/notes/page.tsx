"use client";

/**
 * The Notes page.
 *
 * Notes used to appear only as a strip inside the Library, and only when
 * there were some — so anybody who had not installed the desktop app saw
 * nothing at all and had no way to find out the thing existed. A feature you
 * can only discover by already using it is not a feature.
 *
 * So: a page of its own, in the sidebar, that says what this is whether or
 * not there is anything in it, and that carries the app itself.
 */

import { useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { useAuth } from "@/lib/auth/store";
import {
  DESKTOP_VERSION,
  DOWNLOADS,
  RELEASES_URL,
  deleteNote,
  listNotes,
  previewOf,
  saveNote,
  titleOf,
  type Note,
} from "@/lib/db/notes";
import Link from "next/link";

type Load = "reading" | "ready" | "unavailable";

export default function NotesPage() {
  const configured = useRemoteConfigured();
  const email = useAuth((s) => s.identity.email);

  const [notes, setNotes] = useState<Note[]>([]);
  const [load, setLoad] = useState<Load>("reading");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setNotes(await listNotes());
      setLoad("ready");
      setProblem(null);
    } catch (error) {
      // A deployment without migration 0005 has no `notes` table, which is
      // not a fault — it is a feature that has not been switched on. Say so
      // rather than showing an alarm.
      setLoad("unavailable");
      setProblem(String((error as Error).message ?? error));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listNotes();
        if (alive) {
          setNotes(all);
          setLoad("ready");
        }
      } catch (error) {
        if (alive) {
          setLoad("unavailable");
          setProblem(String((error as Error).message ?? error));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (note: Note) => {
    setBusy(true);
    try {
      await saveNote(note.id, draft);
      setOpen(null);
      await reload();
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: Note) => {
    setBusy(true);
    try {
      await deleteNote(note.id);
      if (open === note.id) setOpen(null);
      await reload();
    } catch (error) {
      setProblem(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">Notes</span>
        {notes.length > 0 && (
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
            {notes.length}
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-9 sm:px-8">
          <h1 className="text-[17px] font-medium tracking-tight text-fg">
            Notes
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
            A small window that sits above every other app on your computer.
            Press a key, write the thing down, press it again. What you write
            is kept on that machine first and reaches this account a moment
            later — so it works on a train, and it is here when you get back.
          </p>

          {/* ── The app ───────────────────────────────────────────────── */}
          <Desktop />

          {/* ── What is in the account ────────────────────────────────── */}
          <section className="mt-9" aria-labelledby="your-notes">
            <h2 id="your-notes" className="label-mono">
              In your account
            </h2>

            {/* Order matters. With no database `listNotes` returns an empty
                list rather than failing, so a plain "nothing here yet" would
                be told to somebody whose deployment has nowhere to put a note
                at all — true, and pointing at the wrong problem. */}
            {!configured ? (
              <Unavailable configured={false} problem={null} />
            ) : load === "reading" ? (
              <p className="mt-3 text-[12px] text-fg-subtle">Looking…</p>
            ) : load === "unavailable" ? (
              <Unavailable configured={configured} problem={problem} />
            ) : notes.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-fg-subtle">
                Nothing here yet.{" "}
                {email
                  ? "Notes you write in the desktop app will appear here within a minute."
                  : "Sign in on both this browser and the app, and they will meet here."}
              </p>
            ) : (
              <ul className="mt-3 grid gap-1.5">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-sm border border-line bg-surface px-3 py-2.5"
                  >
                    {open === note.id ? (
                      <div className="grid gap-2">
                        <label className="grid gap-1">
                          <span className="sr-only">Note</span>
                          <textarea
                            value={draft}
                            rows={6}
                            autoFocus
                            onChange={(e) => setDraft(e.target.value)}
                            className="w-full resize-y rounded-sm border border-line bg-canvas px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void save(note)}
                            className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpen(null)}
                            className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                          >
                            Cancel
                          </button>
                          <span className="text-[11px] text-fg-subtle">
                            Your desktop app picks this up within a minute.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setOpen(note.id);
                            setDraft(note.body);
                          }}
                        >
                          <span className="block truncate text-[13px] text-fg">
                            {titleOf(note) || "Empty note"}
                          </span>
                          <span className="mt-0.5 flex gap-2 text-[11px] text-fg-subtle">
                            <span className="min-w-0 flex-1 truncate">
                              {previewOf(note)}
                            </span>
                            <span className="shrink-0">
                              {formatDateTime(note.updatedAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(note)}
                          className="shrink-0 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {problem && load === "ready" ? (
              <p className="mt-2 text-[11px] text-warn" role="alert">
                {problem}
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * Why there is nothing to show, in the terms of whoever is reading.
 *
 * Three different causes with three different fixes, and lumping them into
 * "something went wrong" would leave all three unfixed.
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
        notes to be kept. The desktop app still works — everything stays on
        that computer.{" "}
        <Link href="/settings" className="text-accent hover:underline">
          Settings
        </Link>{" "}
        says what is missing.
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

/** Where to get the app. */
function Desktop() {
  return (
    <section
      className="mt-7 rounded-md border border-line bg-surface p-4"
      aria-labelledby="get-the-app"
    >
      <div className="flex items-center gap-2">
        <Icon name="sticky" size={13} className="shrink-0 text-accent" />
        <h2 id="get-the-app" className="text-[13px] font-medium text-fg">
          Get the floating note
        </h2>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {DOWNLOADS.map((platform) => (
          <a
            key={platform.label + (platform.note ?? "")}
            href={platform.href}
            className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-accent hover:text-fg"
          >
            <Icon name="download" size={12} className="shrink-0" />
            <span className="text-fg">{platform.label}</span>
            {platform.note ? (
              <span className="text-[11px] text-fg-subtle">{platform.note}</span>
            ) : null}
          </a>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-fg-subtle">
        Version {DESKTOP_VERSION}. Opens with{" "}
        <kbd className="rounded-xs border border-line px-1">⌘⇧N</kbd> on a Mac
        and{" "}
        <kbd className="rounded-xs border border-line px-1">Ctrl+Shift+N</kbd>{" "}
        everywhere else.
      </p>

      {/* Said here rather than discovered at the moment of installing. An
          unsigned build is not dangerous, but it looks exactly like one that
          is, and somebody who has not been warned is right to stop. */}
      <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
        The builds aren&apos;t code-signed yet. macOS will say the app is
        damaged until you right-click it and choose <em>Open</em>; Windows
        SmartScreen will warn once. Both are the same message every unsigned
        app gets.{" "}
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          All builds
        </a>
        .
      </p>
    </section>
  );
}
