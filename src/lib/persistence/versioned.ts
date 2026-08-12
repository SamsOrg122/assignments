"use client";

/**
 * Surviving your own updates.
 *
 * Every persisted store in this app is somebody's actual work sitting in a
 * browser, and the most ordinary way to destroy it is to ship a new version.
 * Two ways in particular, both of them one line:
 *
 *   1. Renaming the storage key. `assignments:projects:v1` → `…:v2` orphans
 *      every workspace instantly, and nothing goes looking for the old key.
 *   2. Adding `version: 1` to a `persist` config without a `migrate`. Zustand
 *      then has no way to upgrade the stored payload, so it *discards* it.
 *      The user opens the app after an update and their thesis is gone.
 *
 * So keys never change again — the `:v1` in the names is now just a name — and
 * versioning happens inside the payload, through here. Adding a migration is
 * appending one function to a list; the version number is the length of that
 * list, which means it is impossible to bump a version and forget the step.
 *
 * Three rules this enforces, all of them "keep the data":
 *
 *   • A payload from a **newer** version than this build is kept as it is,
 *     not thrown away. Rolling a deployment back must not cost a day's work,
 *     and the readers downstream tolerate fields they don't know.
 *   • A migration that throws does not lose the document. The original bytes
 *     are copied aside first, and the best state reached so far is returned.
 *   • A payload that isn't even valid JSON is copied aside and treated as
 *     absent, so the app opens empty *and the bytes are still recoverable* —
 *     rather than the app failing to start at all.
 */

import { createJSONStorage, type PersistOptions } from "zustand/middleware";

/** Upgrades a payload from version `i` to version `i + 1`. */
export type Migration = (state: unknown) => unknown;

/** Where an unreadable payload is put, so it is never simply gone. */
export const RESCUE_PREFIX = "assignments:rescue:";

function rescue(key: string, raw: string) {
  try {
    // Timestamped rather than overwritten: whatever went wrong, the *first*
    // copy is usually the good one, and a second failure must not replace it.
    localStorage.setItem(`${RESCUE_PREFIX}${key}:${Date.now()}`, raw);
  } catch {
    // Storage is full — which may well be why we are here. Nothing sensible
    // is left to do, and throwing would take the app down with it.
  }
}

export interface Rescued {
  key: string;
  source: string;
  at: number;
  bytes: number;
}

const NONE: Rescued[] = [];
let cache: Rescued[] = NONE;
let cacheSignature = "";
const listeners = new Set<() => void>();

/**
 * Every rescued payload currently held, newest first.
 *
 * Exposed as an external store rather than read during render: localStorage
 * does not exist on the server, so reading it while rendering means the first
 * client render disagrees with the server's and React throws a hydration
 * error. `useSyncExternalStore` is the sanctioned way to read something the
 * server cannot see, and it wants a *stable* snapshot — hence the cache, which
 * only builds a new array when the set of keys actually changes.
 */
export function rescuedPayloads(): Rescued[] {
  if (typeof localStorage === "undefined") return NONE;

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(RESCUE_PREFIX)) keys.push(key);
  }
  const signature = keys.sort().join("|");
  if (signature === cacheSignature) return cache;

  cacheSignature = signature;
  cache = keys
    .map((key) => {
      const rest = key.slice(RESCUE_PREFIX.length);
      const split = rest.lastIndexOf(":");
      return {
        key,
        source: rest.slice(0, split),
        at: Number(rest.slice(split + 1)) || 0,
        bytes: localStorage.getItem(key)?.length ?? 0,
      };
    })
    .sort((a, b) => b.at - a.at);
  return cache;
}

/** The server has no localStorage, so it always sees nothing. */
export function noRescued(): Rescued[] {
  return NONE;
}

export function subscribeRescued(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function forgetRescued(key: string) {
  localStorage.removeItem(key);
  cacheSignature = "";
  for (const listener of listeners) listener();
}

/* ── Writing, and running out of room ───────────────────── */

/**
 * Writes waiting to reach the disk.
 *
 * Every keystroke used to serialise the whole workspace and hand it to
 * `localStorage.setItem` synchronously. At a few hundred rows that is
 * invisible; at fifty thousand it is a quarter of a second of the main thread
 * on every character typed. Coalescing turns a burst of edits into one write.
 *
 * The danger of buffering somebody's work is obvious, so it is bounded on
 * three sides: a short delay, a flush before the page can go away, and
 * `getItem` reading the queue first so nothing in the same tab ever sees a
 * stale value.
 */
const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Long enough to coalesce a burst of typing, short enough to be nothing. */
const WRITE_DELAY = 250;

/**
 * True once the browser has refused a write for want of space.
 *
 * This is the failure worth shouting about. Everything else in this file is
 * about surviving *our* mistakes; this one is the browser saying no, and if it
 * passes silently somebody goes on typing into a workspace that stopped being
 * saved half an hour ago.
 */
let storageFull: { at: number; bytes: number } | null = null;
const fullWatchers = new Set<() => void>();

export const storageIsFull = (): { at: number; bytes: number } | null => storageFull;
export const noStorageProblem = (): null => null;

export function subscribeStorageFull(fn: () => void) {
  fullWatchers.add(fn);
  return () => fullWatchers.delete(fn);
}

/** Once the user has freed room, let the app stop shouting. */
export function clearStorageFull() {
  storageFull = null;
  for (const fn of fullWatchers) fn();
}

function writeNow(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    if (storageFull) clearStorageFull();
    return true;
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    if (!quota) return false;
    // Keep the value queued. Delete something, and the next flush lands it —
    // rather than the work being gone because a timer already dropped it.
    storageFull = { at: Date.now(), bytes: value.length };
    for (const fn of fullWatchers) fn();
    return false;
  }
}

/** Push everything waiting to disk, now. Safe to call at any time. */
export function flushWrites() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  for (const [key, value] of [...pending])
    if (writeNow(key, value)) pending.delete(key);
}

function queueWrite(key: string, value: string) {
  pending.set(key, value);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushWrites();
  }, WRITE_DELAY);
}

if (typeof window !== "undefined") {
  // `pagehide` covers the back/forward cache and the tab being closed;
  // `visibilitychange` covers switching apps on a phone, which is where a
  // browser is most likely to kill the page without warning. Both are
  // deliberately not `beforeunload`, which some browsers ignore.
  window.addEventListener("pagehide", flushWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrites();
  });
}

/**
 * The persist options for a store that must outlive its own releases.
 *
 * `migrations` is append-only: never reorder it, never delete from it, and
 * never edit a step that has shipped — a user two versions behind still has to
 * walk through the same path everyone else did.
 */
export function versioned<S>(
  name: string,
  migrations: Migration[],
): Pick<PersistOptions<S, unknown>, "name" | "version" | "migrate" | "storage"> {
  return {
    name,
    version: migrations.length,

    storage: createJSONStorage(() => ({
      getItem: (key) => {
        // A write waiting to be flushed is the truth; the copy on disk is a
        // few hundred milliseconds behind it.
        const queued = pending.get(key);
        if (queued !== undefined) return queued;

        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        try {
          JSON.parse(raw);
          return raw;
        } catch {
          // Damaged beyond reading. Keep the bytes, start clean, and let
          // Settings offer them back — an app that refuses to open is worse
          // than one that opens empty with the wreckage in a drawer.
          rescue(key, raw);
          return null;
        }
      },
      setItem: (key, value) => queueWrite(key, value),
      removeItem: (key) => {
        pending.delete(key);
        localStorage.removeItem(key);
      },
    })),

    migrate: (persisted, from) => {
      // Newer than this build knows about: hand it back untouched. This is the
      // rollback case, and discarding here is the exact failure this file
      // exists to prevent.
      if (from >= migrations.length) return persisted as S;

      let state = persisted;
      for (let step = from; step < migrations.length; step++) {
        try {
          state = migrations[step](state);
        } catch {
          rescue(name, JSON.stringify(persisted));
          // Stop where it broke rather than pressing on through steps that
          // assume the previous one worked. Whatever survived is returned.
          break;
        }
      }
      return state as S;
    },
  };
}
