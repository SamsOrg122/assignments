/**
 * Colour as a way of finding things.
 *
 * Two functions, one idea: a thing that does not change what it is deserves a
 * colour that does not change either, so a list of twenty can be scanned
 * instead of read. The values are CSS custom property names rather than
 * hexes, because each hue is declared twice in globals.css — once for
 * near-black and once for paper — and neither this file nor its callers
 * should have to know which theme is on.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * It is not state. The app's rule is that a fill may never be the sole
 * carrier of a state, and that rule is untouched here: the surface ramp
 * measures 1.08–1.24:1, so anything that *changes* — selected, unread,
 * pressed, failing — still has to be carried by ink and weight, with a fill
 * only reinforcing. What this file colours is identity, which never changes
 * and is never the only label: the name and the glyph are always right there
 * beside it.
 */

import { KINDS } from "./kinds";
import type { ProjectKind } from "./types";

/** The colour of a kind of thing, as a `var()` you can drop in any property. */
export const kindHue = (kind: ProjectKind): string => `var(${KINDS[kind].hue})`;

/** How many person hues globals.css declares. */
const WHO = 12;

/**
 * A stable colour for a person.
 *
 * ── WHY THIS IS DERIVED AND NOT STORED ────────────────────────────────────
 * There is no colour column on a profile, and this file is careful not to
 * pretend there is: `knownPerson` still hands back a neutral, because the
 * app does not know a colour that person chose and must not make one up and
 * then show it to them as theirs.
 *
 * This is a different claim. It is a handle the interface derives so that the
 * same person is the same colour in the sidebar, in the member list and at
 * the top of every message they wrote — on every screen, on every machine,
 * this year and next. A colour handed out in join order does none of that:
 * it changes the day somebody leaves. Nothing labels this as a preference,
 * nothing offers to change it, and every place it appears also says the
 * person's name.
 *
 * FNV-1a, because it has to agree between a server render and the first
 * client render, which rules out anything that touches a random source.
 */
export function whoHue(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `var(--who-${(h % WHO) + 1})`;
}
