"use client";

/**
 * The database seam.
 *
 * Same shape as every other seam in this codebase: one interface, a local
 * implementation that works today, and a real one behind configuration. The
 * app never imports Supabase — it imports `getDatabase()`, which hands back
 * whichever backend is configured.
 *
 * Right now that is always the browser. `supabase.ts` is written and ready and
 * will be selected automatically the moment the two environment variables
 * exist; nothing in a component changes when it does.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FOUNDER, to switch this on:
 *   1. Create a Supabase project and run `supabase/schema.sql` against it.
 *   2. Turn on anonymous sign-ins (Authentication → Providers → Anonymous).
 *      This is what lets the free plan keep work without a login.
 *   3. Put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the
 *      environment, and `npm install @supabase/supabase-js`.
 *   4. Nothing else. `backendName()` will start saying "supabase".
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Project } from "../types";
import { STORAGE_KEYS } from "../persistence";
import { supabaseDatabase } from "./supabase";

/** A row as the sync layer sees it — the document plus what it needs to merge. */
export interface RemoteProject {
  id: string;
  name: string;
  kind: Project["kind"];
  /** The whole client-side project object. */
  content: Project;
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Session {
  userId: string;
  /**
   * True when this identity came from an anonymous sign-in — the free plan's
   * normal state. Claiming it with a real account keeps the same userId, so
   * everything made anonymously carries over.
   */
  anonymous: boolean;
}

export interface Database {
  readonly name: string;
  /** Whether this backend can actually run here. */
  isAvailable(): boolean;
  /**
   * Get a session, creating an anonymous one if there isn't one. Returns null
   * where the backend has no concept of identity.
   */
  session(): Promise<Session | null>;
  list(): Promise<RemoteProject[]>;
  get(id: string): Promise<RemoteProject | null>;
  /** Insert or update. The caller owns `revision`. */
  put(project: RemoteProject): Promise<void>;
  remove(id: string): Promise<void>;
  /** Turn an anonymous session into a real account, keeping the work. */
  claim(email: string): Promise<void>;
}

/* ── The local backend: what ships today ────────────────── */

/**
 * Not a stub. This is the real storage layer for anyone who never signs in,
 * and it is the reason the free plan can promise their work survives: it reads
 * and writes the same localStorage the app already persists to, so there is no
 * second copy to fall out of step.
 */
const localDatabase: Database = {
  name: "browser",
  isAvailable: () => typeof localStorage !== "undefined",

  async session() {
    return null; // No identity, by design. Nothing to log into.
  },

  async list() {
    const raw = localStorage.getItem(STORAGE_KEYS[0]);
    if (!raw) return [];
    try {
      const projects: Project[] = JSON.parse(raw)?.state?.projects ?? [];
      return projects.map(toRemote);
    } catch {
      return [];
    }
  },

  async get(id) {
    return (await this.list()).find((p) => p.id === id) ?? null;
  },

  async put() {
    // The zustand store already writes through to localStorage on every
    // change. A second writer here would race it and win sometimes, which is
    // the worst of both.
    throw new Error(
      "The browser backend is written by the project store, not through this interface.",
    );
  },

  async remove() {
    throw new Error(
      "The browser backend is written by the project store, not through this interface.",
    );
  },

  async claim() {
    throw new Error("There is nothing to claim without a server.");
  },
};

export const toRemote = (project: Project): RemoteProject => ({
  id: project.id,
  name: project.name,
  kind: project.kind,
  content: project,
  // Local documents have no revision counter; `updatedAt` is the only ordering
  // the client has, and it is the one sync will seed from.
  revision: 1,
  updatedAt: project.updatedAt,
  deletedAt: null,
});

/* ── Selection ──────────────────────────────────────────── */

let override: Database | null = null;

export function setDatabase(db: Database | null) {
  override = db;
}

/**
 * Whether a remote backend is configured. Read from `process.env` rather than
 * from a runtime probe so the answer is the same on the server and the client
 * and never depends on a network round trip.
 */
export const isRemoteConfigured = (): boolean =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

export function getDatabase(): Database {
  if (override) return override;
  // Configured and reachable wins; otherwise the browser, which is not a
  // fallback but the real storage layer for anyone who never signs in.
  return supabaseDatabase.isAvailable() ? supabaseDatabase : localDatabase;
}

export const backendName = (): string => getDatabase().name;

/**
 * What the UI should tell someone about where their work lives. One sentence,
 * derived from the actual backend rather than from a marketing claim.
 */
export function storageStory(): string {
  return isRemoteConfigured()
    ? "Synced to your account, and kept in this browser so it works offline."
    : "Kept in this browser. There is no account yet, and nothing is uploaded.";
}
