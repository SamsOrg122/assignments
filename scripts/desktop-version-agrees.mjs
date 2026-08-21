/**
 * Four files have to say the same version, and nothing was checking.
 *
 * The desktop app's version appears in `package.json`, `Cargo.toml` and
 * `tauri.conf.json` — and a fourth time in the web app, as `DESKTOP_VERSION`,
 * because the download buttons build their URLs out of it. The release is
 * named from `tauri.conf.json`, so if the web constant lags, every download
 * link on the site 404s; if it leads, they 404 until the release is cut.
 *
 * Neither failure shows up in a typecheck, a lint or a test. They show up as
 * somebody clicking Download and getting a GitHub error page — or, worse, as
 * a link that works and quietly hands out an older-looking app, which is how
 * this check came to exist.
 */

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const found = {
  "desktop/package.json": JSON.parse(read("desktop/package.json")).version,
  "desktop/src-tauri/tauri.conf.json": JSON.parse(
    read("desktop/src-tauri/tauri.conf.json"),
  ).version,
  // The first `version = "..."` in the manifest is the package's own; a
  // dependency's would be under a `[dependencies.*]` table further down.
  "desktop/src-tauri/Cargo.toml": read("desktop/src-tauri/Cargo.toml").match(
    /^version\s*=\s*"([^"]+)"/m,
  )?.[1],
  "src/lib/db/notes.ts": read("src/lib/db/notes.ts").match(
    /DESKTOP_VERSION\s*=\s*"([^"]+)"/,
  )?.[1],
};

const missing = Object.entries(found).filter(([, v]) => !v);
if (missing.length) {
  console.error("Couldn't find a version in:");
  for (const [file] of missing) console.error(`  ${file}`);
  process.exit(1);
}

const versions = [...new Set(Object.values(found))];
if (versions.length > 1) {
  console.error("The desktop version does not agree across the repository:\n");
  for (const [file, v] of Object.entries(found)) console.error(`  ${v}\t${file}`);
  console.error(
    "\nThe release is named from tauri.conf.json and the download links are built\nfrom DESKTOP_VERSION, so a mismatch is a 404 on every Download button.",
  );
  process.exit(1);
}

console.log(`desktop version ${versions[0]}, agreed by all four files.`);
