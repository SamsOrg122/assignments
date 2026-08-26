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
import { countMembers } from "./team/invites";

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
 * How many people the database says are in this workspace.
 *
 * A separate, unpersisted store because it is an *answer*, not a preference:
 * caching it across reloads would mean somebody who was removed from a team
 * still saw the team world until the next successful query. Null means
 * nobody has asked yet, or the question could not be asked.
 */
interface RealTeamState {
  members: number | null;
  set: (members: number | null) => void;
}

const useRealTeam = create<RealTeamState>()((set) => ({
  members: null,
  set: (members) => set({ members }),
}));

/**
 * Ask the database how many people are really in the workspace.
 *
 * Called once from the shell. Everything below prefers this answer to the
 * local store, because the local store is what used to say "no team" to
 * somebody who had just accepted a real invitation.
 */
export async function countTeam(): Promise<void> {
  useRealTeam.getState().set(await countMembers());
}

/** The local store's answer. It is a fallback now, not the truth: nothing in
 *  the app writes `workspace.members` or `workspace.invites` any more, so on
 *  its own it says "no team" to everybody. `kind` is still a real local
 *  setting somebody can change, so it still counts. */
const localTeam = (w: {
  members: unknown[];
  invites: unknown[];
  kind: string;
}): boolean => w.members.length > 1 || w.invites.length > 0 || w.kind !== "personal";

/**
 * Whether there is a team to switch to at all.
 *
 * "A team" means more than just you, or a workspace somebody deliberately
 * made into one — the seeded solo workspace everybody starts with is not a
 * team, and showing it as one would put an empty team agenda and an empty
 * member list behind the switch, which reads as broken rather than as new.
 *
 * The database wins when it has answered. With no database, signed out, or on
 * a deployment where migration 0015 has not been run, it never answers, and
 * the local store keeps the app working the way it did before any of this.
 */
export function useHasTeam(): boolean {
  const real = useRealTeam((s) => s.members);
  const local = useTeam((s) => localTeam(s.workspace));
  return real === null ? local : real > 1;
}

/** The same answer outside a component. */
export function hasTeamNow(): boolean {
  const real = useRealTeam.getState().members;
  if (real !== null) return real > 1;
  return localTeam(useTeam.getState().workspace);
}

/**
 * The world things are born into right now: the chosen scope, downgraded to
 * personal when there is no team behind the switch — the same rule every
 * page applies before trusting the chosen value.
 */
export function currentWorld(): Scope {
  return hasTeamNow() ? useScope.getState().scope : "personal";
}

/**
 * The world to filter on, inside a component.
 *
 * Exists because every page needs it and each of them wrote the same
 * expression out by hand — and the library's due-soon strip wrote it wrong,
 * filtering on the stored value and going silently empty for anybody whose
 * stored value said "team" while they had none. One expression, one place.
 */
export function useWorld(): Scope {
  const chosen = useScope((s) => s.scope);
  return useHasTeam() ? chosen : "personal";
}

/**
 * Forget a team world that is no longer there.
 *
 * The switch only renders once there is a team, so a stored "team" with no
 * team behind it is a value nobody can reach a control for. It is ordinary to
 * arrive in: flip the switch to look at what a team would be, leave it, and
 * the setting outlives the reason for it. Left alone it makes the library's
 * "no team yet" panel a permanent notice that cannot be dismissed.
 *
 * Called after both stores have rehydrated — zustand's `rehydrate()` against
 * localStorage is synchronous, so "the line after" is enough, and this must
 * not run before the team store has loaded or it would reset the scope of
 * everybody who does have a team.
 */
export function settleScope() {
  if (!hasTeamNow() && useScope.getState().scope !== "personal")
    useScope.setState({ scope: "personal" });
}
