/**
 * Document analyses used by the stub provider.
 *
 * These are deliberately *real*: they compute over the actual document rather
 * than returning canned prose, so the answers change when the writing changes
 * and a reviewer can check them by hand. When a real model is wired in it will
 * do this better — but the interaction, and the shape of the answer, is already
 * honest.
 */

import type { AIContext } from "./types";

export interface Located {
  /** Section heading the hit sits under. */
  where: string;
  blockId: string;
  text: string;
}

const STOP = new Set(
  ("the a an and or of to in for on with is are was were be been being it this " +
    "that as at by from we our you your they their has have had will would can " +
    "could not but all across into one two three than then so if when which who " +
    "there here each both other more most some any i my me").split(" "),
);

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? []).filter(
    (w) => !STOP.has(w),
  );
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

/** Jaccard overlap of content words — cheap, and good enough to pair claims. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

const sectionName = (block: AIContext["blocks"][number], i: number) =>
  block.heading ?? block.title ?? `Section ${i + 1}`;

/* ── Terminology consistency ────────────────────────────── */

/** Near-synonyms that commonly drift in academic writing. */
const SYNONYM_GROUPS = [
  ["respondent", "participant", "subject", "informant"],
  ["interview", "conversation"],
  ["utilise", "utilize", "use"],
  ["method", "methodology"],
  ["data", "dataset"],
  ["finding", "result", "outcome"],
  ["framework", "model"],
  ["user", "person", "individual"],
];

export interface TermUsage {
  term: string;
  count: number;
  sections: string[];
}

/** Terms named in the prompt, e.g. "respondent" and 'participant'. */
export function termsFromPrompt(prompt: string): string[] {
  const quoted = [...prompt.matchAll(/["'“‘]([a-zA-Z][a-zA-Z\s-]{1,24})["'”’]/g)].map(
    (m) => m[1].trim().toLowerCase(),
  );
  return [...new Set(quoted)];
}

export function analyseTerminology(
  ctx: AIContext,
  requested: string[],
): { group: TermUsage[]; scanned: number } | null {
  const sectionsOf = (term: string): TermUsage => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "gi");
    let count = 0;
    const sections: string[] = [];
    ctx.blocks.forEach((b, i) => {
      const hits = b.text.match(pattern)?.length ?? 0;
      if (hits > 0) {
        count += hits;
        sections.push(sectionName(b, i));
      }
    });
    return { term, count, sections };
  };

  // Named terms win; otherwise look for a drifting group on our list.
  const candidates: string[][] =
    requested.length >= 2 ? [requested] : SYNONYM_GROUPS;

  let best: TermUsage[] | null = null;
  for (const group of candidates) {
    const usage = group.map(sectionsOf).filter((u) => u.count > 0);
    if (usage.length >= 2) {
      if (!best || usage.reduce((n, u) => n + u.count, 0) > best.reduce((n, u) => n + u.count, 0))
        best = usage;
      if (requested.length >= 2) break;
    }
  }

  return best ? { group: best, scanned: ctx.blocks.length } : null;
}

/* ── Cross-section consistency ──────────────────────────── */

export interface ClaimPair {
  a: Located;
  b: Located;
  similarity: number;
  reason: string;
}

const numbersIn = (s: string) =>
  (s.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).map((n) => n.replace(",", ""));

const NEGATIONS = /\b(not|no|never|cannot|fails?|without|unlike|however|although)\b/i;

/**
 * Pairs of sentences from *different* sections that talk about the same thing
 * but disagree — different numbers, or one negating the other.
 */
export function findInconsistencies(ctx: AIContext, limit = 4): ClaimPair[] {
  const pool: Array<Located & { set: Set<string> }> = [];
  ctx.blocks.forEach((b, i) => {
    if (b.type !== "text") return;
    for (const s of sentences(b.text)) {
      pool.push({
        where: sectionName(b, i),
        blockId: b.id,
        text: s,
        set: new Set(words(s)),
      });
    }
  });

  const pairs: ClaimPair[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a.where === b.where) continue;
      const similarity = overlap(a.set, b.set);
      if (similarity < 0.24) continue;

      const na = numbersIn(a.text);
      const nb = numbersIn(b.text);
      const numbersDiffer =
        na.length > 0 && nb.length > 0 && na.join() !== nb.join();
      const polarityDiffers =
        NEGATIONS.test(a.text) !== NEGATIONS.test(b.text);

      if (!numbersDiffer && !polarityDiffers) continue;
      pairs.push({
        a,
        b,
        similarity,
        reason: numbersDiffer
          ? `different figures (${na.join(", ")} vs ${nb.join(", ")})`
          : "one statement hedges or negates the other",
      });
    }
  }

  return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, limit);
}

/* ── Argument drift ─────────────────────────────────────── */

export interface DriftReading {
  question: string;
  sections: Array<{ where: string; blockId: string; alignment: number }>;
  weakest: { where: string; blockId: string; alignment: number } | null;
  strays: string[];
}

/** The research question — stated explicitly, or the first question mark. */
function findQuestion(ctx: AIContext): string | null {
  for (const b of ctx.blocks) {
    const labelled = /research question:?\s*(.+?)(?:\n|$)/i.exec(b.text);
    if (labelled) return labelled[1].trim();
  }
  for (const b of ctx.blocks) {
    const q = b.text.split("\n").find((l) => l.trim().endsWith("?"));
    if (q) return q.trim();
  }
  return null;
}

/**
 * Scores every section against the research question's vocabulary. A section
 * that scores low is where the argument has wandered off the question — which
 * is exactly what "where does it drift?" is asking.
 */
export function analyseDrift(ctx: AIContext): DriftReading | null {
  const question = findQuestion(ctx);
  if (!question) return null;

  const target = new Set(words(question));
  const sections = ctx.blocks
    .filter((b) => b.type === "text" && b.words > 25)
    .map((b, i) => {
      const set = new Set(words(b.text));
      return {
        where: sectionName(b, i),
        blockId: b.id,
        alignment: Math.round(overlap(target, set) * 1000) / 10,
      };
    });

  if (sections.length === 0) return null;

  const weakest = sections.reduce((m, s) => (s.alignment < m.alignment ? s : m));

  // Content words the conclusion leans on that the question never raised.
  const last = ctx.blocks.filter((b) => b.type === "text").at(-1);
  const strays = last
    ? [...new Set(words(last.text))]
        .filter((w) => !target.has(w))
        .filter((w) => (last.text.toLowerCase().match(new RegExp(`\\b${w}`, "g")) ?? []).length > 1)
        .slice(0, 6)
    : [];

  return { question, sections, weakest, strays };
}

/* ── Outline ────────────────────────────────────────────── */

export interface OutlineEntry {
  where: string;
  blockId: string;
  words: number;
  lead: string;
}

export function buildOutline(ctx: AIContext): OutlineEntry[] {
  return ctx.blocks
    .filter((b) => b.type === "text")
    .map((b, i) => ({
      where: sectionName(b, i),
      blockId: b.id,
      words: b.words,
      lead: sentences(b.text)[0]?.slice(0, 120) ?? "",
    }));
}

/* ── Speech → prose ─────────────────────────────────────── */

/**
 * Hesitations and spoken discourse markers.
 *
 * `um` and `uh` are separate alternatives on purpose — a single `u+h+m*`
 * pattern requires an `h` and silently lets every "um" through.
 */
const FILLERS =
  /\b(?:u+m+|u+h+m*|e+r+m*|e+h+|a+h+|hm+|mhm+|like|you know|i mean|sort of|kind of|basically|actually|literally|right|okay|ok|so yeah|yeah)\b/gi;

const SPOKEN_FIXES: Array<[RegExp, string]> = [
  [/\bgonna\b/gi, "going to"],
  [/\bwanna\b/gi, "want to"],
  [/\bkinda\b/gi, "kind of"],
  [/\bcuz\b/gi, "because"],
  [/\bdidn't just\b/gi, "did not merely"],
  [/\bit's\b/gi, "it is"],
  [/\bdon't\b/gi, "do not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bwe're\b/gi, "we are"],
  [/\bthat's\b/gi, "that is"],
];

/**
 * Turn a raw spoken transcript into written prose.
 *
 * The distinction that matters versus dictation: this doesn't just punctuate
 * what was said, it removes the hesitations and false starts, drops the spoken
 * discourse markers, and re-breaks the result into paragraphs. The output
 * should read like it was written.
 */
export function speechToProse(raw: string): { html: string; stats: { before: number; after: number; removed: number } } {
  const before = raw.split(/\s+/).filter(Boolean).length;

  let text = raw
    .replace(/\s+/g, " ")
    .trim()
    // "we measured it we didn't just assert it" — repeated restarts.
    .replace(/\b(\w+)( \1\b)+/gi, "$1");

  const fillerHits = text.match(FILLERS)?.length ?? 0;
  text = text.replace(FILLERS, " ");
  for (const [pattern, replacement] of SPOKEN_FIXES)
    text = text.replace(pattern, replacement);

  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    // Speech recognisers emit a lowercase first person; written prose doesn't.
    .replace(/\bi\b/g, "I")
    .replace(/\bi'(m|ve|ll|d)\b/gi, (_, s) => `I'${s.toLowerCase()}`)
    .trim();

  // Spoken clauses are strung together with "and/so/but"; those joins are
  // where the written sentence boundaries belong.
  const parts = text
    .split(/\s+(?=(?:so|and|but|which|because|then)\s)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const written: string[] = [];
  let buffer = "";
  for (const part of parts) {
    const clause = part.replace(/^(so|and|but|then)\s+/i, "");
    buffer = buffer ? `${buffer}, ${clause}` : clause;
    // Two clauses per sentence keeps the result readable rather than breathless.
    if (buffer.split(",").length >= 2) {
      written.push(buffer);
      buffer = "";
    }
  }
  if (buffer) written.push(buffer);

  const finished = written
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));

  // Paragraph every three sentences — spoken thought arrives in bursts.
  const paragraphs: string[] = [];
  for (let i = 0; i < finished.length; i += 3)
    paragraphs.push(finished.slice(i, i + 3).join(" "));

  const html = paragraphs.map((p) => `<p>${escape(p)}</p>`).join("");
  const after = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;

  return { html, stats: { before, after, removed: fillerHits } };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
