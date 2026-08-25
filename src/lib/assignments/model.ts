/**
 * What an assignment is, and how far away its deadline is.
 *
 * Pure functions and no store, for the reason the agenda's model gives: the
 * questions here — is this late, how late, what should the card say — are the
 * ones that go quietly wrong around midnight and at month boundaries, and a
 * pure function is the only kind a test can pin down.
 *
 * Days are `YYYY-MM-DD` and a time is minutes from midnight, matching the
 * agenda exactly. A deadline is a wall-clock fact: "Friday 17:00" is Friday
 * at five wherever the person happens to be, and storing it as an instant
 * would move everybody's deadline the first time the clocks changed.
 */

import type { DayKey } from "../agenda/model";

/** Where an assignment has got to. Three states, and no more. */
export type Status = "todo" | "doing" | "handed";

export interface Assignment {
  id: string;
  title: string;
  /** The course, module or client. Free text — nobody wants a taxonomy. */
  course?: string;
  /** The day it is due. */
  due: DayKey;
  /** Minutes from midnight, when the deadline has a time of day. */
  dueMinute?: number;
  status: Status;
  /** The document being written for it, once one has been started. */
  projectId?: string;
  notes?: string;
  scope?: "personal" | "team";
  /** Milliseconds since the epoch; last-write-wins against the account. */
  updatedAt: number;
}

export const STATUSES: Status[] = ["todo", "doing", "handed"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "Not started",
  doing: "In progress",
  handed: "Handed in",
};

/**
 * Whole days from one day to another, by the calendar rather than the clock.
 *
 * Both keys are parsed as UTC midnight, so the subtraction is exact and no
 * daylight-saving hour can make "tomorrow" come out as 0 or 2. What is being
 * asked is how many times midnight passes, not how many hours elapse.
 */
export function daysBetween(from: DayKey, to: DayKey): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** How a deadline reads, and how alarmed the card should look about it. */
export interface Standing {
  text: string;
  tone: "calm" | "soon" | "late" | "done";
}

/**
 * What to say about when this is due.
 *
 * "Overdue by 3 days" rather than a red date, because a date needs arithmetic
 * done in the reader's head and the whole point of the card is to save them
 * that. A handed-in assignment says so and stops counting: once it is gone,
 * how late it was is history and no longer a thing to be alarmed by.
 */
export function standing(assignment: Assignment, today: DayKey): Standing {
  if (assignment.status === "handed") return { text: "Handed in", tone: "done" };

  const days = daysBetween(today, assignment.due);

  if (days < 0) {
    const late = Math.abs(days);
    return {
      text: late === 1 ? "Overdue by a day" : `Overdue by ${late} days`,
      tone: "late",
    };
  }
  if (days === 0) return { text: "Due today", tone: "late" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { text: `${days} days left`, tone: "soon" };
  if (days <= 30) return { text: `${days} days left`, tone: "calm" };

  const weeks = Math.round(days / 7);
  return { text: `${weeks} weeks left`, tone: "calm" };
}

/** A deadline's time of day, when it has one. Matches the agenda's clock. */
export function dueClock(assignment: Assignment): string | null {
  const minute = assignment.dueMinute;
  if (minute === undefined) return null;
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * The order a board column shows them in: soonest deadline first, and among
 * equal days the one with a time of day before the one without.
 *
 * Never by when they were made. An assignment list sorted by creation is a
 * list nobody can read the top of.
 */
export function byDeadline(a: Assignment, b: Assignment): number {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  const at = a.dueMinute ?? 24 * 60;
  const bt = b.dueMinute ?? 24 * 60;
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title);
}

/**
 * The ones worth putting in front of somebody, newest deadline first.
 *
 * Handed-in work is left out: it is the answer to "what have I done", and
 * this is the answer to "what is coming", which is a different question and
 * the one anybody opening the app has.
 */
export function pressing(assignments: Assignment[], today: DayKey, within = 14): Assignment[] {
  return assignments
    .filter((a) => a.status !== "handed" && daysBetween(today, a.due) <= within)
    .sort(byDeadline);
}
