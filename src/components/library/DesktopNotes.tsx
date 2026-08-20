"use client";

/**
 * Notes written on the floating desktop note, seen from the browser.
 *
 * The other half of "kept in your account". Without this, signing the desktop
 * app in would mean the notes go *somewhere* and are never seen again — which
 * is a backup, not a workspace, and calling it the latter would be the kind of
 * claim this product has spent a lot of effort not making.
 *
 * Quiet when there are none, which is everybody who has not installed the app.
 * Quiet, too, when there is no account or no database: a section that appears
 * empty on a deployment where notes cannot exist is a section that makes
 * people look for a feature that is not there.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";
import {
  deleteNote,
  listNotes,
  previewOf,
  saveNote,
  titleOf,
  type Note,
} from "@/lib/db/notes";

export function DesktopNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setNotes(await listNotes());
      setProblem(null);
    } catch (error) {
      // Never an alarm. The overwhelming majority of people have no notes and
      // no desktop app, and a red bar on their Library for a table that does
      // not exist on their deployment would be noise. It stays silent and
      // shows nothing.
      setNotes([]);
      setProblem(String((error as Error).message ?? error));
    }
  }, []);

  useEffect(() => {
    // Wrapped rather than called straight, so the state only ever moves from
    // inside the promise — a synchronous set here would cascade renders on
    // every Library load.
    let alive = true;
    (async () => {
      try {
        const all = await listNotes();
        if (alive) setNotes(all);
      } catch {
        // Silent, and deliberately. Most people have no notes, no desktop app
        // and — on a deployment without the migration — no table; a red bar on
        // their Library for that would be noise about a feature they are not
        // using.
        if (alive) setNotes([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (notes.length === 0) return null;

  const editing = notes.find((note) => note.id === open) ?? null;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saveNote(editing.id, draft);
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
    <section
      className="mb-4 rounded-md border border-line bg-surface p-2.5"
      aria-labelledby="desktop-notes-heading"
      data-desktop-notes
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon name="focus" size={12} className="shrink-0 text-fg-subtle" />
        <h2 id="desktop-notes-heading" className="label-mono">
          Notes
        </h2>
        <span className="text-[11px] text-fg-subtle">
          from the floating note on your desktop
        </span>
        {/* This strip is a convenience where the work is; the page is where
            notes are explained, managed and downloaded. */}
        <Link
          href="/notes"
          className="ml-auto text-[11px] text-accent hover:underline"
        >
          All notes
        </Link>
      </div>

      <ul className="grid gap-1.5">
        {notes.map((note) => (
          <li
            key={note.id}
            className="rounded-sm border border-line bg-canvas px-2.5 py-2"
          >
            {open === note.id ? (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="sr-only">Note</span>
                  <textarea
                    value={draft}
                    rows={5}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full resize-y rounded-sm border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                  <span className="ml-auto text-[11px] text-fg-subtle">
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
                  <span className="block truncate text-sm">
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
                  className="shrink-0 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void remove(note)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {problem ? (
        <p className="mt-2 text-[11px] text-warn" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
