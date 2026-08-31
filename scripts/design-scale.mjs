/**
 * Hold the calm pass where it got to, file by file.
 *
 * `docs/calm.md` measured why this app read like Word: `src/app/globals.css`
 * defined colours and radii across two thousand lines and no type scale and no
 * spacing scale, so every component invented its own numbers — 1,530 inline
 * `text-[Npx]` classes across thirty distinct values, eleven of them inside a
 * five-pixel band. Half a pixel is not a rank, but every component still had
 * to decide about it. That is what "no scale" looks like from the inside.
 *
 * A ratchet, deliberately, and not a ban. Twelve hundred inline sizes cannot
 * migrate in one commit without blocking every other change for a fortnight,
 * and a rule that blocks everything gets switched off in a week. A per-file
 * baseline that may only DECREASE means the migration lands a file at a time
 * and can never slide back. Somebody restyling a component lowers its numbers
 * and re-baselines; somebody adding a feature to it cannot raise them.
 *
 * ESLint is the wrong tool for this and it is worth saying why, because it is
 * the obvious answer: these class strings are composed through `cn()`, so a
 * lint rule would have to understand Tailwind and evaluate the composition to
 * see them at all. A grep over `git ls-files` is what this repository already
 * does twice — see `no-case-collisions.mjs` — and it is enough.
 *
 *   node scripts/design-scale.mjs            check against the baseline
 *   node scripts/design-scale.mjs --write    re-baseline after a real restyle
 *
 * Two rules are NOT ratcheted. They fail on sight, with no baseline and no
 * exemption, because they are not migration debt — they are the two things the
 * migration exists to prevent coming back.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASELINE = "scripts/design-scale.baseline.json";

/** Every inline size, which both counters below are computed from. */
const INLINE_SIZE = /text-\[([0-9.]+)px\]/g;

/**
 * What is counted, and why each one.
 *
 * `inlineSize` is the headline: a size written into a component is a size that
 * did not come from the scale. `border` counts the boxes — 455 of them when
 * this started, because surface-on-canvas is a 1.12:1 luminance step and a
 * panel that cannot be seen as tone has to be drawn as a line. `mono` and
 * `uppercase` are the second texture on every row. `tiny` is added in the loop
 * below, because it needs to compare a number rather than match a shape.
 */
const COUNTERS = {
  inlineSize: INLINE_SIZE,
  border: /border border-line|border-[bt] border-line/g,
  mono: /font-mono/g,
  uppercase: /\buppercase\b/g,
};

/** Below this, nothing should be set as reading text. See `tiny` below. */
const FLOOR = 11;

/**
 * Where a monospace face is still right.
 *
 * It is for things that are typed at a machine and read back character by
 * character — a key, a file path, an identifier, a model name. It is not for
 * dates, counts, kinds or category names, which is what forty of the
 * forty-one runs on the old library screen were.
 */
const MONO_ALLOWED = [
  "src/components/ui/Kbd",
  "src/components/settings/AdminSections.tsx",
  "src/components/settings/WorkIsSafe.tsx",
  "src/components/blocks/CodeBlock.tsx",
  "src/components/blocks/MathBlock.tsx",
  "src/components/editors/CodeEditor.tsx",
  "src/lib/",
];

/** The storefront is out of scope: it is a different design problem with a
 *  different reader, and the calm pass is explicit that it keeps its own
 *  voice. Document CONTENT is out too — a document's own type is the
 *  author's, not ours. */
const OUT_OF_SCOPE = [
  "src/components/landing/",
  "src/components/pricing/",
  "src/app/(marketing)/",
];

const inScope = (path) => !OUT_OF_SCOPE.some((prefix) => path.startsWith(prefix));

const files = execFileSync("git", ["ls-files", "src/**/*.tsx"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => path && inScope(path));

const counts = {};
const hard = [];

for (const path of files) {
  const text = readFileSync(path, "utf8");
  const row = {};
  for (const [name, pattern] of Object.entries(COUNTERS)) {
    const found = text.match(pattern);
    if (found?.length) row[name] = found.length;
  }

  /*
   * The 11px floor, ratcheted — and the first draft of this script hard-failed
   * it, which was wrong twice over.
   *
   * Wrong on volume: there are still 180-odd sizes below 11px across the tree,
   * so failing on sight fails sixty files, which is the "rule that blocks
   * everything gets switched off in a week" this file's own header warns
   * about. That is the same mistake the monospace rule made an hour earlier.
   *
   * Wrong on substance, which matters more: a handful of these are not text.
   * `text-[9px] leading-none` on a tick inside a 16px checkbox, `text-[8px]`
   * on the initial in a 15px comment pin — those set the size of a glyph
   * drawn as furniture, and there is no reading involved to make illegible. A
   * blanket ban would have to carve out an allowlist for them, and an
   * allowlist of pixel values is a worse artefact than the thing it polices.
   *
   * The ratchet gets both right without arbitrating. A file at zero — which
   * every screen the calm pass has been through now is — can never gain one,
   * so the floor is enforced exactly where it is already true. A file still
   * carrying some can only lose them. 9.5px as a shipping *text* size was the
   * one genuine accessibility liability in the build this replaced; this is
   * what stops it coming back one component at a time.
   */
  let tiny = 0;
  for (const match of text.matchAll(INLINE_SIZE))
    if (Number(match[1]) < FLOOR) tiny++;
  if (tiny) row.tiny = tiny;

  if (Object.keys(row).length) counts[path] = row;

  /* ── The two that never get a baseline ────────────────────────────────── */

  // 1. `.label-mono` set a font-size AND a colour, at equal specificity and
  //    later source order, so it silently beat every colour utility beside it.
  //    That is why /due's late/today/calm distinction rendered as one grey for
  //    months. A type token never carries a colour; the class is gone and it
  //    stays gone.
  if (text.includes("label-mono") && !text.includes("was doing"))
    hard.push(`${path}: label-mono — deleted; use text-meta plus a colour`);

  // 2. A scale kept in two places is not a scale.
  for (const match of text.matchAll(/--(?:text|space)-[a-z0-9]+:/g))
    hard.push(`${path}: ${match[0]} declared outside globals.css`);
}

/*
 * Monospace is RATCHETED too, for the volume reason above. The allowlist is
 * what the count is allowed to settle at — when every file outside it reaches
 * zero, this can become a hard rule and this comment should be deleted with
 * the same commit.
 */
const monoOutside = Object.entries(counts).filter(
  ([path, row]) => row.mono && !MONO_ALLOWED.some((prefix) => path.startsWith(prefix)),
);

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  const total = Object.values(counts).reduce(
    (sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0),
    0,
  );
  console.log(`baseline written: ${Object.keys(counts).length} files, ${total} marks`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(
    `No ${BASELINE}. Run "node scripts/design-scale.mjs --write" once to record where this started.`,
  );
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const risen = [];

for (const [path, row] of Object.entries(counts))
  for (const [name, count] of Object.entries(row)) {
    const was = baseline[path]?.[name] ?? 0;
    if (count > was)
      risen.push(
        `${path}: ${name} ${was} → ${count}` +
          (name === "tiny" ? `  (nothing new below ${FLOOR}px)` : ""),
      );
  }

if (hard.length || risen.length) {
  if (hard.length) {
    console.error("Not allowed, at all:\n");
    for (const line of hard) console.error("  " + line);
    console.error("");
  }
  if (risen.length) {
    console.error("Went up against the baseline:\n");
    for (const line of risen) console.error("  " + line);
    console.error(
      "\nThe scale lives in src/app/globals.css: text-title, text-object,\n" +
        "text-body, text-meta, and --space-1 through --space-6. If you have\n" +
        "genuinely lowered a file's counts, re-record with --write.\n",
    );
  }
  process.exit(1);
}

const total = Object.values(counts).reduce(
  (sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0),
  0,
);
const tinyLeft = Object.values(counts).reduce((sum, row) => sum + (row.tiny ?? 0), 0);
console.log(
  `design scale: ${Object.keys(counts).length} files, ${total} marks, none risen` +
    (monoOutside.length
      ? `\n  ${monoOutside.length} files still carry font-mono outside the allowlist — ` +
        `the count may only fall`
      : "") +
    (tinyLeft
      ? `\n  ${tinyLeft} sizes still below ${FLOOR}px — the count may only fall`
      : ""),
);
