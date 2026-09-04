/**
 * What is on the bar, read from the file that also fails the Rust test.
 *
 * `src-tauri/slots.json` is the single source, and this is the only thing that
 * reads it into the window. Both halves matter:
 *
 *   - the bar renders this array and nothing else, so a slot that is not in
 *     the file cannot appear by somebody adding a button;
 *   - `config_check.rs` reads the same file with `include_str!`, exactly as it
 *     already reads `capabilities/default.json`, and asserts the count and
 *     that every slot answers the three admission questions.
 *
 * So a fourth slot arrives with a failing test in the diff and an argument in
 * the commit message. That is the mechanism docs/desktop.md asks for, and it
 * is a real check against a real file rather than a claim about discipline.
 */

import file from "../src-tauri/slots.json";

export interface Slot {
  /** Matches the sheet the bar opens. */
  id: string;
  /**
   * The word on the button, and it is a word rather than a glyph on purpose.
   *
   * A picture of a page is guessable and a picture of a microphone is
   * guessable, but nothing in the world signals "paste whatever is on my
   * clipboard right now". A four-letter word does, and four short words plus a
   * status dot is what decides the bar's width.
   */
  word: string;
  what: string;
  intake: string;
  away: string;
  lands: string;
}

export const SLOTS: Slot[] = file.slots;

/** The ceiling the Rust test also asserts, so the two cannot disagree. */
export const MAX_SLOTS: number = file.maxSlots;
