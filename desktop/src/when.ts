/**
 * When a note was last touched, in words.
 *
 * The window is 340 pixels wide and the list already carries a title and a
 * preview, so a full timestamp would push one of them out. "2m" is enough to
 * answer the only question anybody asks of a note list, which is "is this the
 * one I was just writing".
 *
 * en-GB throughout, matching the web app — a note that says 8/9 on the
 * desktop and 9/8 in the browser is a small thing that makes a product feel
 * like two products.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function when(at: number, now = Date.now()): string {
  const ago = Math.max(0, now - at);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d ago`;
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
