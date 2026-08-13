/**
 * The words the interface says, and the function that says them.
 *
 * The interface is English, everywhere, for everybody. There is no preference
 * to store, nothing to read off `navigator.languages`, and no switch in
 * Settings — a browser set to Dutch gets exactly the same screens as a browser
 * set to English, which is the whole point. `dictionary.ts` explains why the
 * second language went away and what would have to be true to bring it back.
 *
 * What this leaves is a string table with a lookup in front of it. That is
 * still worth having: the strings stay in one greppable place, they are typed,
 * and `{name}` gets filled in one place rather than in eleven template
 * literals.
 *
 * Documents are untouched by any of this. A person writing a Dutch thesis in
 * an English interface is a nuisance; a person whose *thesis* got translated
 * would be a catastrophe.
 */

import { EN, type Key } from "./dictionary";

export type { Key } from "./dictionary";

/**
 * Fill `{name}` placeholders. Anything unmatched is left alone rather than
 * blanked, so a typo in a key shows itself instead of eating a sentence.
 */
function fill(text: string, values?: Record<string, string | number>): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export function t(key: Key, values?: Record<string, string | number>): string {
  return fill(EN[key], values);
}
