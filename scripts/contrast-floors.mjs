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

/*
 * Two theme blocks, because the eighteen identity hues are `@theme static`.
 *
 * Tailwind drops a `@theme` variable nothing visibly uses, and nothing
 * visibly uses these — they are addressed by name at runtime from
 * `lib/hue.ts`. `static` keeps them; naming the block here keeps this script
 * measuring what actually ships rather than what the file happens to contain.
 */
const dark = { ...declarations("@theme"), ...declarations("@theme static") };
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

/*
 * The eighteen identity hues, held to the same number as every other small ink.
 *
 * Six for the kinds of thing you can make, twelve for people. They are ink —
 * the glyph on a Library tile, the `#` on a channel, two initials on a disc,
 * the word in a kind chip — read at 11px by somebody scanning a list, which is
 * the exact job `fg-subtle` has and the exact reason its floor is 5.2:1.
 *
 * They are not in FLOORS above because that table is a handful of named pairs
 * with an argument each, and this is one argument applied eighteen times. The
 * lines are folded into one summary row per theme so the report does not turn
 * into thirty-six lines of the same sentence; a hue that drops below the floor
 * is named in full, because then it is the thing you came to read.
 *
 * Six of the light values were tuned down to clear this on the day the check
 * was written — deck, board and four of the person hues measured 4.80–5.16 on
 * paper. The floor is the promise; the palette moves to meet it, which is the
 * same way round `fg-subtle` was settled.
 */
const HUES = [
  "--kind-doc",
  "--kind-notes",
  "--kind-deck",
  "--kind-board",
  "--kind-code",
  "--kind-design",
  ...Array.from({ length: 12 }, (_, i) => `--who-${i + 1}`),
];
const HUE_FLOOR = 5.2;
const HUE_WHY =
  "identity colour — the glyph on a tile, the initials on a disc, a kind chip";

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

for (const theme of ["dark", "light"]) {
  const tokens = theme === "light" ? light : dark;
  const measured = HUES.map((ink) => ({ ink, found: measure(tokens, ink, "--color-canvas") }));
  for (const { ink, found } of measured) {
    if (found < HUE_FLOOR) {
      failures.push({
        name: `${ink.replace("--", "")} on canvas`,
        theme,
        found,
        min: HUE_FLOOR,
        why: HUE_WHY,
      });
    }
  }
  const worst = measured.reduce((a, b) => (b.found < a.found ? b : a));
  const best = measured.reduce((a, b) => (b.found > a.found ? b : a));
  const under = worst.found < HUE_FLOOR;
  lines.push(
    `  ${under ? "✕" : "·"} ${`${HUES.length} identity hues on canvas`.padEnd(30)} ` +
      `${theme.padEnd(6)} ${show(worst.found)}   floor ${show(HUE_FLOOR)}` +
      `   (worst ${worst.ink.replace("--", "")}, best ${flat(best.found)})`,
  );
}
// ── The ramp, printed and never failed ───────────────────────────────────

/*
 * And the storefront, which is a third surface this file did not know about.
 *
 * The marketing pages are their own palette — paper, ink and one coral, in a
 * `.storefront` block that redefines every token the app defines. Its first
 * version shipped its supporting grey at 6.35:1 and its meta grey at 4.03:1,
 * both under the floors above, and nothing here noticed: this script only
 * ever read `@theme` and the light override.
 *
 * A floor that applies to one of two surfaces is not a floor. So the
 * storefront is held to the same numbers, measured once because it is
 * committed to one appearance.
 */
const STOREFRONT = declarations(".storefront");

const STOREFRONT_FLOORS = [
  { ink: "--ink", min: 12, why: "the storefront's body text" },
  { ink: "--graphite", min: 6.5, why: "supporting prose — ledes, card copy, footer links" },
  { ink: "--mist", min: 5.2, why: "machine facts — sizes, versions, captions" },
];

const storefrontLines = [];
for (const floor of STOREFRONT_FLOORS) {
  const found = measure(STOREFRONT, floor.ink, "--paper");
  const under = found < floor.min;
  const name = `${floor.ink.replace("--", "")} on paper`;
  if (under) failures.push({ name, theme: "storefront", found, min: floor.min, why: floor.why });
  storefrontLines.push(`  ${under ? "·" : " "} ${name.padEnd(28)}${show(found)}   floor ${show(floor.min)}`);
}

console.log("\nThe storefront, measured on its own paper.\n");
console.log(storefrontLines.join("\n"));

/*
 * And the one band on that page which is not paper.
 *
 * `.section--dark` re-points the same three ink tokens onto a dark ground, so
 * every rule underneath it comes out light without knowing anything has
 * changed. That is a fourth surface, and a floor that applies to three of
 * four surfaces is not a floor — this is the same mistake the storefront
 * itself shipped before the block above existed, arriving one level deeper.
 *
 * Its ground is a gradient, which has no single colour to measure against.
 * `--band-lit` is the *lightest* reading of it, and that is the load-bearing
 * word: light ink on a dark ground fails at the light end, so the first
 * version of this — which measured the darkest stop and said so proudly —
 * was measuring the best case and would have passed the band whatever was
 * done to the top of it. It did: the supporting grey in the comparison rows
 * was sitting at 3.7:1 against a floor of 5.2 and this script called it 5.33.
 *
 * Everything on the band is now built to stay under that number — the
 * gradient darkens downward, the vignette only darkens, and every panel is a
 * black tint rather than a white one — so this is the worst case again, and
 * this time in the direction that can actually fail.
 */
const DARK = declarations(".section--dark");

const DARK_FLOORS = [
  { ink: "--ink", min: 12, why: "the band's headline and its three figures" },
  { ink: "--graphite", min: 6.5, why: "supporting prose — the lede and the line under each figure" },
  { ink: "--mist", min: 5.2, why: "machine facts — the file path under each figure" },
];

const darkLines = [];
for (const floor of DARK_FLOORS) {
  const found = measure(DARK, floor.ink, "--band-lit");
  const under = found < floor.min;
  const name = `${floor.ink.replace("--", "")} on the band`;
  if (under) failures.push({ name, theme: "dark band", found, min: floor.min, why: floor.why });
  darkLines.push(`  ${under ? "·" : " "} ${name.padEnd(28)}${show(found)}   floor ${show(floor.min)}`);
}

console.log("\nThe dark band, measured on the lightest stop of its gradient.\n");
console.log(darkLines.join("\n"));

/*
 * And the fan at the foot of the homepage, which is the mirror of the band.
 *
 * Five download links set in white on a violet gradient. The band above is
 * light ink on a dark ground and is measured on the *darkest* stop of it;
 * this is the same problem upside down, so it is measured on the *lightest*.
 *
 * It is here because the first version of that panel got this wrong in a way
 * no build would have caught: the gradient ran from violet down to near-white
 * and the words in the bottom third of it were sitting at about 1.3:1. The
 * fix was not to darken the type — it was to darken the panel until the white
 * the design asked for could actually be read. `--fan-lit` is what that
 * decision rests on, and a stop lightened by a pixel of taste is exactly the
 * change that would undo it quietly.
 *
 * Read off `.get`, the wrapper, rather than `.get__fan` — that selector
 * appears twice in the stylesheet and this script matches the first one it
 * sees. The property is declared there and inherits down; globals.css says so
 * at the declaration.
 */
const FAN = declarations(".get");
const FAN_FLOOR = 5.2;
const fanFound = measure({ ...FAN, "--white": "#ffffff" }, "--white", "--fan-lit");
if (fanFound < FAN_FLOOR) {
  failures.push({
    name: "white on the download fan",
    theme: "storefront",
    found: fanFound,
    min: FAN_FLOOR,
    why: "the five download links, and the 12.5px line naming each file's size",
  });
}
console.log("\nThe download fan, measured on the lightest stop of its gradient.\n");
console.log(
  `  ${fanFound < FAN_FLOOR ? "·" : " "} ${"white on the fan".padEnd(28)}${show(fanFound)}` +
    `   floor ${show(FAN_FLOOR)}`,
);

const RAMP = [
  "--color-surface",
  "--color-surface-2",
  "--color-surface-3",
  // The furniture's ground and its two states. Printed here rather than
  // floored, for the same reason as the surface ramp: the whole argument for
  // `nav` is that it is a *material*, not a signal — a step you notice as
  // "this column is a different thing" and never as "this row is selected".
  // Both themes take about the same size of step in opposite directions,
  // which is the thing worth being able to see in a CI log.
  "--color-nav",
  "--color-nav-2",
  "--color-nav-3",
];
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
