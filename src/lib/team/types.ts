/**
 * Team, roles, and the knowledge the AI accumulates about them.
 *
 * The through-line: a workspace isn't just a member list, it's *context*. Who
 * supervises whom, what the group calls things, which deadline matters — the
 * facts a new team member would need on day one. Those live here as structured
 * entries so the AI can be handed them, rather than being buried in chat where
 * nothing can read them.
 */

/**
 * Ordered from most to least capable. `>=` comparisons on the index are the
 * only permission maths in the app.
 */
export type Role = "owner" | "admin" | "editor" | "commenter" | "viewer";

export const ROLE_ORDER: Role[] = [
  "owner",
  "admin",
  "editor",
  "commenter",
  "viewer",
];

export interface Member {
  /** Matches a Collaborator id, so presence and chat resolve to one person. */
  id: string;
  role: Role;
  joinedAt: number;
  /** What they do here — "Supervisor", "PhD candidate", "Head of design". */
  title?: string;
  email?: string;
  /** Free text the AI can use: expertise, availability, preferences. */
  about?: string;
}

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface Invite {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: number;
  status: InviteStatus;
  /** Opaque token that would be embedded in the invite link. */
  token: string;
}

export type WorkspaceKind = "school" | "company" | "personal";

export interface Workspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  /** Institution, course, or company — context every answer should assume. */
  context?: {
    /** "TU Delft" or "Northwind Ltd". */
    organisation?: string;
    /** "MSc Human–Computer Interaction" or "Product". */
    unit?: string;
    /** Course code, project name, or team remit. */
    subject?: string;
    /** Anything else worth knowing. */
    notes?: string;
  };
  members: Member[];
  invites: Invite[];
}

/* ── Knowledge ──────────────────────────────────────────── */

export type KnowledgeKind =
  | "org"
  | "person"
  | "term"
  | "convention"
  | "deadline"
  | "fact";

export type KnowledgeSource = "manual" | "file" | "chat" | "ai";

/**
 * One thing the workspace knows.
 *
 * `confirmed` is the important field: anything the AI inferred starts
 * unconfirmed and is clearly marked, because a workspace memory that quietly
 * accumulates wrong facts is worse than no memory at all.
 */
export interface KnowledgeEntry {
  id: string;
  kind: KnowledgeKind;
  /** What this is about — a person, a term, a deadline. */
  subject: string;
  body: string;
  source: KnowledgeSource;
  /** File id, message id, or project id this came from. */
  sourceRef?: string;
  createdAt: number;
  confirmed: boolean;
  /** Who added or confirmed it. */
  addedBy?: string;
}

/* ── Files ──────────────────────────────────────────────── */

export type FileStatus = "ready" | "unsupported" | "failed";

/**
 * A file the team handed to the AI. We keep the extracted *text*, not the
 * bytes: the text is what context is built from, and storing megabytes of
 * original in localStorage would blow the quota on the third upload.
 */
export interface TeamFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  text: string;
  status: FileStatus;
  /** Why it failed, or what was skipped. */
  note?: string;
  uploadedBy: string;
  at: number;
  /** Excluded from AI context without deleting it. */
  muted?: boolean;
}
