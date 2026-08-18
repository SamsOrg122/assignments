"use client";

/**
 * Carrying the work between browsers.
 *
 * The store is the source of truth while you are typing; this pushes it up and
 * pulls other machines' changes down. Not a CRDT — one project is one document
 * and the newer `updatedAt` wins — which is honest about what it can do: two
 * people editing the same project in two browsers is what a *live session* is
 * for, and that is a different mechanism entirely (`lib/collab`). This is for
 * the same person on their laptop and then on their phone.
 *
 * Three rules, and every one of them exists because the failure it prevents
 * loses somebody's work:
 *
 *   1. **A pull never deletes a project it has not seen before.** A local
 *      project missing from the server is one that has not been pushed yet,
 *      not one that was deleted somewhere else. Only projects this browser has
 *      actually synced can be removed by their absence.
 *   2. **A failed pull cancels the push.** Pushing against a half-read server
 *      is how a partial list becomes a deletion.
 *   3. **Deleting is a tombstone, not a silence.** Delete on the laptop, close
 *      it, open the phone: without a record of the deletion the project comes
 *      straight back. Tombstones are persisted so they survive being made
 *      offline.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useProjects, useHydrated } from "../store";
import { versioned } from "../persistence/versioned";
import type { Project } from "../types";
import { getDatabase, isRemoteConfigured, toRemote } from "./index";
import { ensureRemoteConfig, subscribeConfig } from "./config";
import { useRemoteConfigured } from "./use-config";
import { explainAuthErrorLine } from "../auth/errors";

/* ── What the UI can say about it ───────────────────────── */

export type SyncState = "off" | "working" | "synced" | "error" | "paused";

export interface SyncStatus {
  state: SyncState;
  /** When the last successful sync finished. */
  at?: number;
  /** Why it stopped, in words a person can act on. */
  problem?: string;
}

/**
 * "off" means there is no database, not that nothing has happened yet.
 *
 * Starting at "off" with one configured would have Settings say the work is
 * browser-only for as long as the first round trip takes — and leave it saying
 * that forever if the round trip never returns, which is exactly when a person
 * most needs to be told the truth.
 */
let status: SyncStatus = isRemoteConfigured()
  ? { state: "working" }
  : { state: "off" };
const watchers = new Set<() => void>();

/**
 * The configuration can arrive after this module loads — that is the whole
 * point of the runtime lookup — and a status that stayed "off" would have
 * Settings insisting there is no database while sync is busy using one.
 */
subscribeConfig(() => {
  if (isRemoteConfigured() && status.state === "off")
    setStatus({ state: "working" });
});

const setStatus = (next: SyncStatus) => {
  status = next;
  watchers.forEach((fn) => fn());
};

export const syncStatus = () => status;
export function subscribeSync(fn: () => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/* ── Tombstones ─────────────────────────────────────────── */

interface Memory {
  /**
   * Whose work this browser is holding.
   *
   * Everything below — which projects are synced, which are buried — is only
   * meaningful against one identity. Signing in as somebody else on the same
   * laptop does not make their account the owner of what is already here, and
   * carrying on regardless would file one person's documents into another
   * person's workspace.
   */
  owner: string | null;
  /** Project id → when it was deleted here. */
  graves: Record<string, number>;
  /**
   * Project id → the `updatedAt` this browser last agreed on with the server.
   *
   * Persisted, and it has to be. It is what separates "not pushed yet" from
   * "deleted on the other machine", and holding it only in memory means the
   * distinction is lost on every reload — so a deletion made on the laptop is
   * undone by the phone pushing its copy straight back.
   */
  synced: Record<string, number>;
  bury: (id: string) => void;
  forget: (id: string) => void;
  remember: (id: string, updatedAt: number) => void;
  drop: (id: string) => void;
  /** Take ownership — used on the first sync, and after signing out. */
  claim: (owner: string | null) => void;
}

const useMemory = create<Memory>()(
  persist(
    (set) => ({
      owner: null,
      graves: {},
      synced: {},
      // Clearing the ledger with it: what was synced, and what was deleted,
      // were facts about the previous account and are not true of the next.
      claim: (owner) => set({ owner, synced: {}, graves: {} }),
      bury: (id) => set((s) => ({ graves: { ...s.graves, [id]: Date.now() } })),
      forget: (id) =>
        set((s) => {
          const graves = { ...s.graves };
          delete graves[id];
          return { graves };
        }),
      remember: (id, updatedAt) =>
        set((s) => ({ synced: { ...s.synced, [id]: updatedAt } })),
      drop: (id) =>
        set((s) => {
          const synced = { ...s.synced };
          delete synced[id];
          return { synced };
        }),
    }),
    { ...versioned<Memory>("assignments:sync:v1", []), skipHydration: true },
  ),
);

/**
 * The tombstones and the ledger, in memory.
 *
 * `skipHydration` is set, like every other persisted store here, so this has
 * to be asked for — and asked for exactly once, hence the cached promise. The
 * sign-in screens need it too: they read the owner to decide whether there is
 * anything to ask about, and an un-hydrated store answers "nobody" for every
 * browser, including the ones holding a year of work.
 */
let rehydrated: Promise<void> | null = null;

export function ensureSyncMemory(): Promise<void> {
  rehydrated ??= Promise.resolve(useMemory.persist.rehydrate()).then(() => {});
  return rehydrated;
}

/* ── The loop ───────────────────────────────────────────── */

/** Long enough that typing doesn't cause a write per keystroke. */
const SETTLE_MS = 2_000;

let running = false;
let queued = false;

async function reconcile(): Promise<void> {
  // Settled by the time anything renders in the normal case; awaited here for
  // the one that isn't — "Sync now" pressed on a page that has only just
  // loaded, before `/api/config` has answered.
  await ensureRemoteConfig();

  const db = getDatabase();
  if (db.name === "browser") return;

  if (running) {
    queued = true;
    return;
  }
  running = true;
  setStatus({ ...status, state: "working" });

  try {
    // An identity first: every row is written against a user, anonymous or
    // not, and without one the writes below fail on row level security in a
    // way that reads like a network problem.
    const session = await db.session();

    if (session) {
      const owner = useMemory.getState().owner;
      if (owner === null) useMemory.getState().claim(session.userId);
      else if (owner !== session.userId) {
        // Somebody else is signed in on a browser holding work that isn't
        // theirs. Stop — completely. Pushing would copy it into their account,
        // pulling would mix two people's libraries, and deleting would be
        // unforgivable. Signing out clears this; nothing here is lost meanwhile.
        setStatus({
          state: "paused",
          at: status.at,
          problem:
            "This browser holds work from another account. Sign out to sync as the account you're now signed in to.",
        });
        return;
      }
    }

    const remote = await db.list();
    // Tombstones travel with the list. A row that is *absent* is never treated
    // as deleted — see the note in `supabase.ts`.
    const buried = new Map(
      remote.filter((r) => r.deletedAt !== null).map((r) => [r.id, r]),
    );
    const remoteById = new Map(
      remote.filter((r) => r.deletedAt === null).map((r) => [r.id, r]),
    );
    const memory = useMemory.getState();
    const { graves } = memory;
    const local = useProjects.getState().projects;
    const localById = new Map(local.map((p) => [p.id, p]));

    /* ── Deletions, both directions ── */

    for (const [id, at] of Object.entries(graves)) {
      if (remoteById.has(id)) {
        await db.remove(id);
        remoteById.delete(id);
        memory.drop(id);
      } else if (buried.has(id)) {
        // Already buried up there — nothing to do, and the local tombstone has
        // done its job.
        memory.drop(id);
      }
      // Kept for a week, then forgotten: a tombstone's whole job is to outlive
      // the time between two machines being opened, and after that it is just
      // a growing list of things that no longer exist anywhere.
      if (Date.now() - at > 7 * 24 * 60 * 60 * 1000) memory.forget(id);
    }

    // Buried on another machine, and not touched here since. A local edit made
    // after the tombstone outranks it — you meant to keep this one — and the
    // push below revives the row.
    const deletedElsewhere = local.filter((p) => {
      const grave = buried.get(p.id);
      return grave !== undefined && (grave.deletedAt ?? 0) > p.updatedAt;
    });

    /* ── Adopt what is newer up there ── */

    const adopt: Project[] = [];
    for (const row of remoteById.values()) {
      if (graves[row.id]) continue; // Deleted here; the removal above wins.
      const mine = localById.get(row.id);
      if (!mine || row.updatedAt > mine.updatedAt) adopt.push(row.content);
      // Record the version the *server* holds, not the local one. Recording
      // the local version here would claim it had been pushed when it hasn't,
      // and the push below — which skips anything already synced — would then
      // never send it. Every edit made on this machine would stay on it.
      else memory.remember(row.id, row.updatedAt);
    }

    if (adopt.length || deletedElsewhere.length) {
      const dropped = new Set(deletedElsewhere.map((p) => p.id));
      const adopted = new Map(adopt.map((p) => [p.id, p]));
      useProjects.setState((s) => ({
        projects: [
          ...s.projects
            .filter((p) => !dropped.has(p.id))
            .map((p) => adopted.get(p.id) ?? p),
          // Anything from the server this browser has never seen.
          ...adopt.filter((p) => !s.projects.some((mine) => mine.id === p.id)),
        ],
      }));
      for (const p of adopt) memory.remember(p.id, p.updatedAt);
      // Dropped here because it was dropped there — not a new deletion of
      // ours, so no tombstone; the watcher's `bury` is undone deliberately.
      for (const id of dropped) {
        memory.drop(id);
        memory.forget(id);
      }
    }

    /* ── Push what is newer down here ── */

    for (const project of useProjects.getState().projects) {
      if (useMemory.getState().graves[project.id]) continue;
      if (useMemory.getState().synced[project.id] === project.updatedAt) continue;
      await db.put({
        ...toRemote(project),
        // Monotonic per push, so a later write is visibly later even when two
        // machines' clocks disagree about `updatedAt`. Counted across buried
        // rows too, so reviving one continues its history rather than
        // restarting it.
        revision:
          (remoteById.get(project.id)?.revision ??
            buried.get(project.id)?.revision ??
            0) + 1,
      });
      useMemory.getState().remember(project.id, project.updatedAt);
    }

    setStatus({ state: "synced", at: Date.now() });
  } catch (error) {
    // Raw Postgres and GoTrue strings are not an answer. "Anonymous sign-ins
    // are disabled" describes a switch in a dashboard, and the person reading
    // this needs to be told which one.
    setStatus({
      state: "error",
      at: status.at,
      problem: explainAuthErrorLine(error),
    });
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void reconcile();
    }
  }
}

/* ── Wiring ─────────────────────────────────────────────── */

/**
 * Start syncing once the store has hydrated.
 *
 * Waiting is not politeness. Before hydration the store holds the seed
 * workspace, and pushing that would upload a set of example projects over
 * somebody's real ones — the single worst thing this file could do.
 */
export function useSync() {
  const hydrated = useHydrated();
  // Flips when `/api/config` answers, so keys set in a host's dashboard start
  // working on this page load instead of on the next deploy.
  const configured = useRemoteConfigured();

  useEffect(() => {
    if (!hydrated || !configured) return;

    let seen = new Set(useProjects.getState().projects.map((p) => p.id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const unsubscribe = useProjects.subscribe((state) => {
      // Every removal path ends here — delete, reset, restoring a backup — so
      // the tombstone doesn't depend on remembering to record it in each of
      // them.
      const now = new Set(state.projects.map((p) => p.id));
      for (const id of seen) if (!now.has(id)) useMemory.getState().bury(id);
      // …and a project arriving under an id we buried is a resurrection:
      // restoring from a backup should undo the deletion, not fight it.
      for (const id of now) if (!seen.has(id)) useMemory.getState().forget(id);
      seen = now;

      clearTimeout(timer);
      timer = setTimeout(() => void reconcile(), SETTLE_MS);
    });

    // The tombstones have to be in memory before the first reconcile, or a
    // deletion made offline is silently undone by the pull that follows it.
    void ensureSyncMemory().then(() => {
      if (!cancelled) void reconcile();
    });

    // Coming back to a tab that has been asleep is exactly when the other
    // machine's work is waiting.
    const onFocus = () => void reconcile();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      clearTimeout(timer);
    };
  }, [hydrated, configured]);
}

/** Force a round trip — the "Sync now" button. */
export const syncNow = () => reconcile();

/**
 * Let the next identity take over this browser's work.
 *
 * Called on sign-out, and on signing *in* as somebody whose id differs from
 * the anonymous one this browser has been using. What is here stays here and
 * the next session adopts it — which is exactly what "signing out leaves
 * everything on this device" has to mean if the promise is to survive contact
 * with sync, and what "sign in and my work is there" has to mean on the way
 * back in.
 *
 * The owner check in `reconcile` is what makes this necessary rather than
 * automatic: it exists so that signing in as somebody else on a shared laptop
 * cannot quietly copy the first person's documents into the second person's
 * account. Handing over is that decision being made deliberately, by someone
 * who was asked.
 */
export function handOver() {
  useMemory.getState().claim(null);
  void reconcile();
}

/**
 * Sign in and leave what is here behind.
 *
 * For the other answer to the same question: the work in this browser is not
 * mine, so don't carry it into my account. The projects are cleared locally —
 * the form that calls this offers a backup file first and does not proceed
 * without one being taken — and the account's own work arrives on the next
 * pull.
 */
export function startFresh() {
  useProjects.setState({ projects: [] });
  // After the store, so the watcher's tombstones for those projects are
  // cleared with the rest of the previous identity's ledger. Burying them
  // would push a deletion into the account that never had them.
  useMemory.getState().claim(null);
  void reconcile();
}

/**
 * Whose work this browser currently holds, as far as sync is concerned. Null
 * before the first successful round trip, and after a hand-over.
 */
export const syncOwner = (): string | null => useMemory.getState().owner;

/* ── "Is my work actually in my account?" ───────────────── */

/**
 * The one question this whole file exists to answer, answered with a count
 * rather than with reassurance.
 *
 * A person asked to trust that their thesis is safe has no way to check. The
 * sidebar chip says "synced", which is a claim about the last round trip and
 * not about any particular document — so a push that has been failing for a
 * week looks exactly like one that has not, once the error has scrolled past.
 *
 * This reads the same ledger the pusher uses. A project counts as being in the
 * account only when the version this browser last agreed on with the server is
 * the version it holds now. Anything else is *here and nowhere else*, and is
 * named, because "3 of 47" is a fact somebody can act on and "mostly synced"
 * is not.
 */
export interface Coverage {
  total: number;
  inAccount: number;
  /** Projects this browser is the only copy of, newest first. */
  onlyHere: Array<{ id: string; name: string; updatedAt: number }>;
}

export function coverage(): Coverage {
  const projects = useProjects.getState().projects;
  const { synced } = useMemory.getState();
  const onlyHere = projects
    .filter((p) => synced[p.id] !== p.updatedAt)
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    total: projects.length,
    inAccount: projects.length - onlyHere.length,
    onlyHere,
  };
}

/** The same, as a hook, so a panel re-renders as work lands. */
export function useCoverage(): Coverage {
  const projects = useProjects((s) => s.projects);
  const synced = useMemory((s) => s.synced);
  const onlyHere = projects
    .filter((p) => synced[p.id] !== p.updatedAt)
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    total: projects.length,
    inAccount: projects.length - onlyHere.length,
    onlyHere,
  };
}
