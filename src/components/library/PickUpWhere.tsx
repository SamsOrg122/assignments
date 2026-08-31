"use client";

/**
 * Where you were — as a label on the work, not as a second copy of it.
 *
 * This was a band of six cards above the Library grid, and it was the loudest
 * thing on the page. It also rendered `/p/p_thesis`, `/p/p_board`,
 * `/p/p_pitch`, `/p/p_orbit`, `/p/p_atlas` — byte for byte the same five
 * projects the grid underneath rendered, in the same order, at the same
 * addresses, with the same four facts in a second card shape at eight
 * different type sizes. Two lists of one thing is the work competing with
 * itself, and nothing on the screen told you which of them was authoritative.
 *
 * So the band is gone and the promise is kept. The grid's default order IS
 * most-recently-touched first, so the first six cards under that order are
 * exactly what the band was showing; all this has to do is say so.
 *
 * The band's own reasoning for sorting itself rather than reading the grid was
 * right, and it survives inverted. It sorted independently because "this band
 * means one thing and has to keep meaning it while somebody types in the box
 * underneath" — a band that quietly re-ranked itself when you searched would
 * be lying about being where you were. A *label* cannot re-rank, so instead it
 * leaves: `arrival` is false the moment anybody types, filters, picks a folder
 * or re-sorts, and the label goes with it rather than sitting on top of a list
 * it no longer describes. Nothing is hidden — the six most recent are still
 * the first six under the default order, one click on the ✕ already in the
 * search field away.
 *
 * Quiet until there are two, exactly as before: with one project the label
 * describes a list of one, and with none the empty state is the entire point
 * of the screen.
 *
 * Every card's ⋯ menu moved with the cards, and lost nothing — the same
 * `projectMenu` from the same `useProjectActions` is on every card in the grid
 * below, which is where Rename, Icon, Duplicate, Change type, Move to, Labels,
 * Save as template, all five exports, Settings and Delete have always also
 * been.
 */

import type { Project } from "@/lib/types";
import { formatDayMonth } from "@/lib/format";

/** Two projects is the smallest list "where you left off" can describe. */
const FEWEST = 2;

export function PickUpWhere({
  projects,
  arrival,
}: {
  /** Already narrowed to the world on screen; this does no filtering. */
  projects: Project[];
  /** True while the grid is still in its default, most-recent-first order. */
  arrival: boolean;
}) {
  if (!arrival || projects.length < FEWEST) return null;

  return (
    <p className="text-meta text-fg-subtle mb-(--space-3)">
      pick up where you left off
    </p>
  );
}

/**
 * Rendered only after hydration — `Date.now()` differs between server and
 * client, and a countdown that corrects itself on load is a mismatch.
 *
 * It stays in this file, and the Library page still imports it from here, for
 * the reason it was put here: `lib/format` is not a file this change may open,
 * and a second copy of "2h ago" written next to the first is how two lists
 * start disagreeing about the hour. There is only one list now, but the next
 * surface that wants a relative time should import this one rather than write
 * its own.
 */
export function relativeTime(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDayMonth(ts);
}
