"use client";

/**
 * Which hat you are wearing: your own things, or the team's.
 *
 * One switch, obeyed everywhere it matters — the agenda shows your calendar
 * or the team's, the sidebar shows your chats or the team's channels. A
 * single global rather than a per-page filter, because the question "whose
 * stuff am I looking at" should have one answer at a time; a calendar in
 * team mode next to a chat list in personal mode is how somebody posts the
 * wrong thing in the wrong place.
 *
 * Persisted, so the app opens wearing the hat it was closed in.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "./persistence/versioned";
import { useTeam } from "./team";

export type Scope = "personal" | "team";

interface ScopeState {
  scope: Scope;
  setScope: (scope: Scope) => void;
}

export const useScope = create<ScopeState>()(
  persist(
    (set) => ({
      scope: "personal",
      setScope: (scope) => set({ scope }),
    }),
    {
      ...versioned<ScopeState>("assignments:scope:v1", []),
      partialize: (s) => ({ scope: s.scope }),
      skipHydration: true,
    },
  ),
);

export function hydrateScope() {
  void useScope.persist.rehydrate();
}

/**
 * Whether there is a team to switch to at all.
 *
 * "A team" means more than just you, or a workspace somebody deliberately
 * made into one — the seeded solo workspace everybody starts with is not a
 * team, and showing it as one would put an empty team agenda and an empty
 * member list behind the switch, which reads as broken rather than as new.
 */
export function useHasTeam(): boolean {
  return useTeam(
    (s) =>
      s.workspace.members.length > 1 ||
      s.workspace.invites.length > 0 ||
      s.workspace.kind !== "personal",
  );
}
