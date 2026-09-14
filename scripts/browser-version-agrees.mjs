/**
 * The website and the browser have to name the same version.
 *
 * `src/lib/browser.ts` builds five download URLs out of `BROWSER_VERSION`, and
 * `electron-builder` names five files out of `version` in
 * `browser/package.json`. When those two drift, every download link on the site
 * 404s — and nothing fails: the build is green, the types are fine, the page
 * renders, and the only symptom is a visitor who cannot get the product.
 *
 * That is exactly the shape of bug `desktop-version-agrees.mjs` was written for
 * on the other download, and this is the same check for this one. Two scripts
 * rather than one generalised one: they read different files for different
 * reasons, and the second would have to be told which is which anyway.
 */

import { readFileSync } from "node:fs";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync("browser/package.json", "utf8"));
const site = readFileSync("src/lib/browser.ts", "utf8");

const declared = site.match(/export const BROWSER_VERSION = "([^"]+)"/)?.[1];

if (!declared)
  fail(
    "src/lib/browser.ts no longer declares BROWSER_VERSION as a string literal.\n" +
      "This check reads it by pattern, so if it became computed, compute it from\n" +
      "browser/package.json and delete this script rather than loosening it.",
  );

if (declared !== pkg.version)
  fail(
    `The website offers browser ${declared}; browser/package.json says ${pkg.version}.\n\n` +
      "Every download link on the site is built from the first of those, and every\n" +
      "artefact from the second. One of them is wrong and the symptom is five dead\n" +
      "links with no error anywhere.",
  );

/*
 * The artefact names, not only the number.
 *
 * NSIS takes the explicit `artifactName` from the build block; if somebody
 * changes that template the Windows link breaks while the version still
 * matches, which is the failure this second half exists to catch.
 */
const nsis = pkg.build?.nsis?.artifactName;
if (nsis !== "Tougather-Setup-${version}.${ext}")
  fail(
    `browser/package.json names its Windows installer "${nsis}".\n` +
      "src/lib/browser.ts builds that URL as Tougather-Setup-<version>.exe.\n" +
      "Change both, or neither.",
  );

console.log(`browser ${pkg.version}, and the site offers the same one.`);
