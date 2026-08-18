"use client";

/**
 * Which projects are being shared live.
 *
 * A session is not free. It holds an event stream open for as long as the
 * project is on screen, and a browser will only keep about six connections to
 * one origin over HTTP/1.1 — so a workspace that opened a session for every
 * project you looked at would, after six tabs, stop being able to load
 * anything at all. "Always on" was the wrong instinct.
 *
 * So the room is opened for exactly the projects you have handed someone an
 * edit link for. Persisted, because the intent outlives the tab: reloading the
 * page you shared must not quietly drop the person you shared it with.
 *
 * The guest side never consults this — arriving through an edit link *is* the
 * intent.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";

interface SharedState {
  /** Project ids with a live room open. */
  ids: string[];
  /**
   * Project ids somebody may be leaving notes on.
   *
   * A "can comment" link opens no room — the reader is not in a session — so
   * the only way the Library knows where to look afterwards is that the link
   * was made at all. Kept separately from `ids` because these two answer
   * different questions: one is "is a session open", the other is "is anybody
   * out there with a link".
   */
  awaiting: string[];
  /**
   * Project id → the note room that project's comment link uses.
   *
   * Kept because the room is a secret now rather than the project's own id:
   * the owner cannot derive it, only remember it. An id present in `awaiting`
   * with no entry here is a link made before this existed, and falls back to
   * the old room so those links keep working.
   */
  noteKeys: Record<string, string>;
  /**
   * Project id → the live session's room.
   *
   * Same reasoning as `noteKeys`, and the stakes are higher: the room used to
   * be the project id, so anybody ever sent a view link could join the session
   * and both read every keystroke and send their own. An id without an entry
   * here is from a link made before this, and falls back to the old room.
   */
  rooms: Record<string, string>;
  isShared: (projectId: string) => boolean;
  startSharing: (projectId: string, room?: string) => void;
  stopSharing: (projectId: string) => void;
  expectNotes: (projectId: string, noteKey?: string) => void;
  stopExpecting: (projectId: string) => void;
}

export const useShared = create<SharedState>()(
  persist(
    (set, get) => ({
      ids: [],
      awaiting: [],
      noteKeys: {},
      rooms: {},
      isShared: (projectId) => get().ids.includes(projectId),
      expectNotes: (projectId, noteKey) =>
        set((s) => ({
          awaiting: s.awaiting.includes(projectId)
            ? s.awaiting
            : [...s.awaiting, projectId],
          noteKeys: noteKey
            ? { ...s.noteKeys, [projectId]: noteKey }
            : s.noteKeys,
        })),
      stopExpecting: (projectId) =>
        set((s) => ({ awaiting: s.awaiting.filter((id) => id !== projectId) })),
      startSharing: (projectId, room) =>
        set((s) => ({
          ids: s.ids.includes(projectId) ? s.ids : [...s.ids, projectId],
          rooms: room ? { ...s.rooms, [projectId]: room } : s.rooms,
        })),
      stopSharing: (projectId) =>
        set((s) => ({ ids: s.ids.filter((id) => id !== projectId) })),
    }),
    {
      ...versioned<SharedState>("assignments:shared:v1", []),
      partialize: (s) => ({
        ids: s.ids,
        awaiting: s.awaiting,
        noteKeys: s.noteKeys,
        rooms: s.rooms,
      }),
      // Read at mount like every other store here, so the first client render
      // agrees with the server's.
      skipHydration: true,
    },
  ),
);

export function hydrateShared() {
  void useShared.persist.rehydrate();
}
