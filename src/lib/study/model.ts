/**
 * A card, a set of them, and when each one comes back.
 *
 * The scheduling is Leitner: five boxes, and a card moves up one when you
 * get it right and falls to the bottom when you do not. Deliberately not a
 * full spaced-repetition algorithm — SM-2 and its descendants need an ease
 * factor per card, a review log, and a fortnight of use before their answers
 * mean anything, and none of that helps somebody with an exam on Thursday.
 * Five boxes gets the one property that matters: the cards you keep getting
 * wrong come back today, and the ones you know stop taking up the hour.
 *
 * Days are `YYYY-MM-DD` like everywhere else in the app, because "due
 * tomorrow" is a fact about a calendar and not about 24 hours from now — a
 * session at 23:50 should not make everything due again at midnight.
 */

import { addDays, type DayKey } from "../agenda/model";

export interface Card {
  id: string;
  front: string;
  back: string;
  /** 0 to 4. A new card starts at 0; 4 is known. */
  box: number;
  /** The first day this comes back. Absent means today. */
  dueDay?: DayKey;
}

export interface StudySet {
  id: string;
  name: string;
  /** Where the cards came from, in words. Shown, never parsed. */
  source?: string;
  cards: Card[];
  scope?: "personal" | "team";
  /** Milliseconds since the epoch; last-write-wins against the account. */
  updatedAt: number;
}

/**
 * How long each box waits.
 *
 * Today, tomorrow, three days, a week, a fortnight. The gaps widen because
 * the point of the last box is to stop asking — a card you have got right
 * four times running does not need to be in Thursday's hour.
 */
export const WAITS = [0, 1, 3, 7, 14] as const;

export const TOP_BOX = WAITS.length - 1;

/** Where a card lands after an answer. */
export function afterAnswer(card: Card, right: boolean, today: DayKey): Card {
  // Wrong goes to the bottom, not down one. A card you have just failed is
  // not "slightly less known" — you did not know it, and tomorrow is too
  // long to wait to find out whether that has changed.
  const box = right ? Math.min(TOP_BOX, card.box + 1) : 0;
  return { ...card, box, dueDay: addDays(today, WAITS[box]) };
}

/** Whether this card is asked in today's session. */
export const isDue = (card: Card, today: DayKey): boolean =>
  !card.dueDay || card.dueDay <= today;

/**
 * The cards to ask, in the order to ask them.
 *
 * Lowest box first, so the ones being got wrong are seen while there is
 * still attention left for them. Within a box, the order the set was made
 * in — which follows the source, so the session reads like the chapter.
 */
export function dueCards(set: StudySet, today: DayKey): Card[] {
  return set.cards
    .filter((card) => isDue(card, today))
    .sort((a, b) => a.box - b.box);
}

/** How a set is doing, for the row on the list. */
export interface Progress {
  total: number;
  /** Cards in the top box — the ones that have stopped coming back often. */
  known: number;
  due: number;
}

export function progressOf(set: StudySet, today: DayKey): Progress {
  return {
    total: set.cards.length,
    known: set.cards.filter((card) => card.box >= TOP_BOX).length,
    due: set.cards.filter((card) => isDue(card, today)).length,
  };
}

/**
 * When the next card comes back, in words, for a set with none due now.
 *
 * "Nothing due" on its own reads like the set is finished, which is exactly
 * the wrong impression to leave somebody with a week before an exam.
 */
export function nextDue(set: StudySet, today: DayKey): string | null {
  const days = set.cards
    .map((card) => card.dueDay)
    .filter((day): day is DayKey => day !== undefined && day > today)
    .sort();
  if (days.length === 0) return null;
  const soonest = days[0];
  return soonest === addDays(today, 1) ? "Back tomorrow" : `Back on ${soonest}`;
}
