import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite, aimed at a window rather than a browser tab.
 *
 * The fixed port matters: Tauri is told where the dev server lives in
 * `tauri.conf.json`, and a port that moves when 1420 is busy would leave the
 * window staring at nothing. `strictPort` turns that into an error you can
 * read instead of a blank panel you cannot.
 */
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // The Rust side has its own rebuild loop; watching it here only makes
      // the frontend reload for changes it cannot see.
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // What the two webviews Tauri ships can actually parse: WebKit on macOS
    // and Linux, WebView2 (Chromium) on Windows.
    target: ["es2021", "safari14"],
    sourcemap: true,
  },
});
