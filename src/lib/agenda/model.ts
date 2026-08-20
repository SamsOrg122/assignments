/**
 * What an event is, and the date arithmetic the views stand on.
 *
 * Pure functions, no store, no React — because the questions here ("does this
 * event occur on that day", "which events overlap and how do they share the
 * width") are exactly the ones that go quietly wrong at month boundaries and
 * on repeating events, and pure functions are the ones a test can actually
 * pin down.
 *
 * Days are `YYYY-MM-DD` strings and times are minutes from midnight, on
 * purpose. A `Date` carries a timezone with it everywhere it goes, and a
 * lecture at 09:30 is at 09:30 — the wall-clock time is the fact, and storing
 * it as an instant would shift everybody's timetable the first time they
 * cross a timezone or the clocks change.
 */

export interface AgendaEvent {
  id: string;
  title: string;
  /** The day it happens — for a repeating event, the first day. */
  day: DayKey;
  /** Minutes from midnight. */
  start: number;
  end: number;
  color: EventColor;
  location?: string;
  notes?: string;
  /** "weekly" repeats on the same weekday, from `day` onwards. */
  repeat: "none" | "weekly";
  /** Milliseconds since the epoch; last-write-wins against the account. */
  updatedAt: number;
}

/** `YYYY-MM-DD`. Sorts correctly as a string, which the views lean on. */
export type DayKey = string;

export const COLORS = [
  "slate",
  "red",
  "gold",
  "blue",
  "green",
  "purple",
] as const;
export type EventColor = (typeof COLORS)[number];

/* ── Days ────────────────────────────────────────────────────────────── */

export function keyOf(date: Date): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Noon, not midnight: DST shifts around midnight, never around noon. */
export function dateOf(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = dateOf(key);
  date.setDate(date.getDate() + days);
  return keyOf(date);
}

/** Monday, as the screenshot has it and as European weeks run. */
export function weekStart(key: DayKey): DayKey {
  const date = dateOf(key);
  // getDay: Sunday is 0. Monday-first means Sunday sits at the end.
  const back = (date.getDay() + 6) % 7;
  return addDays(key, -back);
}

export function weekOf(key: DayKey): DayKey[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The days a month view shows: complete weeks, Monday to Sunday, covering the
 * month — so the grid is always 4 to 6 full rows and never a ragged edge.
 */
export function monthGrid(key: DayKey): DayKey[] {
  const date = dateOf(key);
  const first = keyOf(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const last = keyOf(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  const start = weekStart(first);
  const days: DayKey[] = [];
  let cursor = start;
  while (cursor <= last || days.length % 7 !== 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function sameMonth(a: DayKey, b: DayKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/* ── Occurrence ──────────────────────────────────────────────────────── */

/**
 * Does this event happen on this day?
 *
 * A weekly event occurs on every later day with the same weekday — including
 * its own first day, and never before it. "Never before it" matters: a
 * timetable made in September must not appear in August's month view.
 */
export function occursOn(event: AgendaEvent, day: DayKey): boolean {
  if (event.day === day) return true;
  if (event.repeat !== "weekly") return false;
  if (day < event.day) return false;
  return dateOf(event.day).getDay() === dateOf(day).getDay();
}

export function eventsOn(events: AgendaEvent[], day: DayKey): AgendaEvent[] {
  return events
    .filter((event) => occursOn(event, day))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/* ── Layout ──────────────────────────────────────────────────────────── */

export interface Placed {
  event: AgendaEvent;
  /** 0-based column among the overlapping group. */
  column: number;
  /** How many columns the group needed — the divisor for the width. */
  of: number;
}

/**
 * Lay a day's events out side by side where they overlap.
 *
 * The screenshot's grid puts simultaneous things next to each other rather
 * than on top of each other. Greedy first-free-column within each connected
 * group of overlaps: not the optimal-width algorithm, but stable, obvious,
 * and right for the two-or-three collisions a personal timetable actually
 * has.
 */
export function layout(events: AgendaEvent[]): Placed[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;

  const close = () => {
    const width = Math.max(0, ...group.map((p) => p.column)) + 1;
    for (const p of group) p.of = width;
    group = [];
  };

  for (const event of sorted) {
    if (group.length > 0 && event.start >= groupEnd) close();

    const taken = new Set(
      group
        .filter((p) => p.event.end > event.start)
        .map((p) => p.column),
    );
    let column = 0;
    while (taken.has(column)) column += 1;

    const entry: Placed = { event, column, of: 1 };
    group.push(entry);
    placed.push(entry);
    groupEnd = Math.max(groupEnd, event.end);
  }
  if (group.length > 0) close();
  return placed;
}

/* ── Small formatting ────────────────────────────────────────────────── */

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Round to the nearest step — what clicking on the grid snaps to. */
export function snap(minutes: number, step = 30): number {
  return Math.max(0, Math.min(24 * 60, Math.round(minutes / step) * step));
}
