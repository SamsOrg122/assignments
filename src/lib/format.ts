/**
 * Numbers, dates and times, in the interface's language.
 *
 * The interface is English, so these are too. That has to be said in code
 * rather than assumed, because the browser's own defaults say otherwise:
 * `(1234).toLocaleString()` is "1,234" on an English machine and "1.234" on a
 * Dutch one, and `toLocaleDateString()` swaps "13 Aug 2026" for "13 aug. 2026"
 * — Dutch month names, in an English sentence, with no setting anywhere that
 * asked for them.
 *
 * There is a second reason, and it is a real bug rather than a matter of
 * taste. A bare `toLocaleString()` runs on the server during prerender and
 * again in the browser during hydration, on two machines that need not agree
 * about locale. React then finds a text node that changed underneath it. Pinned
 * formatting is the same string in both places.
 *
 * en-GB rather than en-US: this repo spells "organise" and "colour", the
 * storefront tags itself en-GB, and 13/08 beside "colour" is the pair that
 * looks deliberate.
 *
 * None of this touches what anybody writes. A date typed into a document, a
 * spreadsheet cell's own date format and the proofing language are the
 * document's business and are handled where the document is.
 */

const LOCALE = "en-GB";

/*
 * Built once. `Intl` constructors are expensive enough that a list of two
 * hundred rows re-formatting per render is measurable, and these never vary.
 */
const NUMBER = new Intl.NumberFormat(LOCALE);
const DATE = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DAY_MONTH = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});
const TIME = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "1,234". Thousands separated, no decimals invented. */
export const formatNumber = (n: number): string => NUMBER.format(n);

/** "13 Aug 2026". */
export const formatDate = (ts: number | Date): string => DATE.format(ts);

/** "13 Aug" — for anything already scoped to the current year. */
export const formatDayMonth = (ts: number | Date): string =>
  DAY_MONTH.format(ts);

/** "14:32". Twenty-four hour, which is what en-GB gives and what a timestamp
 *  in a dense list wants. */
export const formatTime = (ts: number | Date): string => TIME.format(ts);

/** "13 Aug 2026, 14:32". */
export const formatDateTime = (ts: number | Date): string =>
  DATE_TIME.format(ts);
