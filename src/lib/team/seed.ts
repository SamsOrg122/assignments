/**
 * First-run workspace. Fixed ids and timestamps, same reasoning as elsewhere:
 * the server render and the first client render must agree.
 */

import { LOCAL_USER } from "../realtime";
import type { KnowledgeEntry, TeamFile, Workspace } from "./types";

const T = 1767225600000; // 2026-01-01T00:00:00Z

/**
 * A workspace of one: you.
 *
 * The department, the supervisor and the two teammates that used to live here
 * described a university project that isn't yours. Everything they enabled —
 * roles, invites, the assistant reading team context — works exactly the same
 * with one member, and fills in for real the moment you invite somebody.
 */
export const SEED_WORKSPACE: Workspace = {
  id: "w_local",
  name: "My workspace",
  kind: "personal",
  members: [
    {
      id: LOCAL_USER.id,
      role: "owner",
      joinedAt: T,
    },
  ],
  invites: [],
};

/** Nothing is known about you until you say it, or the assistant infers it. */
export const SEED_KNOWLEDGE: KnowledgeEntry[] = [];

/** No files until you add one. */
export const SEED_FILES: TeamFile[] = [];
