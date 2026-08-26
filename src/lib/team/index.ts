"use client";

/**
 * The workspace store: knowledge and files, plus who is really here.
 *
 * Kept apart from documents and from chat because it has a different lifetime
 * and a different audience — this is what a *new* person would need in order to
 * be useful, and it's what the AI is handed so its answers know who's who.
 *
 * Two halves with two very different lifetimes. Knowledge and files are local
 * and persisted: you wrote them, they are yours, and they survive a reload.
 * *People* are neither — they are read from the database on demand and thrown
 * away with the tab, because a name, a role and a membership all belong to
 * somebody else and a cached copy of any of them is a fact this app has no
 * right to keep asserting.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { useEffect, useSyncExternalStore } from "react";
import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { AI_PERSON } from "../chat/seed";
import { initialsFor } from "../auth";
import { explainAuthErrorLine } from "../auth/errors";
import { useAuth } from "../auth/store";
import { listFriends, type Friend } from "../social";
import { listMembers, type Outcome, type TeamMember } from "./invites";
import type { Collaborator } from "../types";
import { SEED_FILES, SEED_KNOWLEDGE, SEED_WORKSPACE } from "./seed";
import { can, type Action } from "./permissions";
import type {
  KnowledgeEntry,
  KnowledgeKind,
  Member,
  TeamFile,
  Workspace,
} from "./types";

export * from "./types";
export {
  can,
  assignableRoles,
  ROLE_LABELS,
  ROLE_HINTS,
  type Action,
} from "./permissions";

/* ── The people who are really here ──────────────────── */

/**
 * What to call somebody whose profile carries no name.
 *
 * The same words `components/social/Friends` prints, deliberately: a direct
 * message is titled from whatever names the person, and the picker treats
 * this exact string as a placeholder it may overwrite once they set a name.
 * If one of the two is reworded the other has to follow, or that title
 * freezes.
 */
export const NO_NAME = "no name yet";

/**
 * Names the app has actually read, and the roster it read them from.
 *
 * Not persisted, and that is the point: this is an *answer*, not a
 * preference. A name is somebody else's to change, and a copy of it in this
 * browser's storage would go on printing last year's name — or a name from
 * the account that was signed in before this one — with nothing to correct
 * it. Same reasoning as the member count in `lib/scope`.
 *
 * An id that is absent has never been read; an id mapped to `null` belongs to
 * somebody real who has not set a name. The two are different facts and the
 * second one is not "Unknown".
 */
interface PeopleState {
  names: Record<string, string | null>;
  /** The workspace roster, or the reason there isn't one. Null: not asked. */
  roster: Outcome<TeamMember[]> | null;
  /** The connections. Null: not asked yet. */
  friends: Outcome<Friend[]> | null;
  /** Which account the two above were read for. */
  account: string | null;
}

const usePeopleStore = create<PeopleState>()(() => ({
  names: {},
  roster: null,
  friends: null,
  account: null,
}));

let reading: Promise<void> | null = null;

/**
 * Read who is really here: the workspace roster, and this account's
 * connections.
 *
 * Both are needed and neither covers the other — a teammate is not
 * necessarily a friend, and the person you started a DM with is usually
 * neither in your workspace nor anywhere the chat store could look them up.
 *
 * Idempotent per account, and one read at a time: every chat surface calls
 * this on mount, and a channel switch must not put another pair of queries on
 * the wire. Signing in as somebody else *does* re-read, and clears first —
 * the previous account's names are exactly the wrong thing to leave on
 * screen.
 */
export async function syncPeople(): Promise<void> {
  const who = useAuth.getState().identity.id;
  const state = usePeopleStore.getState();
  if (state.account === who && state.roster) return;

  if (reading) {
    // One is already on the wire. Wait for it rather than adding a second —
    // and then check whose answer it was, because signing in while a read is
    // in flight would otherwise leave the new account never read at all.
    await reading;
    if (usePeopleStore.getState().account === useAuth.getState().identity.id)
      return;
    return syncPeople();
  }

  if (state.account !== who)
    usePeopleStore.setState({ names: {}, roster: null, friends: null, account: who });

  reading = (async () => {
    try {
      const [roster, friends] = await Promise.all([listMembers(), listFriends()]);
      const names: Record<string, string | null> = {};
      if (roster.ok)
        for (const member of roster.value) names[member.userId] = member.displayName;
      // Friends second: the same person can be both, and a connection's
      // profile is the one this account is certain it may read.
      if (friends.ok)
        for (const friend of friends.value) names[friend.userId] = friend.displayName;
      usePeopleStore.setState({ names, roster, friends, account: who });
    } catch (error) {
      // This runs from `hydrateTeam` on every page, so a throw here would be
      // an unhandled rejection on load. Both halves get the same sentence
      // because a network that dropped took both of them with it.
      const failure = { ok: false as const, reason: explainAuthErrorLine(error) };
      usePeopleStore.setState({
        names: {},
        roster: failure,
        friends: failure,
        account: who,
      });
    }
  })().finally(() => {
    reading = null;
  });

  return reading;
}

/**
 * The directory, and a nudge to fill it.
 *
 * A hook rather than a plain read so that a component re-renders when the
 * answer lands — the whole failure this replaces was a name that was known
 * and not shown. `useAuth`'s id is a dependency because signing in as
 * somebody else changes every answer here.
 */
export function usePeople(): PeopleState {
  const who = useAuth((s) => s.identity.id);
  useEffect(() => {
    void syncPeople();
  }, [who]);
  return usePeopleStore();
}

/**
 * The person behind an account id, or null when this browser has never read
 * one — a plain read, for the callers that cannot hold a hook: a store
 * action, a context builder, `collaboratorById` under a comment pin.
 *
 * Null is "never heard of them", which is the only case that deserves
 * "Unknown". Somebody real who has not set a name is a different answer and
 * gets one.
 */
export function knownPerson(id: string): Collaborator | null {
  const names = usePeopleStore.getState().names;
  if (!(id in names)) return null;
  const name = names[id]?.trim() || null;
  return {
    id,
    name: name ?? NO_NAME,
    // A real person gets their own initials and no colour of our own: there
    // is no such column on a profile, and one derived from a hash of an id is
    // decoration pretending to be identity.
    initials: name ? initialsFor(name) : "··",
    color: "#8a8a8a",
  };
}

/** The workspace roster the database gave us, or null when it could not be
 *  asked. Length is the only member count this app is entitled to state. */
export function realRoster(): TeamMember[] | null {
  const roster = usePeopleStore.getState().roster;
  return roster?.ok ? roster.value : null;
}

/** Everyone the app can resolve to a face without asking anybody: you, and
 *  the assistant. Everyone else is a real account, resolved through
 *  `knownPerson`. */
const DIRECTORY: Collaborator[] = [LOCAL_USER, AI_PERSON];

export const collaboratorById = (id: string): Collaborator =>
  DIRECTORY.find((p) => p.id === id) ??
  knownPerson(id) ?? {
    id,
    // Members filed under `invite:address` were written by the invite
    // simulation that used to live in this file. Nothing creates them any
    // more; browsers that ran it still hold them, and the address is the only
    // thing it ever knew about that person.
    name: id.startsWith("invite:") ? id.slice(7) : "Unknown",
    initials: "??",
    color: "#8a8a8a",
  };

interface TeamState {
  workspace: Workspace;
  knowledge: KnowledgeEntry[];
  files: TeamFile[];

  /* Workspace */
  renameWorkspace: (name: string) => void;
  setContext: (patch: Partial<NonNullable<Workspace["context"]>>) => void;

  /*
   * No members and no invites.
   *
   * Both used to be here — `invite()` minted a token nothing ever sent,
   * `acceptInvite()` simulated the invitee following it, and `setRole`,
   * `updateMember` and `removeMember` edited the result. Real invites live in
   * `lib/team/invites` against the database, and real membership is read from
   * it; the copies here had no callers left and could only ever disagree with
   * the row that decides what somebody may actually do.
   *
   * `workspace.members` stays because a workspace of one is still a
   * workspace, and `lib/scope` still falls back to it when there is no
   * database to ask.
   */

  /* Knowledge */
  remember: (
    entry: Omit<KnowledgeEntry, "id" | "createdAt">,
  ) => KnowledgeEntry;
  confirmKnowledge: (id: string) => void;
  updateKnowledge: (id: string, patch: Partial<KnowledgeEntry>) => void;
  forget: (id: string) => void;

  /* Files */
  addFile: (file: TeamFile) => void;
  removeFile: (id: string) => void;
  toggleFileMuted: (id: string) => void;

  resetTeam: () => void;
}

export const useTeam = create<TeamState>()(
  persist(
    (set) => ({
      workspace: SEED_WORKSPACE,
      knowledge: SEED_KNOWLEDGE,
      files: SEED_FILES,

      renameWorkspace: (name) =>
        set((s) => ({ workspace: { ...s.workspace, name } })),

      setContext: (patch) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            context: { ...s.workspace.context, ...patch },
          },
        })),

      remember: (entry) => {
        const created: KnowledgeEntry = {
          ...entry,
          id: uid(),
          createdAt: Date.now(),
        };
        set((s) => ({ knowledge: [...s.knowledge, created] }));
        return created;
      },

      confirmKnowledge: (id) =>
        set((s) => ({
          knowledge: s.knowledge.map((k) =>
            k.id === id ? { ...k, confirmed: true, addedBy: LOCAL_USER.id } : k,
          ),
        })),

      updateKnowledge: (id, patch) =>
        set((s) => ({
          knowledge: s.knowledge.map((k) =>
            k.id === id ? { ...k, ...patch } : k,
          ),
        })),

      forget: (id) =>
        set((s) => ({ knowledge: s.knowledge.filter((k) => k.id !== id) })),

      addFile: (file) => set((s) => ({ files: [...s.files, file] })),

      removeFile: (id) =>
        set((s) => ({ files: s.files.filter((f) => f.id !== id) })),

      toggleFileMuted: (id) =>
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, muted: !f.muted } : f,
          ),
        })),

      resetTeam: () =>
        set({
          workspace: SEED_WORKSPACE,
          knowledge: SEED_KNOWLEDGE,
          files: SEED_FILES,
        }),
    }),
    {
      ...versioned<TeamState>("assignments:team:v1", []),
      partialize: (s) => ({
        workspace: s.workspace,
        knowledge: s.knowledge,
        files: s.files,
      }),
      skipHydration: true,
    },
  ),
);

/* ── Helpers ────────────────────────────────────────────── */

/** The signed-in user's membership, if any. */
export function useMyMembership(): Member | undefined {
  return useTeam((s) => s.workspace.members.find((m) => m.id === LOCAL_USER.id));
}

/** Gate a UI affordance on the current user's role. */
export function useCan(action: Action): boolean {
  const role = useTeam(
    (s) => s.workspace.members.find((m) => m.id === LOCAL_USER.id)?.role,
  );
  return can(role, action);
}

export const KNOWLEDGE_LABELS: Record<KnowledgeKind, string> = {
  org: "Organisation",
  person: "Person",
  term: "Terminology",
  convention: "Convention",
  deadline: "Deadline",
  fact: "Fact",
};

let rehydrateRequested = false;

/**
 * Ask the persisted workspace to load, once.
 *
 * Idempotent and callable from anywhere. It used to happen only when the
 * Team page mounted, which left every *other* reader of this store — the
 * scope switch deciding whether a team exists, above all — looking at the
 * seed workspace until somebody happened to visit /team.
 */
export function hydrateTeam() {
  if (rehydrateRequested) return;
  rehydrateRequested = true;
  void useTeam.persist.rehydrate();
  // Who is really here is asked at the same moment, and from the same one
  // place, so that a board comment or an assistant answer can name a
  // teammate without a chat surface having been opened first.
  void syncPeople();
}

export function useTeamHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (cb) => useTeam.persist.onFinishHydration(cb),
    () => useTeam.persist.hasHydrated(),
    () => false,
  );
  useEffect(hydrateTeam, []);
  return hydrated;
}
