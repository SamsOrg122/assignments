"use client";

/**
 * The notes, under the document.
 *
 * On screen they are always here at the end, because the screen has no pages
 * to put them at the foot of. The *choice* between foot and end is real
 * anyway: it decides what Word and PDF do with them, and it is set here rather
 * than buried in a settings panel because here is where somebody is looking at
 * their notes and thinking about it.
 *
 * Numbers come from `collectNotes`, which reads them in document order — the
 * same order the CSS counter uses in the prose, so the two never disagree.
 */

import { useMemo } from "react";
import { useProjects } from "@/lib/store";
import { collectNotes, type NotePlacement } from "@/lib/notes";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/cn";

export function NotesList({ project }: { project: Project }) {
  const setNotePlacement = useProjects((s) => s.setNotePlacement);
  const notes = useMemo(() => collectNotes(project.blocks), [project.blocks]);
  const placement: NotePlacement = project.notePlacement ?? "foot";

  if (!notes.length) return null;

  return (
    <section
      className="mt-10 border-t border-line pt-5"
      aria-label="Notes"
      data-notes
    >
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[12px] tracking-wide text-fg-muted uppercase">
          Notes
        </h2>
        <span className="flex items-center gap-1 print:hidden">
          {(
            [
              ["foot", "Footnotes"],
              ["end", "Endnotes"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setNotePlacement(project.id, value)}
              aria-pressed={placement === value}
              className={cn(
                "rounded-xs px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-150",
                placement === value
                  ? "bg-white/10 text-fg"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-subtle print:hidden">
          {placement === "foot"
            ? "printed at the foot of each page"
            : "printed together at the end"}
        </span>
      </div>

      <ol className="space-y-1.5">
        {notes.map((note) => (
          <li
            key={note.id}
            id={`note-${note.id}`}
            className="flex gap-2.5 text-[12.5px] leading-relaxed text-fg-muted"
          >
            <button
              type="button"
              // Back to where it was written. A note you cannot get out of is
              // a note you stop reading.
              onClick={() =>
                document
                  .getElementById(`block-${note.blockId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              aria-label={`Go to note ${note.number} in the text`}
              className="shrink-0 font-mono text-[11px] text-fg-subtle transition-colors hover:text-accent"
            >
              {note.number}.
            </button>
            <span className="min-w-0">{note.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
