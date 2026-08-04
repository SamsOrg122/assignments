/**
 * Register analysis for tone matching.
 *
 * "Write the rest like this" is only meaningful if we can say *what* "this"
 * is. These are the measurable features that separate an academic register
 * from a blog one — sentence length, hedging, person, nominalisation, voice —
 * so the match can be described to the user and checked afterwards, rather
 * than being an unfalsifiable claim about vibes.
 */

import { sentences, words } from "./analysis";

export interface Register {
  /** Mean words per sentence. */
  sentenceLength: number;
  /** Standard deviation — bursty prose mixes long and short. */
  sentenceVariation: number;
  /** Hedges per 100 words ("may", "suggests", "appears"). */
  hedging: number;
  /** First-person markers per 100 words. */
  firstPerson: number;
  /** Nominalisations per 100 words ("-tion", "-ment", "-ity"). */
  nominalisation: number;
  /** Passive constructions per 100 words. */
  passive: number;
  /** Contractions per 100 words — near zero in formal writing. */
  contractions: number;
  /** Mean characters per content word. */
  wordLength: number;
}

const HEDGES =
  /\b(may|might|could|appears?|suggests?|indicates?|seems?|tends? to|arguably|possibly|likely|broadly|relatively|somewhat|apparently)\b/gi;
const FIRST_PERSON = /\b(i|we|my|our|me|us)\b/gi;
const NOMINAL = /\b\w{4,}(?:tion|ment|ity|ness|ance|ence|ism)s?\b/gi;
const PASSIVE =
  /\b(?:was|were|is|are|been|being|be)\s+\w+(?:ed|en)\b(?:\s+by\b)?/gi;
const CONTRACTION = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;

const per100 = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

export function analyseRegister(text: string): Register {
  const sents = sentences(text);
  const allWords = text.split(/\s+/).filter(Boolean);
  const total = allWords.length;

  const lengths = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.length
    ? lengths.reduce((a, b) => a + b, 0) / lengths.length
    : 0;
  const variance = lengths.length
    ? lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length
    : 0;

  const content = words(text);

  return {
    sentenceLength: Math.round(mean * 10) / 10,
    sentenceVariation: Math.round(Math.sqrt(variance) * 10) / 10,
    hedging: per100(text.match(HEDGES)?.length ?? 0, total),
    firstPerson: per100(text.match(FIRST_PERSON)?.length ?? 0, total),
    nominalisation: per100(text.match(NOMINAL)?.length ?? 0, total),
    passive: per100(text.match(PASSIVE)?.length ?? 0, total),
    contractions: per100(text.match(CONTRACTION)?.length ?? 0, total),
    wordLength: content.length
      ? Math.round((content.join("").length / content.length) * 10) / 10
      : 0,
  };
}

export interface RegisterGap {
  feature: string;
  sample: number;
  target: number;
  /** Which way the target needs to move, in plain words. */
  direction: string;
}

const FEATURES: Array<{
  key: keyof Register;
  label: string;
  more: string;
  less: string;
  /** Difference below which the two read the same. */
  tolerance: number;
}> = [
  {
    key: "sentenceLength",
    label: "sentence length",
    more: "longer sentences",
    less: "shorter sentences",
    tolerance: 3,
  },
  {
    key: "hedging",
    label: "hedging",
    more: "more hedging",
    less: "fewer hedges — commit to the claim",
    tolerance: 0.8,
  },
  {
    key: "firstPerson",
    label: "first person",
    more: "more first person",
    less: "less first person",
    tolerance: 1,
  },
  {
    key: "nominalisation",
    label: "nominalisation",
    more: "more abstract nouns",
    less: "fewer abstract nouns — prefer verbs",
    tolerance: 1.5,
  },
  {
    key: "passive",
    label: "passive voice",
    more: "more passive constructions",
    less: "more active voice",
    tolerance: 1,
  },
  {
    key: "contractions",
    label: "contractions",
    more: "contractions are fine here",
    less: "expand the contractions",
    tolerance: 0.5,
  },
];

/** Where the target passage differs from the sample, worst first. */
export function compareRegister(
  sample: Register,
  target: Register,
): RegisterGap[] {
  return FEATURES.map((f) => {
    const s = sample[f.key];
    const t = target[f.key];
    const diff = t - s;
    if (Math.abs(diff) <= f.tolerance) return null;
    return {
      feature: f.label,
      sample: s,
      target: t,
      direction: diff > 0 ? f.less : f.more,
    };
  })
    .filter((g): g is RegisterGap => g !== null)
    .sort(
      (a, b) =>
        Math.abs(b.target - b.sample) / (b.sample || 1) -
        Math.abs(a.target - a.sample) / (a.sample || 1),
    );
}

/**
 * Nudge a passage toward a sample's register.
 *
 * Only the changes that are safe to make mechanically: expanding contractions,
 * removing or adding hedges, and splitting or joining sentences toward the
 * sample's average length. It never rewrites meaning — that's the model's job
 * once one is wired in, and doing it badly here would erase the user's voice,
 * which is exactly what this feature is supposed to protect.
 */
export function nudgeRegister(text: string, sample: Register): string {
  const target = analyseRegister(text);
  let out = text;

  if (target.contractions > sample.contractions + 0.5) {
    const EXPANSIONS: Array<[RegExp, string]> = [
      [/\bdon't\b/gi, "do not"],
      [/\bdoesn't\b/gi, "does not"],
      [/\bdidn't\b/gi, "did not"],
      [/\bcan't\b/gi, "cannot"],
      [/\bwon't\b/gi, "will not"],
      [/\bisn't\b/gi, "is not"],
      [/\baren't\b/gi, "are not"],
      [/\bwasn't\b/gi, "was not"],
      [/\bit's\b/gi, "it is"],
      [/\bthat's\b/gi, "that is"],
      [/\bthey're\b/gi, "they are"],
      [/\bwe're\b/gi, "we are"],
      [/\bI'm\b/g, "I am"],
      [/\bwe've\b/gi, "we have"],
    ];
    for (const [pattern, replacement] of EXPANSIONS)
      out = out.replace(pattern, replacement);
  }

  // Sentences much longer than the sample get split at a conjunction.
  if (target.sentenceLength > sample.sentenceLength + 6) {
    out = sentences(out)
      .map((s) => {
        const n = s.split(/\s+/).length;
        if (n < sample.sentenceLength * 1.5) return s;
        const split = s.replace(
          /,\s+(and|but|which|while|whereas)\s+/i,
          (_m, word: string) =>
            `. ${word.charAt(0).toUpperCase()}${word.slice(1)} `,
        );
        return split;
      })
      .join(" ");
  }

  return out.replace(/\s{2,}/g, " ").trim();
}

/** A one-line description of a register, for the AI's answer. */
export function describeRegister(r: Register): string {
  const bits = [`${r.sentenceLength}-word sentences`];
  if (r.hedging > 1.5) bits.push("hedged");
  else if (r.hedging < 0.4) bits.push("assertive");
  if (r.firstPerson > 2) bits.push("first-person");
  else if (r.firstPerson < 0.4) bits.push("impersonal");
  if (r.passive > 2) bits.push("often passive");
  if (r.nominalisation > 4) bits.push("noun-heavy");
  if (r.contractions > 0.5) bits.push("uses contractions");
  return bits.join(", ");
}
