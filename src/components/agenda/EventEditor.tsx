"use client";

/**
 * One event, being made or changed.
 *
 * A card over the grid rather than a page: the calendar behind it is the
 * context — "does 14:00 clash with anything" is answered by looking, so the
 * grid has to stay visible while the times are chosen.
 */

import { useState } from "react";
import { COLORS, clock, type AgendaEvent, type EventColor } from "@/lib/agenda/model";
import { SWATCH } from "./palette";
import { cn } from "@/lib/cn";

export interface Draft {
  id?: string;
  title: string;
  day: string;
  start: number;
  end: number;
  color: EventColor;
  location: string;
  notes: string;
  repeat: "none" | "weekly";
}

export function draftFrom(event: AgendaEvent): Draft {
  return {
    id: event.id,
    title: event.title,
    day: event.day,
    start: event.start,
    end: event.end,
    color: event.color,
    location: event.location ?? "",
    notes: event.notes ?? "",
    repeat: event.repeat,
  };
}

const toMinutes = (value: string): number => {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function EventEditor({
  draft: given,
  onSave,
  onDelete,
  onClose,
}: {
  draft: Draft;
  onSave: (draft: Draft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(given);
  const put = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // An event that ends before it starts is a typo, and the database would
    // refuse it anyway — fix it here into the smallest sensible thing.
    const end = draft.end > draft.start ? draft.end : draft.start + 30;
    onSave({ ...draft, end });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-md border border-line bg-surface p-4 shadow-xl"
        aria-label={draft.id ? "Edit event" : "New event"}
      >
        <input
          value={draft.title}
          autoFocus
          placeholder="What is it?"
          onChange={(e) => put("title", e.target.value)}
          className="w-full border-0 bg-transparent text-[15px] font-medium text-fg outline-none placeholder:text-fg-subtle"
        />

        <div className="mt-3 grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
          <label className="text-[11px] text-fg-subtle" htmlFor="ev-day">
            Day
          </label>
          <input
            id="ev-day"
            type="date"
            value={draft.day}
            onChange={(e) => e.target.value && put("day", e.target.value)}
            className="rounded-sm border border-line bg-canvas px-2 py-1 text-[12.5px] text-fg"
          />
          <span className="text-[11px] text-fg-subtle">
            {clock(draft.start)}–{clock(draft.end)}
          </span>
          <span />

          <label className="text-[11px] text-fg-subtle" htmlFor="ev-start">
            From
          </label>
          <input
            id="ev-start"
            type="time"
            step={300}
            value={clock(draft.start)}
            onChange={(e) => e.target.value && put("start", toMinutes(e.target.value))}
            className="rounded-sm border border-line bg-canvas px-2 py-1 text-[12.5px] text-fg"
          />
          <label className="text-[11px] text-fg-subtle" htmlFor="ev-end">
            To
          </label>
          <input
            id="ev-end"
            type="time"
            step={300}
            value={clock(draft.end)}
            onChange={(e) => e.target.value && put("end", toMinutes(e.target.value))}
            className="rounded-sm border border-line bg-canvas px-2 py-1 text-[12.5px] text-fg"
          />
        </div>

        <div className="mt-3 flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={draft.color === color}
              title={color}
              onClick={() => put("color", color)}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-transform",
                draft.color === color
                  ? "scale-110 border-fg"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
              style={{ background: SWATCH[color] }}
            >
              <span className="sr-only">{color}</span>
            </button>
          ))}

          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-fg-muted">
            <input
              type="checkbox"
              checked={draft.repeat === "weekly"}
              onChange={(e) => put("repeat", e.target.checked ? "weekly" : "none")}
            />
            Every week
          </label>
        </div>

        <input
          value={draft.location}
          placeholder="Where? (optional)"
          onChange={(e) => put("location", e.target.value)}
          className="mt-3 w-full rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-subtle"
        />
        <textarea
          value={draft.notes}
          rows={2}
          placeholder="Notes (optional)"
          onChange={(e) => put("notes", e.target.value)}
          className="mt-2 w-full resize-y rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-subtle"
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] hover:brightness-110"
          >
            {draft.id ? "Save" : "Add"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
