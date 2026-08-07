"use client";

/**
 * The workspace store: members, invites, knowledge and files.
 *
 * Kept apart from documents and from chat because it has a different lifetime
 * and a different audience — this is what a *new* person would need in order to
 * be useful, and it's what the AI is handed so its answers know who's who.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { useEffect, useSyncExternalStore } from "react";
import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { PEERS } from "../realtime/mock";
import { AI_PERSON } from "../chat/seed";
import type { Collaborator } from "../types";
import { SEED_FILES, SEED_KNOWLEDGE, SEED_WORKSPACE } from "./seed";
import { can, type Action } from "./permissions";
import type {
  Invite,
  KnowledgeEntry,
  KnowledgeKind,
  Member,
  Role,
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

/** Everyone the app can resolve to a face. */
const DIRECTORY: Collaborator[] = [LOCAL_USER, ...PEERS, AI_PERSON];

export const collaboratorById = (id: string): Collaborator =>
  DIRECTORY.find((p) => p.id === id) ?? {
    id,
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

  /* Members & invites */
  setRole: (memberId: string, role: Role) => void;
  updateMember: (memberId: string, patch: Partial<Member>) => void;
  removeMember: (memberId: string) => void;
  invite: (email: string, role: Role) => Invite | null;
  revokeInvite: (inviteId: string) => void;
  /** Simulates the invitee following the link. */
  acceptInvite: (inviteId: string) => void;

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
    (set, get) => ({
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

      setRole: (memberId, role) =>
        set((s) => {
          const members = s.workspace.members.map((m) =>
            m.id === memberId ? { ...m, role } : m,
          );
          // A workspace with no owner can never be administered again.
          if (!members.some((m) => m.role === "owner")) return s;
          return { workspace: { ...s.workspace, members } };
        }),

      updateMember: (memberId, patch) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            members: s.workspace.members.map((m) =>
              m.id === memberId ? { ...m, ...patch } : m,
            ),
          },
        })),

      removeMember: (memberId) =>
        set((s) => {
          const members = s.workspace.members.filter((m) => m.id !== memberId);
          if (!members.some((m) => m.role === "owner")) return s;
          return { workspace: { ...s.workspace, members } };
        }),

      invite: (email, role) => {
        const address = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;

        const { workspace } = get();
        const already =
          workspace.members.some((m) => m.email?.toLowerCase() === address) ||
          workspace.invites.some(
            (i) => i.email.toLowerCase() === address && i.status === "pending",
          );
        if (already) return null;

        const created: Invite = {
          id: uid(),
          email: address,
          role,
          invitedBy: LOCAL_USER.id,
          createdAt: Date.now(),
          status: "pending",
          token: uid() + uid(),
        };
        set((s) => ({
          workspace: { ...s.workspace, invites: [...s.workspace.invites, created] },
        }));
        return created;
      },

      revokeInvite: (inviteId) =>
        set((s) => ({
          workspace: {
            ...s.workspace,
            invites: s.workspace.invites.map((i) =>
              i.id === inviteId ? { ...i, status: "revoked" } : i,
            ),
          },
        })),

      acceptInvite: (inviteId) =>
        set((s) => {
          const found = s.workspace.invites.find((i) => i.id === inviteId);
          if (!found || found.status !== "pending") return s;
          const member: Member = {
            // Invitees have no collaborator record until a real backend
            // creates one; the address is the identity meanwhile.
            id: `invite:${found.email}`,
            role: found.role,
            joinedAt: Date.now(),
            email: found.email,
          };
          return {
            workspace: {
              ...s.workspace,
              members: [...s.workspace.members, member],
              invites: s.workspace.invites.map((i) =>
                i.id === inviteId ? { ...i, status: "accepted" } : i,
              ),
            },
          };
        }),

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

export function useTeamHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (cb) => useTeam.persist.onFinishHydration(cb),
    () => useTeam.persist.hasHydrated(),
    () => false,
  );
  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useTeam.persist.rehydrate();
  }, []);
  return hydrated;
}
