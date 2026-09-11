/**
 * The storefront's two faces, and why they are not the app's.
 *
 * The app is set in Geist, and it stays that way: `docs/calm.md` builds a
 * four-step type scale on it and the whole point of that document is that the
 * working surface recedes. A storefront is the opposite problem — somebody who
 * has never seen this before, deciding in four seconds whether it is for them —
 * and §9 of that same document says out loud that the storefront is out of
 * scope and keeps its own voice.
 *
 * So two families, both used for one job each:
 *
 *   Outfit      the interface. A geometric sans with a wide, even colour that
 *               holds at 13px in a nav pill and at 20px in a paragraph.
 *   Newsreader  the headlines, and only the headlines. A text serif at display
 *               weights: the wordmark over the landscape, the section titles,
 *               the pull quotes. It is the one thing on the page that says
 *               this was written rather than generated.
 *
 * ── WHY `next/font` AND NOT A LINK TAG ──────────────────────────────────
 * The stylesheet these were designed against loads them from
 * `fonts.googleapis.com`. That cannot ship here: `next.config.ts` sets
 * `font-src 'self' data:` and `style-src 'self' 'unsafe-inline'` with no
 * external origins, and the comment above that policy is explicit that a
 * wildcard is what it exists to prevent. Relaxing the policy to load a
 * typeface would be trading a real security property for a font.
 *
 * `next/font/google` resolves this at *build* time: it downloads the files,
 * serves them from this origin, and emits a `@font-face` with no network call
 * at run time. Same typefaces, nothing fetched from a third party, no
 * layout shift, and the policy is untouched.
 */

import { Newsreader, Outfit } from "next/font/google";

/**
 * The interface face.
 *
 * Three weights and no more. 300 for long prose, where Outfit at 400 is
 * slightly too present over a mesh background; 400 for interface text; 500 for
 * the few things that are pressed. A fourth weight is a decision nobody would
 * be able to justify at a glance, which is how a type system stops being one.
 */
export const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-storefront",
  display: "swap",
});

/**
 * The headline face.
 *
 * `opsz` is the reason this is Newsreader rather than any other serif: it is
 * an optical-size axis, so the same family thins its strokes and tightens its
 * spacing as it grows. A 128px wordmark and a 36px section head are the same
 * typeface behaving differently, which is what stops a display serif looking
 * like a text serif that has been blown up.
 */
export const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-display",
  display: "swap",
});
