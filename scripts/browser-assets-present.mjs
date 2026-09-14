/**
 * Every file the site links to is in the release, before the release exists.
 *
 * This is the last gate, and it is here because of how this particular bug
 * behaves: a download link to a release asset that was never uploaded is a
 * 404 with a green build, a green deploy, a rendered page and a working
 * button. Nothing anywhere reports it. The first report is a person saying
 * the download does not work.
 *
 * So the release job runs this against the artefacts it has just collected,
 * and refuses to publish if one of the five names in `src/lib/browser.ts` is
 * missing. Failing loudly with a list beats publishing a release whose page
 * looks complete.
 *
 * Usage: node scripts/browser-assets-present.mjs <dir>
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/browser-assets-present.mjs <dir>");
  process.exit(2);
}

const site = readFileSync("src/lib/browser.ts", "utf8");
const version = site.match(/export const BROWSER_VERSION = "([^"]+)"/)?.[1];
if (!version) {
  console.error("src/lib/browser.ts no longer declares BROWSER_VERSION.");
  process.exit(1);
}

/**
 * The filenames, read out of the same expressions the buttons are built from.
 *
 * A regex over a TypeScript file is not elegant, and the alternative — compile
 * the module to run it — means a build step inside a check whose whole point
 * is to run before anything else can go wrong. The pattern is anchored to
 * `asset(` so it cannot drift onto some other template literal, and it fails
 * loudly if it finds a number of names other than the one the file declares.
 */
const table = site.match(/export const BUILDS: Build\[\] = \[([\s\S]*?)\n\];/)?.[1];
if (!table) {
  console.error(
    "src/lib/browser.ts no longer declares BUILDS as an array literal, so this " +
      "check cannot read the filenames out of it. Rewrite the check; do not delete it.",
  );
  process.exit(1);
}

/**
 * Each build as the site describes it: the filename, and the size the button
 * promises. They are read as one pair because they are one claim — this file
 * is 86 MB and lives at that URL — and checking half of it is how the other
 * half rots.
 */
const wanted = [...table.matchAll(/href: asset\(`([^`]+)`\),\s*\n\s*size: "([\d.]+) MB"/g)].map(
  ([, name, size]) => ({
    name: name.replaceAll("${BROWSER_VERSION}", version),
    claimed: Number(size) * 1e6,
  }),
);

const declared = (table.match(/^\s{4}id: "/gm) ?? []).length;
if (wanted.length !== declared) {
  console.error(
    `Read ${wanted.length} asset names out of src/lib/browser.ts but it declares ` +
      `${declared} builds. The file's shape changed; fix this script rather than ` +
      "letting it check a subset.",
  );
  process.exit(1);
}

/** Everything actually built, wherever the download step put it. */
const found = new Map();
const walk = (d) => {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, entry.name);
    if (entry.isDirectory()) walk(full);
    else found.set(entry.name, statSync(full).size);
  }
};
walk(dir);

const mb = (n) => `${(n / 1e6).toFixed(0)} MB`;
const missing = wanted.filter(({ name }) => !found.has(name));

/**
 * And the sizes, within a tenth.
 *
 * Loose on purpose: an installer grows a few megabytes between versions and
 * nobody should have to edit a number for that. A tenth is wide enough to
 * ignore ordinary drift and narrow enough to catch the case that matters —
 * a button that says 86 MB over a link that spends 300 of somebody's data.
 */
const wrongSize = [];

for (const { name, claimed } of wanted) {
  // `has`, not the size: a zero-byte file is present and wrong in a different
  // way, and reporting it as missing would send somebody looking for the wrong
  // problem.
  if (!found.has(name)) {
    console.log(`  MISSING ${name}`);
    continue;
  }
  const actual = found.get(name);
  const off = Math.abs(actual - claimed) / claimed > 0.1;
  if (off) wrongSize.push({ name, claimed, actual });
  console.log(
    `  ${off ? "SIZE   " : "ok     "} ${name}  ${mb(actual)}` +
      (off ? `  — the site says ${mb(claimed)}` : ""),
  );
}

if (wrongSize.length && !missing.length) {
  console.error(
    `\n${wrongSize.length} download button would misstate its size by more than a tenth:\n` +
      wrongSize
        .map(({ name, claimed, actual }) => `  ${name}: site ${mb(claimed)}, file ${mb(actual)}`)
        .join("\n") +
      "\n\nUpdate `size` in BUILDS in src/lib/browser.ts to the second number.",
  );
  process.exit(1);
}

if (missing.length) {
  console.error(
    `\n${missing.length} of ${wanted.length} downloads would have 404'd.\n\n` +
      "What was actually built:\n" +
      [...found.keys()].sort().map((n) => `  ${n}`).join("\n") +
      "\n\nEither a target stopped producing a file, or electron-builder renamed\n" +
      "one. Fix BUILDS in src/lib/browser.ts to match the list above, or fix the\n" +
      "build block in browser/package.json — but do not publish this release.",
  );
  process.exit(1);
}

console.log(`\nAll ${wanted.length} downloads have a file behind them.`);
