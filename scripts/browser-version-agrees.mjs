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

/*
 * And the three names nobody wrote down.
 *
 * macOS and Linux take electron-builder's default templates, and the default
 * is the only form that drops `x64` from the filename: `expandArtifactNamePattern`
 * skips the architecture exactly when the pattern was *not* user-specified.
 * So the moment somebody adds an `artifactName` to `mac` or `linux` — even one
 * that looks identical to the default — `Tougather-0.1.0.dmg` silently becomes
 * `Tougather-0.1.0-x64.dmg` and three links die.
 *
 * This is the single least guessable thing about this build, which is why it
 * is asserted here rather than trusted.
 */
for (const target of ["mac", "dmg", "linux", "appImage", "deb"]) {
  const named = pkg.build?.[target]?.artifactName;
  if (named)
    fail(
      `browser/package.json sets an explicit artifactName on "${target}".\n\n` +
        "That flips electron-builder out of its default naming, and its default is\n" +
        "the only mode that leaves x64 out of the filename. The site links to\n" +
        "Tougather-<version>.dmg and Tougather-<version>.AppImage; with a template\n" +
        "of your own they become -x64 and -x86_64 and every link 404s.\n\n" +
        "If the rename is wanted, change src/lib/browser.ts to match and update\n" +
        "this check.",
    );
}

/*
 * The engine major, which is prose everywhere else.
 *
 * The homepage printed "33 Electron, Chromium from late 2024" for a release
 * after the browser moved to 44. It was a true sentence typed into a
 * component, it aged, and nothing here reads prose — on the page whose whole
 * argument is that its figures resolve to a file, that is the worst thing to
 * be wrong about. `ELECTRON_MAJOR` now lives beside the download URLs and the
 * page interpolates it; this is what stops it drifting again.
 */
const declaredMajor = Number(site.match(/export const ELECTRON_MAJOR = (\d+)/)?.[1]);
const range = pkg.devDependencies?.electron ?? pkg.dependencies?.electron;
const realMajor = Number(String(range ?? "").match(/(\d+)/)?.[1]);

if (!declaredMajor)
  fail(
    "src/lib/browser.ts no longer declares ELECTRON_MAJOR as a number literal.\n" +
      "The homepage prints it. If it became computed, compute it from\n" +
      "browser/package.json and delete this half of the check rather than loosening it.",
  );

if (!realMajor)
  fail(`browser/package.json does not depend on electron in a form this check can read: ${range}`);

if (declaredMajor !== realMajor)
  fail(
    `The website says Electron ${declaredMajor}; browser/package.json depends on ${range}.\n\n` +
      "That number is printed on the homepage as a fact about the build people are\n" +
      "downloading, next to the Chromium it carries. Update ELECTRON_MAJOR and\n" +
      "CHROMIUM_MAJOR in src/lib/browser.ts together — the second is not derivable\n" +
      "from the first and has to be read off Electron's release notes.",
  );

console.log(
  `browser ${pkg.version} on Electron ${realMajor}, and the site says the same of both.`,
);
