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
import { useMenu } from "@/components/ui/Menu";
import { RowMenuButton } from "@/components/ui/RowMenuButton";
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
  // A note is the one row on this page that reached its destructive action
  // through a button of its own rather than through the ⋯ every other object
  // here uses. One home per action; this is that home.
  const menu = useMenu();
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
    /* This was a bordered, filled panel holding a bordered, filled list of
       rows — the page's only three-deep nest, and all of it drawn to say
       "these notes belong together", which a label and 40px of air say
       without any lines at all. */
    <section
      className="mb-(--space-5)"
      aria-labelledby="desktop-notes-heading"
      data-desktop-notes
    >
      {menu.node}
      <div className="mb-(--space-3) flex items-center gap-2">
        <Icon name="focus" size={12} className="shrink-0 text-fg-subtle" />
        <h2 id="desktop-notes-heading" className="text-meta text-fg-subtle">
          Notes
        </h2>
        <span className="text-meta text-fg-subtle">
          from the floating note on your desktop
        </span>
        {/* This strip is a convenience where the work is; the page is where
            notes are explained, managed and downloaded. `text-accent` is for
            links whose position does not already say they are links; this one
            sits at the end of a row of words, where it plainly does. */}
        <Link
          href="/notes"
          className="ml-auto text-meta text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          All notes
        </Link>
      </div>

      {/* Rows on air rather than on a divider. Each note was a bordered box
          with its own background, then a row on a hairline; a gap says the
          same thing and says it without an edge — an arrival notice should
          not outweigh the work it interrupts. */}
      <ul className="grid gap-(--space-3)">
        {notes.map((note) => (
          <li key={note.id} className="group relative">
            {open === note.id ? (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="sr-only">Note</span>
                  <textarea
                    value={draft}
                    rows={5}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full resize-y rounded-sm border border-line bg-surface px-2 py-1.5 text-body"
                  />
                </label>
                <div className="flex items-center gap-2">
                  {/* Two abutting controls, so a fill may stand in for the
                      border they both lose — but never alone: surface-2 is
                      1.08:1 on canvas in light, so weight and ink say which
                      one is the act and the fill only reinforces it. The
                      filled accent on this screen is New document, and there
                      is exactly one of it. */}
                  <button
                    type="button"
                    className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:text-fg"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                  <span className="ml-auto text-meta text-fg-subtle">
                    Your desktop app picks this up within a minute.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 pr-8">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setOpen(note.id);
                    setDraft(note.body);
                  }}
                >
                  <span className="block truncate text-body text-fg">
                    {titleOf(note) || "Empty note"}
                  </span>
                  {/* One line, both facts, next to each other. They were a
                      truncating preview pinned left and a timestamp pinned
                      right, which on a 1400px row put the note's own date 800
                      pixels from the note. Same two facts, same order, one
                      glance. */}
                  <span className="mt-(--space-1) flex min-w-0 gap-1 text-meta text-fg-subtle">
                    {/* A one-line note has no preview, and a separator with
                        nothing on its left reads as a typo. */}
                    {previewOf(note) && (
                      <>
                        <span className="min-w-0 truncate">{previewOf(note)}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="shrink-0">
                      {formatDateTime(note.updatedAt)}
                    </span>
                  </span>
                </button>
                {/* Delete keeps every word, every guard and every behaviour it
                    had — it has moved into the ⋯ that every other object on
                    this page already reaches its destructive action through.
                    RowMenuButton is still shown on hover and on keyboard
                    focus and is always present below 1024 where there is no
                    hover to reveal it, so nothing became unreachable. */}
                <RowMenuButton
                  label={`More for ${titleOf(note) || "Empty note"}`}
                  onOpen={(event: React.MouseEvent) =>
                    menu.open(event, [
                      {
                        kind: "item",
                        label: "Delete",
                        icon: "trash",
                        danger: true,
                        disabled: busy,
                        onSelect: () => void remove(note),
                      },
                    ])
                  }
                  className="top-0 right-0 translate-y-0"
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {problem ? (
        <p className="mt-(--space-2) text-meta text-warn" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
