/**
 * The window's own linter.
 *
 * It did not have one until the web app's deploy failed. `desktop/` sat in
 * the repository with nothing checking its TypeScript, and the first thing to
 * look at it was the hosting build — which found two real React mistakes in
 * here by accident, on its way to failing for an unrelated reason. A separate
 * application needs its own checks, not somebody else's by coincidence.
 *
 * Narrow on purpose: `src` only. `src-tauri/target` is build output, and
 * linting a few hundred generated files to say nothing about them is how a
 * linter becomes something people pass `--no-verify` to.
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "src-tauri/**", "node_modules/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
);
