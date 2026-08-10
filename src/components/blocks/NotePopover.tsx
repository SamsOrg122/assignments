"use client";

/**
 * Write the note.
 *
 * Word sends you to the bottom of the page and back; this stays where the
 * caret is, because a footnote is a thought you are having *now* and the
 * round trip is how it gets lost. ⌘Enter saves without reaching for the mouse.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function NotePopover({
  x,
  y,
  initial,
  onSave,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  /** Empty for a new note; the existing text when editing one. */
  initial: string;
  onSave: (text: string) => void;
  /** Absent when the note doesn't exist yet. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const width = 320;
  const left = Math.min(
    Math.max(8, x),
    (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16,
  );

  const save = () => {
    const trimmed = text.trim();
    // An empty note is a marker with nothing under it — a footnote number in
    // the text pointing at a blank line. Deleting is the honest reading.
    if (!trimmed) {
      if (onRemove) onRemove();
      else onClose();
      return;
    }
    onSave(trimmed);
  };

  return (
    <div
      ref={ref}
      className="anim-pop fixed z-50 overflow-hidden rounded-md border border-line-strong bg-surface shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
      style={{ left, top: y, width }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="quote" size={11} className="text-fg-subtle" />
        <span className="text-[11.5px] text-fg-muted">
          {onRemove ? "Note" : "New note"}
        </span>
        <kbd className="kbd ml-auto !px-1 !py-0.5">⌘↵</kbd>
      </div>

      <textarea
        ref={field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="What belongs at the bottom of the page…"
        className="w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
      />

      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={save}
          className="rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
        >
          Save
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "rounded-sm border border-line px-2.5 py-1 text-[12px] text-fg-muted",
              "transition-colors duration-150 hover:border-danger/50 hover:text-danger",
            )}
          >
            Delete
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-fg-subtle">
          {text.trim().split(/\s+/).filter(Boolean).length} words
        </span>
      </div>
    </div>
  );
}
