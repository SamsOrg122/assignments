/**
 * The contrast floors globals.css claims, actually measured.
 *
 * That file has said "muted 6.5:1, subtle 5.2:1" in a comment for as long as
 * it has had those tokens, and nothing has ever checked it. A comment that
 * states a number is a promise; a promise nothing checks is a number that
 * drifts the first time somebody nudges a hex by two points to make a
 * screenshot look better. So the numbers move out of the comment and in here,
 * where a wrong one fails a build.
 *
 * The more interesting half of this script never fails anything. It prints
 * the surface ramp — surface, surface-2 and surface-3 against the canvas, in
 * both themes — because those three numbers are the load-bearing measurement
 * under docs/calm.md. None of them clears 3:1, which is why a panel is
 * invisible as tone on this palette, why 455 hairlines had to exist to make
 * grouping visible at all, and why the document forbids a fill from ever
 * being the sole carrier of a state. If somebody retunes the ramp so that
 * surface-2 clears 3:1, that reasoning changes — and the next person should
 * meet that fact in a CI log rather than rediscover it from a screenshot two
 * years later.
 *
 * It reads the tokens and nothing else. It cannot see JSX, so it does not
 * guess at which ink lands on which ground; `design-scale.mjs` is the check
 * that watches the class strings. This one's job is the tokens.
 */

import { readFileSync } from "node:fs";

const CSS_PATH = "src/app/globals.css";
const css = readFileSync(new URL(`../${CSS_PATH}`, import.meta.url), "utf8");

// ── Reading the tokens out of the stylesheet ─────────────────────────────
//
// A regex over the whole file would collect every declaration of a name,
// including the storefront's, which redefines the whole palette for a surface
// that is deliberately not the app (§9). So each block is found by its own
// selector and read on its own.

/** The body of the rule whose selector is exactly this, or null. */
function block(selector) {
  const opener = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`);
  const start = css.match(opener);
  if (!start) return null;
  const open = start.index + start[0].length - 1;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

function declarations(selector) {
  const body = block(selector);
  if (body === null) {
    console.error(
      `${CSS_PATH} has no \`${selector}\` block any more.\n\n` +
        "This script names the blocks it reads by hand, because a palette is a set of\n" +
        "decisions and not a pattern. If that selector was renamed, rename it here too.",
    );
    process.exit(1);
  }
  const found = {};
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found[name] = value.trim();
  }
  return found;
}

const dark = declarations("@theme");
const light = { ...dark, ...declarations(':root[data-theme="light"]') };

/** The five alternative accents, each of which overrides the pair twice. */
const ACCENTS = ["violet", "teal", "amber", "rose", "mono"];
const palette = (theme, accent) => {
  const base = theme === "light" ? light : dark;
  if (!accent) return base;
  return {
    ...base,
    ...declarations(
      theme === "light"
        ? `:root[data-theme="light"][data-accent="${accent}"]`
        : `:root[data-accent="${accent}"]`,
    ),
  };
};

// ── WCAG 2.1 relative luminance ──────────────────────────────────────────

const channel = (byte) => {
  const v = byte / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function luminance(token, value) {
  const hex = value.trim().replace("#", "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    // Every token this script touches is opaque on purpose. A ratio against a
    // translucent one would depend on what is behind it, which is a question
    // about the screen and not about the palette.
    console.error(`${token} is \`${value}\`, which is not an opaque hex colour.`);
    process.exit(1);
  }
  const pairs = hex.length === 3 ? [...hex].map((c) => c + c) : hex.match(/../g);
  const [r, g, b] = pairs.map((pair) => channel(parseInt(pair, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(tokens, ink, ground) {
  for (const name of [ink, ground]) {
    if (!tokens[name]) {
      console.error(`${CSS_PATH} no longer defines ${name}, which this script measures.`);
      process.exit(1);
    }
  }
  const a = luminance(ink, tokens[ink]);
  const b = luminance(ground, tokens[ground]);
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

/** Two decimals, and the comparison is made on the printed number so that a
    floor and the figure beside it can never disagree by a rounding. */
const measure = (...args) => Math.round(ratio(...args) * 100) / 100;
const show = (n) => `${n.toFixed(2)}:1`.padStart(8);
const flat = (n) => show(n).trim();

// ── The floors ───────────────────────────────────────────────────────────

const FLOORS = [
  {
    ink: "--color-fg-muted",
    on: "--color-canvas",
    min: { dark: 6.5, light: 6.5 },
    why: "supporting prose — hints, descriptions, inactive nav rows",
  },
  {
    ink: "--color-fg-subtle",
    on: "--color-canvas",
    // 5.2:1 in both themes, which is what globals.css has claimed all along.
    //
    // The first draft of this file pinned light at 4.66 instead, because that
    // is what #71717c actually measured and a check that is red on the day it
    // lands teaches everybody to ignore it. That was the wrong way round: the
    // half-point gap was a real debt on the ink docs/calm.md hands every date,
    // count and group label on a list screen, and writing the shipped number
    // down as the floor would have made the debt permanent and tidy. The
    // palette moved instead — light fg-subtle is #696974 and measures 5.24:1 —
    // so the floor is the promise, and the promise is now true.
    min: { dark: 5.2, light: 5.2 },
    why: "machine facts — dates, counts, kinds, times, courses, group labels",
  },
  {
    // §8 asks for `fg` on `accent`, meaning the filled-button pair. The pair
    // is not fg: globals.css defines --color-on-accent for exactly this job,
    // and argues it out — white on the dark theme's blue is about 3:1, fine
    // for a large glyph and not for a 12px label, so filled buttons take dark
    // ink instead. fg on accent measures 2.60:1 dark and 2.92:1 light and is
    // not used, so checking it would fail a pair nothing renders while leaving
    // the pair everything renders unchecked. The ink actually used is checked,
    // and fg-on-accent is printed below as the evidence for why it exists.
    ink: "--color-on-accent",
    on: "--color-accent",
    min: { dark: 4.5, light: 4.5 },
    accents: true,
    why: "the label on a filled button — the one accent per screen",
  },
];

const failures = [];
const lines = [];

for (const floor of FLOORS) {
  for (const theme of ["dark", "light"]) {
    const variants = floor.accents ? [null, ...ACCENTS] : [null];
    for (const accent of variants) {
      const found = measure(palette(theme, accent), floor.ink, floor.on);
      const min = floor.min[theme];
      const name =
        `${floor.ink.replace("--color-", "")} on ${floor.on.replace("--color-", "")}` +
        (accent ? ` · ${accent}` : "");
      const under = found < min;
      if (under) failures.push({ name, theme, found, min, why: floor.why });
      lines.push(
        `  ${under ? "✕" : "·"} ${name.padEnd(30)} ${theme.padEnd(6)} ${show(found)}` +
          `   floor ${show(min)}`,
      );
    }
  }
}

// ── The ramp, printed and never failed ───────────────────────────────────

const RAMP = ["--color-surface", "--color-surface-2", "--color-surface-3"];
const ramp = RAMP.map((token) => ({
  token,
  dark: measure(dark, token, "--color-canvas"),
  light: measure(light, token, "--color-canvas"),
}));

const INK = ["--color-fg", "--color-fg-muted", "--color-fg-subtle", "--color-warn", "--color-danger", "--color-accent"];

console.log("Floors — these fail the build.\n");
for (const line of lines) console.log(line);

console.log("\nThe surface ramp on the canvas — printed, never failed.\n");
for (const { token, ...themes } of ramp) {
  console.log(
    `    ${token.replace("--color-", "").padEnd(13)} dark ${show(themes.dark)}   light ${show(themes.light)}`,
  );
}

const clears = ramp.filter(({ dark: d, light: l }) => d >= 3 || l >= 3);
if (clears.length === 0) {
  console.log(
    "\n    None of them clears 3:1, so a panel is invisible as tone in either theme.\n" +
      "    That is the measurement docs/calm.md rests on: it is why the boxes that\n" +
      "    survive keep a real 1px line rather than a tint, and why no fill may ever\n" +
      "    be the sole carrier of a state. Ink and weight carry it; a fill reinforces.",
  );
} else {
  console.log(
    `\n    ${clears.map((c) => c.token).join(", ")} now clears 3:1 against the canvas.\n` +
      "    That is new, and it changes an argument: docs/calm.md §1 says a fill may not\n" +
      "    carry a state alone *because* this ramp could not be seen. If the ramp has\n" +
      "    been retuned on purpose, §1 and §5 want rereading, not quoting.",
  );
}

console.log("\nInk on the canvas — printed, for the same reason.\n");
for (const token of INK) {
  console.log(
    `    ${token.replace("--color-", "").padEnd(13)} dark ${show(measure(dark, token, "--color-canvas"))}` +
      `   light ${show(measure(light, token, "--color-canvas"))}`,
  );
}
console.log(
  `    ${"fg on accent".padEnd(13)} dark ${show(measure(dark, "--color-fg", "--color-accent"))}` +
    `   light ${show(measure(light, "--color-fg", "--color-accent"))}` +
    "   ← why --color-on-accent exists",
);

if (failures.length) {
  console.error("\nThese inks dropped below their floor:\n");
  for (const { name, theme, found, min, why } of failures) {
    console.error(`  ${name}, ${theme}: ${flat(found)}, floor ${flat(min)}`);
    console.error(`    ${why}\n`);
  }
  console.error(
    "Nothing in the calm pass gets quieter — things get sorted. The three greys were\n" +
      "given jobs, not moods, and the floors are what makes that safe: fg-subtle carries\n" +
      "every date and count on a list screen, so it is read at 11px by somebody who is\n" +
      "scanning. Put the hex back, or move the job to a different token.",
  );
  process.exit(1);
}

console.log("\nEvery floor holds.");
