"use client";

/**
 * Which theme is on the page right now, and a way to flip it.
 *
 * `APPEARANCE_BOOT_SCRIPT` already resolves the reader's preference — stored
 * choice, or the system's when it is "system" — and writes `data-theme` on
 * `<html>` before React hydrates. So the answer is already in the DOM; this
 * reads it rather than keeping a second copy.
 *
 * That matters more than it sounds. The obvious alternative is a React context
 * over the appearance store, and it would be a second source of truth for a
 * fact the document already carries: the two could disagree for a frame after
 * hydration, which is exactly when a flash of the wrong palette is visible.
 *
 * ── WHY A MutationObserver ──────────────────────────────────────────────
 * The storefront's toggle is not the only thing that can change this. Settings
 * changes it, the boot script sets it, and on "system" the OS changes it while
 * the tab is open. Watching the attribute catches all four without any of them
 * knowing this hook exists.
 */

import { useEffect, useState } from "react";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, type ThemeMode } from "./appearance";

export type Theme = "light" | "dark";

/** What `data-theme` says, or light before the browser has told us. */
export function useTheme(): Theme {
  /*
   * Always "light" on the first render, never a read of the DOM.
   *
   * A lazy initialiser that read `document` would give the server one answer
   * and the client another, which is a hydration mismatch React reports as an
   * error and repairs by throwing the server's markup away. The effect below
   * corrects it on the first commit, and the `transition` on the tokens turns
   * that correction into a crossfade.
   */
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    /* The same condition the CSS uses, and it has to stay the same one: the
       storefront is dark when the reader chose dark, not when the app's own
       default happens to be. See the `[data-theme-chosen]` selector in
       globals.css. */
    const read = () =>
      setTheme(
        root.dataset.theme === "dark" && root.dataset.themeChosen !== undefined
          ? "dark"
          : "light",
      );
    read();

    const watch = new MutationObserver(read);
    watch.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "data-theme-chosen"],
    });
    return () => watch.disconnect();
  }, []);

  return theme;
}

/**
 * Flip the theme, and write the choice down where the app will find it.
 *
 * The storefront and the app share one preference: somebody who turns the
 * marketing page dark and then signs in should not be handed a light
 * workspace. So this writes the same localStorage key the appearance store
 * persists to, in the same shape — `{ state: … }` is zustand's persist
 * envelope, and reproducing it here is the price of not importing the app's
 * store into the storefront bundle.
 *
 * Deliberately not "system": this is a button somebody pressed, so it records
 * an explicit choice. Leaving it on "system" would mean the page flips back
 * the moment the OS changes, which reads as the toggle not working.
 */
export function toggleTheme(): Theme {
  const root = document.documentElement;
  const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";

  root.dataset.theme = next;
  // Pressing the toggle is what a choice is, so record that it was made.
  root.dataset.themeChosen = "";
  root.style.colorScheme = next;

  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    const held = raw ? (JSON.parse(raw) as { state?: Record<string, unknown> }) : {};
    const state = { ...DEFAULT_APPEARANCE, ...(held.state ?? {}), mode: next as ThemeMode };
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...held, state }));
  } catch {
    // A browser with storage blocked still gets the flip; it just does not
    // remember it. Failing the visible half over the invisible half would be
    // the wrong way round.
  }

  return next;
}
