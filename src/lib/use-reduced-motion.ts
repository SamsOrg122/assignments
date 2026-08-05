"use client";

/**
 * Whether this visitor has asked for less motion.
 *
 * Reads both signals: the OS-level media query, and the app's own motion
 * preference (which the storefront inherits through `<html data-motion>`).
 * `useSyncExternalStore` rather than an effect — the value exists before the
 * first paint, so nothing has to animate once and then apologise.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener("change", onChange);

  // The app preference lands as an attribute on <html>, so watch for that too.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });

  return () => {
    mq?.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

const getSnapshot = () =>
  window.matchMedia?.(QUERY).matches === true ||
  document.documentElement.dataset.motion === "reduced";

// The server can't know, and guessing "reduced" would ship a still page to
// everyone. Motion is the safe default because the CSS neutralises it anyway.
const getServerSnapshot = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
