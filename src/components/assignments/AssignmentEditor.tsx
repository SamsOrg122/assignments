"use client";

/**
 * Writing an assignment down.
 *
 * A panel rather than a modal, and everything on one screen rather than a
 * wizard: what is being captured is five short facts, and anything that
 * spreads five short facts over two steps is a form that makes people put it
 * off. The one required field is the title; a deadline defaults to today
 * rather than to empty, because an assignment with no date is the thing this
 * whole feature exists to stop somebody keeping in their head.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { DayKey } from "@/lib/agenda/model";
import type { Assignment } from "@/lib/assignments/model";

export interface Draft {
  id: string | null;
  title: string;
  course: string;
  due: DayKey;
  /** `HH:MM`, or empty for a deadline that is a day rather than a moment. */
  time: string;
  notes: string;
  scope: "personal" | "team";
}

export const draftFrom = (
  assignment: Assignment | null,
  fallbackDay: DayKey,
  scope: "personal" | "team",
): Draft => ({
  id: assignment?.id ?? null,
  title: assignment?.title ?? "",
  course: assignment?.course ?? "",
  due: assignment?.due ?? fallbackDay,
  time:
    assignment?.dueMinute === undefined
      ? ""
      : `${String(Math.floor(assignment.dueMinute / 60)).padStart(2, "0")}:${String(
          assignment.dueMinute % 60,
        ).padStart(2, "0")}`,
  notes: assignment?.notes ?? "",
  scope: assignment?.scope ?? scope,
});

/** `HH:MM` back to minutes, or undefined when the field is empty or junk. */
export function minutesOf(time: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

export function AssignmentEditor({
  draft,
  hasTeam,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  draft: Draft;
  hasTeam: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const title = useRef<HTMLInputElement>(null);

  useEffect(() => {
    title.current?.focus();
    title.current?.select();
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const field =
    "w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <form
        className="relative flex h-full w-full max-w-[380px] flex-col gap-3 overflow-y-auto border-l border-line bg-surface-2 p-4"
        aria-label={draft.id ? "Edit assignment" : "New assignment"}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-fg">
            {draft.id ? "Assignment" : "New assignment"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-fg-subtle hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <label className="grid gap-1">
          <span className="text-meta text-fg-subtle">What is it</span>
          <input
            ref={title}
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder="Essay on the Treaty of Utrecht"
            className={field}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-meta text-fg-subtle">Course</span>
          <input
            value={draft.course}
            onChange={(e) => onChange({ ...draft, course: e.target.value })}
            placeholder="History 210"
            className={field}
          />
        </label>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="grid gap-1">
            <span className="text-meta text-fg-subtle">Due</span>
            <input
              type="date"
              value={draft.due}
              onChange={(e) => onChange({ ...draft, due: e.target.value })}
              className={field}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-meta text-fg-subtle">Time</span>
            <input
              type="time"
              value={draft.time}
              onChange={(e) => onChange({ ...draft, time: e.target.value })}
              aria-label="Time it is due"
              className={cn(field, "w-[104px]")}
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-meta text-fg-subtle">Notes</span>
          <textarea
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            rows={4}
            placeholder="What it has to cover, how long, who marks it"
            className={cn(field, "resize-none leading-relaxed")}
          />
        </label>

        {hasTeam && (
          <div className="grid gap-1">
            <span className="text-meta text-fg-subtle">Whose</span>
            <div className="flex rounded-sm border border-line p-0.5" role="group">
              {(["personal", "team"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ ...draft, scope: option })}
                  aria-pressed={draft.scope === option}
                  className={cn(
                    "flex-1 rounded-xs px-2 py-1 text-[11.5px] capitalize transition-colors",
                    draft.scope === option
                      ? "bg-surface text-fg"
                      : "text-fg-subtle hover:text-fg",
                  )}
                >
                  {option === "personal" ? "Mine" : "The team's"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-accent px-3 py-2 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {draft.id ? "Save" : "Add it"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => (confirming ? onDelete() : setConfirming(true))}
              className={cn(
                "rounded-sm border px-3 py-2 text-[12px] transition-colors",
                confirming
                  ? "border-warn text-warn"
                  : "border-line text-fg-subtle hover:text-fg",
              )}
            >
              {confirming ? "Really delete" : "Delete"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
