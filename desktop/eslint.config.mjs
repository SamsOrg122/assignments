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
    rules: {
      /*
       * Nothing under `desktop/` may import the web app's speech module.
       *
       * `src/lib/speech/index.ts` hands over to `mock.ts` whenever the Web
       * Speech API is missing or errors — and the system webview this app runs
       * in has no Web Speech API on any platform, so that hand-over is not an
       * edge case here, it is the only path. `mock.ts` does not transcribe, it
       * recites: a scripted monologue with invented figures. The far end of
       * the recording pipeline writes appointments into a real agenda.
       *
       * A downloadable binary that files a meeting nobody had is the worst
       * thing this project could ship, and today the only thing preventing it
       * is that `desktop/package.json` has no path alias to the web app. That
       * is luck. This is a decision.
       *
       * The bar records through Rust — `record/mod.rs` captures and posts to
       * /api/listen with the account's own token — precisely so that it never
       * needs anything from that module.
       */
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/speech", "@/lib/speech/*", "**/src/lib/speech/*"],
              message:
                "The web app's speech module falls back to a provider that recites a fabricated meeting. The bar records through Rust; see desktop/src-tauri/src/record/mod.rs.",
            },
          ],
        },
      ],
    },
  },
);
