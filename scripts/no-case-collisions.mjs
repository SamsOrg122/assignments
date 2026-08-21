/**
 * Refuse two modules whose names differ only in case.
 *
 * `desktop/src/Assistant.tsx` and `desktop/src/assistant.ts` are two files on
 * Linux and one file on macOS and Windows. Everything compiled here, the
 * linter was happy, the tests passed, and three of the four release builds
 * died within two seconds of starting — because on a case-insensitive disk
 * `./Assistant` and `./assistant` resolve to the same module and TypeScript
 * will not guess which one you meant.
 *
 * Every check in this repository runs on Linux, which is precisely the
 * platform that cannot see this. So the rule is checked directly rather than
 * left to a compiler that would have to be running somewhere else to notice.
 *
 * The comparison is on the *module* name — the basename with its extension
 * taken off, within one directory — because that is what an import resolves.
 * Comparing whole filenames would let this exact bug through: `assistant.ts`
 * and `Assistant.tsx` are different strings even lowercased.
 */

import { execFileSync } from "node:child_process";
import { basename, dirname, extname } from "node:path";

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => path && EXTENSIONS.has(extname(path)));

/** directory + lowercased module name → the files claiming it. */
const claims = new Map();
for (const path of files) {
  const key = `${dirname(path)}/${basename(path, extname(path)).toLowerCase()}`;
  claims.set(key, [...(claims.get(key) ?? []), path]);
}

const clashes = [...claims.values()].filter((paths) => paths.length > 1);

if (clashes.length) {
  console.error(
    "These modules differ only in case, so they are the same file on macOS and Windows:\n",
  );
  for (const paths of clashes) console.error(`  ${paths.join("  ↔  ")}`);
  console.error(
    "\nRename one of each pair. A component and the module it talks to need different names,\nnot the same name in different cases.",
  );
  process.exit(1);
}

console.log(`${files.length} modules, no case collisions.`);
