/**
 * "wiskunde ma 9:30-11" → an event. "morgen afwassen" → a task.
 *
 * The rule that decides between them: **a time makes an event, no time makes
 * a task.** That is how people actually type — a lecture has an hour, a
 * chore has a day — and it means one box serves both without a mode switch.
 *
 * The parser is deliberately small and word-based, not a grammar. It looks
 * for a day word (Dutch or English, because this user types both), a time or
 * time range, and a repeat word; whatever is left over, in order, is the
 * title. Anything it does not recognise stays in the title rather than being
 * eaten — a parser that silently swallows words it half-understood writes
 * the wrong title, and the wrong title is worse than a clumsy one.
 */

import { addDays, keyOf, snap, type DayKey } from "./model";

export interface QuickAdd {
  kind: "event" | "task";
  title: string;
  day: DayKey;
  /** Events only. */
  start: number;
  end: number;
  repeat: "none" | "weekly";
}

/** Monday-first index for a day word, or null. */
const DAY_WORDS: Record<string, number> = {
  // English
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
  // Dutch
  ma: 0, maandag: 0, di: 1, dinsdag: 1, wo: 2, woensdag: 2,
  do: 3, donderdag: 3, vr: 4, vrijdag: 4, za: 5, zaterdag: 5, zo: 6, zondag: 6,
};

const REPEAT_WORDS = new Set([
  "weekly", "wekelijks", "elke", "every",
]);
// "elke week" / "every week" — the trailing "week" is part of the repeat
// phrase, not the title.
const REPEAT_TAILS = new Set(["week"]);

const TODAY_WORDS = new Set(["today", "vandaag"]);
const TOMORROW_WORDS = new Set(["tomorrow", "morgen"]);

/** "9", "9:30", "09.30", "14u30" → minutes; null when it is not a time. */
function timeOf(word: string): number | null {
  const match = /^(\d{1,2})(?:[:.u](\d{2}))?$/.exec(word);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  // A bare number only counts as a time when it could be an hour someone
  // means: "9" yes, "2025" no (caught by the digit limit above).
  return hours * 60 + minutes;
}

export function parseQuick(input: string, today = keyOf(new Date())): QuickAdd | null {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let day: DayKey | null = null;
  let start: number | null = null;
  let end: number | null = null;
  let repeat: "none" | "weekly" = "none";
  const title: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const bare = word.toLowerCase().replace(/[,;]$/, "");

    if (TODAY_WORDS.has(bare) && day === null) {
      day = today;
      continue;
    }
    if (TOMORROW_WORDS.has(bare) && day === null) {
      day = addDays(today, 1);
      continue;
    }
    if (bare in DAY_WORDS && day === null) {
      // The next such weekday, today included — "ma" said on a Monday means
      // this one, not next week's.
      const want = DAY_WORDS[bare]!;
      const have = (new Date(today + "T12:00").getDay() + 6) % 7;
      day = addDays(today, (want - have + 7) % 7);
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(bare) && day === null) {
      day = bare;
      continue;
    }
    if (REPEAT_WORDS.has(bare)) {
      repeat = "weekly";
      const next = words[i + 1]?.toLowerCase();
      if (next && REPEAT_TAILS.has(next)) i += 1;
      continue;
    }

    // A range in one word: 9:30-11 or 9-10:15.
    const range = /^(\S+)-(\S+)$/.exec(bare);
    if (range && start === null) {
      const from = timeOf(range[1]!);
      const to = timeOf(range[2]!);
      if (from !== null && to !== null) {
        start = from;
        end = to;
        continue;
      }
    }
    // A lone time. Two of them make a range; "9:30" alone starts an hour.
    const time = timeOf(bare);
    if (time !== null && bare.length > 1 && (start === null || end === null)) {
      if (start === null) start = time;
      else end = time;
      continue;
    }

    title.push(word);
  }

  const name = title.join(" ").trim();
  if (!name) return null;

  if (start === null) {
    return {
      kind: "task",
      title: name,
      day: day ?? today,
      start: 0,
      end: 0,
      repeat,
    };
  }

  const from = snap(start, 5);
  let to = end !== null ? snap(end, 5) : from + 60;
  // "14-9" is somebody's typo, not a nineteen-hour lecture backwards.
  if (to <= from) to = from + 60;
  return {
    kind: "event",
    title: name,
    day: day ?? today,
    start: from,
    end: Math.min(24 * 60, to),
    repeat,
  };
}
