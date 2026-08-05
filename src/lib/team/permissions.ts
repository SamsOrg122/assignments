/**
 * Permissions.
 *
 * One table, one comparison. Every gate in the app calls `can()`, so there is
 * exactly one place to audit and no chance of two screens disagreeing about
 * what a commenter may do.
 */

import { ROLE_ORDER, type Role } from "./types";

export type Action =
  | "view"
  | "comment"
  | "edit"
  | "share"
  | "manageMembers"
  | "manageWorkspace"
  | "deleteWorkspace";

/** The least capable role that may perform each action. */
const REQUIRED: Record<Action, Role> = {
  view: "viewer",
  comment: "commenter",
  edit: "editor",
  share: "editor",
  manageMembers: "admin",
  manageWorkspace: "admin",
  deleteWorkspace: "owner",
};

const rank = (role: Role) => ROLE_ORDER.indexOf(role);

export function can(role: Role | undefined, action: Action): boolean {
  if (!role) return false;
  // Lower index = more capable, so "at least" is `<=`.
  return rank(role) <= rank(REQUIRED[action]);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

export const ROLE_HINTS: Record<Role, string> = {
  owner: "Full control, including deleting the workspace",
  admin: "Manage members, invites and workspace context",
  editor: "Create and edit projects",
  commenter: "Read everything, leave comments and chat",
  viewer: "Read only",
};

/**
 * Roles a given role may hand out. Nobody can promote someone above
 * themselves, and only an owner can mint another owner.
 */
export function assignableRoles(actor: Role | undefined): Role[] {
  if (!actor) return [];
  if (actor === "owner") return ROLE_ORDER;
  if (actor === "admin") return ROLE_ORDER.filter((r) => r !== "owner");
  return [];
}
