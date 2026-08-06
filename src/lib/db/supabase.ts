/**
 * The Supabase backend.
 *
 * Written against `supabase/schema.sql` and deliberately not wired up: the
 * client library is not a dependency yet, so this file describes the calls
 * rather than making them. That is a real distinction and it is marked in one
 * place — `isAvailable()` returns false — instead of being spread through the
 * app as `if (supabase)` checks.
 *
 * Turning it on is four steps, listed in `index.ts`. The only code change is
 * the import at the top of this file and deleting `NOT_WIRED`.
 *
 * The anonymous path is the interesting one. Supabase's anonymous sign-in
 * issues a real `auth.users` row with no email, so every policy in the schema
 * works unchanged for someone who never signed up — which is exactly what the
 * free plan needs. `claim()` upgrades that same user with an email, so the
 * work made before signing up is already theirs and nothing has to be
 * migrated.
 */

import type { Database, RemoteProject, Session } from "./index";

const NOT_WIRED =
  "Supabase isn't wired up yet. Install @supabase/supabase-js, set " +
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then follow " +
  "the note at the top of lib/db/index.ts.";

/** The row shape `schema.sql` produces, before it is mapped to the app's. */
interface ProjectRow {
  id: string;
  name: string;
  kind: RemoteProject["kind"];
  content: RemoteProject["content"];
  revision: number;
  updated_at: string;
  deleted_at: string | null;
}

export const rowToProject = (row: ProjectRow): RemoteProject => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  content: row.content,
  revision: row.revision,
  updatedAt: Date.parse(row.updated_at),
  deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
});

export const projectToRow = (
  project: RemoteProject,
  workspaceId: string,
  ownerId: string,
): Omit<ProjectRow, "updated_at" | "deleted_at"> & {
  workspace_id: string;
  owner_id: string;
  search_text: string;
} => ({
  id: project.id,
  workspace_id: workspaceId,
  owner_id: ownerId,
  name: project.name,
  kind: project.kind,
  content: project.content,
  revision: project.revision,
  // Flattened client-side on purpose — see the note in schema.sql. Extracting
  // prose from nested blocks in SQL would duplicate logic that already exists
  // in TypeScript and would drift from it.
  search_text: flatten(project),
});

function flatten(project: RemoteProject): string {
  const parts: string[] = [project.name];
  for (const block of project.content.blocks ?? []) {
    if (block.type === "text") parts.push(block.html.replace(/<[^>]+>/g, " "));
    else if (block.type === "slides")
      for (const slide of block.slides)
        parts.push(slide.title, ...slide.bullets);
    else if (block.type === "table")
      for (const row of block.rows)
        parts.push(Object.values(row.cells).filter(Boolean).join(" "));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 20_000);
}

/**
 * The adapter. Every method documents the query it will make, so the shape can
 * be reviewed against the schema before any of it runs against real data.
 */
export const supabaseDatabase: Database = {
  name: "supabase",

  // The single place that knows this isn't connected. Flip by deleting the
  // line below once the client is installed and configured.
  isAvailable: () => false,

  async session(): Promise<Session | null> {
    // const { data } = await client.auth.getSession();
    // if (data.session) return { userId: …, anonymous: !data.session.user.email };
    // const { data: created } = await client.auth.signInAnonymously();
    // return { userId: created.user!.id, anonymous: true };
    throw new Error(NOT_WIRED);
  },

  async list(): Promise<RemoteProject[]> {
    // client.from("projects").select("*").is("deleted_at", null)
    //       .order("updated_at", { ascending: false })
    throw new Error(NOT_WIRED);
  },

  async get(): Promise<RemoteProject | null> {
    // client.from("projects").select("*").eq("id", id).maybeSingle()
    throw new Error(NOT_WIRED);
  },

  async put(): Promise<void> {
    // client.from("projects").upsert(projectToRow(project, ws, owner))
    // Conflict handling is last-write-wins on `revision` until there is a
    // CRDT; the store already holds a complete document, so a losing write
    // costs one document rather than a merge conflict.
    throw new Error(NOT_WIRED);
  },

  async remove(): Promise<void> {
    // Soft delete: set deleted_at. Hard deletes make "restore" impossible and
    // make sync between two devices ambiguous — the second device cannot tell
    // "deleted" from "never seen".
    throw new Error(NOT_WIRED);
  },

  async claim(): Promise<void> {
    // client.auth.updateUser({ email }) — same user id, so every project made
    // anonymously is already owned by the account that comes out.
    throw new Error(NOT_WIRED);
  },
};
