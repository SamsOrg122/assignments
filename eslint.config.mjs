import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The desktop app is a separate application with its own dependencies,
    // its own tsconfig and its own eslint config. Linting it from here means
    // judging it by the web app's rules and, worse, walking a few hundred
    // files of Rust build output under `src-tauri/target`.
    "desktop/**",
  ]),
]);

export default eslintConfig;
