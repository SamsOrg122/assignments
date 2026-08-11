"use client";

/**
 * Working without a network.
 *
 * The service worker is registered here rather than in a `<script>` tag so the
 * app can also *unregister* it, which matters more than it sounds: a worker
 * that has cached a broken build is a bug nobody can clear without opening
 * developer tools, and shipping one with no way out is how a PWA becomes a
 * support burden.
 *
 * Registration waits for load. A worker installing while the page is still
 * fetching its own JavaScript competes for the same connection, and on a slow
 * link that is a visible delay on the thing the person actually asked for.
 */

import { useEffect, useSyncExternalStore } from "react";

const PATH = "/sw.js";

/** Whether the browser can do any of this at all. */
export const offlineSupported = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator;

export function registerOffline() {
  if (!offlineSupported()) return;
  // A worker registered on localhost during development would cache a dev
  // build and then serve it after a rebuild, which looks exactly like the app
  // ignoring your edits.
  if (process.env.NODE_ENV !== "production") return;

  const start = () => {
    void navigator.serviceWorker.register(PATH, { scope: "/" }).catch(() => {
      // A registration failure is not worth showing anyone: everything works,
      // it just won't work offline.
    });
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** Remove the worker and everything it cached. Used when signing out. */
export async function clearOffline() {
  if (!offlineSupported()) return;
  navigator.serviceWorker.controller?.postMessage("clear-caches");
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

/* ── Is there a network? ────────────────────────────────── */

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * True when the browser says there is no network.
 *
 * `navigator.onLine` is famously optimistic — it reports a connection to a
 * router that reaches nothing — so this is used to *reassure*, never to block.
 * Nothing in the app waits on it; sync already reports its own failures, which
 * are the ones that reflect whether the server actually answered.
 */
export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && navigator.onLine === false,
    () => false,
  );
}

/** Whether this page is running as an installed app rather than a tab. */
export function useInstalled(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
}

/** Register once, from wherever the shell mounts. */
export function useOfflineReady() {
  useEffect(registerOffline, []);
}
