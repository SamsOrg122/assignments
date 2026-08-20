"use client";

/**
 * The Supabase backend.
 *
 * Written against `supabase/schema.sql`. It switches itself on when the two
 * public environment variables are present and reports unavailable otherwise —
 * one place that knows, rather than `if (supabase)` spread through the app.
 *
 * The anonymous path is the interesting one. Supabase's anonymous sign-in
 * issues a real `auth.users` row with no email, so every policy in the schema
 * works unchanged for someone who never signed up — which is exactly what the
 * free plan needs. `claim()` upgrades that same user with an email, so the
 * work made before signing up is already theirs and nothing has to be
 * migrated.
 *
 * Every method here fails loudly rather than silently returning empty. A sync
 * layer that quietly reports "no projects" when the network is down is how a
 * local copy gets overwritten with nothing.
 */

import { supabase } from "./client";
import type { Database, RemoteProject, Session } from "./index";

/** The row shape `schema.sql` produces, before it is mapped to the app's. */
interface ProjectRow {
  id: string;
  workspace_id: string;
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
  /*
   * When the *document* was last edited, not when the row was last written.
   *
   * These differ by however long the push took, and the gap is not harmless:
   * sync compares this against the local project's `updatedAt`, so taking the
   * row's timestamp makes every push look newer than the copy it came from.
   * The client then adopts its own document back, which counts as a change,
   * which schedules another push — a loop that never settles and rewrites the
   * row forever. `content.updatedAt` is the same clock the local copy uses.
   */
  updatedAt: row.content?.updatedAt ?? Date.parse(row.updated_at),
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
  deleted_at: null;
} => ({
  id: project.id,
  workspace_id: workspaceId,
  owner_id: ownerId,
  name: project.name,
  kind: project.kind,
  content: project.content,
  revision: project.revision,
  // Writing a project un-deletes it. Editing something on one machine after
  // deleting it on another is a decision to keep it, and the alternative is an
  // upsert that leaves the tombstone in place so the edit is thrown away on
  // the next pull.
  deleted_at: null,
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
 * A workspace to hang projects off.
 *
 * The schema requires one, and someone who never signs up still needs
 * somewhere for their work to live — so the first call creates a personal
 * workspace for the anonymous user and every later call finds it.
 *
 * Keyed by owner, not cached in a single variable. Two people share a laptop
 * more often than anyone designing this remembers: sign out, sign in as
 * somebody else, and a cache that survived the switch would file the second
 * person's documents into the first person's workspace — where the first
 * person can read them, because they own it. The identity is part of the
 * question, so it is part of the key.
 *
 * The values are *promises*, because the second caller is the one that
 * matters. The admin console asks five questions at once; with a
 * resolved-value cache all five miss it, all five find no workspace, and all
 * five create one — leaving somebody with five workspaces, four of them empty,
 * and their documents scattered between them. Caching the in-flight promise
 * makes the second caller wait for the first answer instead of racing it.
 */
const workspaces = new Map<string, Promise<string>>();

function ensureWorkspace(
  client: NonNullable<ReturnType<typeof supabase>>,
  ownerId: string,
): Promise<string> {
  const known = workspaces.get(ownerId);
  if (known) return known;
  const pending = findOrCreateWorkspace(client, ownerId).catch((error) => {
    // A failed lookup must not be remembered as the answer, or every later
    // call in this tab fails with it.
    workspaces.delete(ownerId);
    throw error;
  });
  workspaces.set(ownerId, pending);
  return pending;
}

async function findOrCreateWorkspace(
  client: NonNullable<ReturnType<typeof supabase>>,
  ownerId: string,
) {
  const existing = await client
    .from("workspaces")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.id as string;

  const created = await client
    .from("workspaces")
    .insert({ owner_id: ownerId, name: "My workspace" })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data.id as string;
}

/**
 * The workspace everything of this person's hangs off, creating it if needed.
 *
 * Exported for the administration surfaces, which have to ask "which
 * workspace?" before they can ask anything else. Same cache, same rules — a
 * second lookup would be a second answer waiting to disagree with this one.
 */
export async function currentWorkspaceId(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const session = await supabaseDatabase.session();
  if (!session) return null;
  return ensureWorkspace(client, session.userId);
}

/**
 * The team's workspace, if this account is in one: a workspace someone else
 * owns that lists me as a member. A team-scoped project is written under it,
 * which is the entire mechanism by which teammates see each other's team
 * documents — `projects_member` in schema.sql does the rest.
 *
 * Null when there is no such workspace, and the caller falls back to the
 * personal one: a project marked "team" before a team exists stays safely
 * yours, and moves over on its next edit after joining.
 *
 * Same promise-cache discipline as `workspaces` above, keyed by owner.
 */
const teamWorkspaces = new Map<string, Promise<string | null>>();

function teamWorkspaceId(
  client: NonNullable<ReturnType<typeof supabase>>,
  ownerId: string,
): Promise<string | null> {
  const known = teamWorkspaces.get(ownerId);
  if (known) return known;
  const pending = (async () => {
    const found = await client
      .from("workspaces")
      .select("id")
      .neq("owner_id", ownerId)
      .limit(1)
      .maybeSingle();
    if (found.error) throw new Error(found.error.message);
    return found.data ? (found.data.id as string) : null;
  })().catch((error) => {
    teamWorkspaces.delete(ownerId);
    throw error;
  });
  teamWorkspaces.set(ownerId, pending);
  return pending;
}

/** Own workspace id for read paths — same cache `put` uses, same session. */
async function ownWorkspaceForReads(
  client: NonNullable<ReturnType<typeof supabase>>,
): Promise<string | null> {
  const session = await supabaseDatabase.session();
  return session ? ensureWorkspace(client, session.userId) : null;
}

/**
 * The row's workspace is the truth about which world a project is in: a row
 * that lives under somebody else's workspace is the team's, whatever an
 * older client wrote into its content. A row under your own keeps whatever
 * the content says — including "team" chosen before the team existed.
 */
function stampScope(row: ProjectRow, own: string | null): RemoteProject {
  const project = rowToProject(row);
  if (!project.content || typeof project.content !== "object") return project;
  const scope =
    own && row.workspace_id !== own
      ? "team"
      : (project.content.scope ?? "personal");
  return { ...project, content: { ...project.content, scope } };
}

/** The anonymous sign-in currently in flight, if any. See `session()`. */
let signingIn: ReturnType<
  NonNullable<ReturnType<typeof supabase>>["auth"]["signInAnonymously"]
> | null = null;

/** The adapter. Every call maps one-for-one onto `supabase/schema.sql`. */
export const supabaseDatabase: Database = {
  name: "supabase",

  isAvailable: () => supabase() !== null,

  async session(): Promise<Session | null> {
    const client = supabase();
    if (!client) return null;

    const { data } = await client.auth.getSession();
    if (data.session?.user)
      return {
        userId: data.session.user.id,
        anonymous: !data.session.user.email,
      };

    // No session yet: sign in anonymously. This is the free plan's normal
    // state, not a fallback — see the note at the top.
    //
    // Shared between concurrent callers for the same reason the workspace
    // lookup is: five simultaneous calls would otherwise mint five anonymous
    // users, and the four that lose the race take their documents with them.
    signingIn ??= client.auth.signInAnonymously().finally(() => {
      signingIn = null;
    });
    const created = await signingIn;
    if (created.error) throw new Error(created.error.message);
    if (!created.data.user) throw new Error("Supabase returned no user.");

    // `on_auth_user_created` in schema.sql already made this row. Writing it
    // again costs one round trip and covers a project set up before that
    // trigger existed, where the alternative is a foreign key error on the
    // first save that reads like a permissions problem.
    await client
      .from("profiles")
      .upsert(
        { id: created.data.user.id, is_anonymous: true },
        { onConflict: "id", ignoreDuplicates: true },
      );

    return { userId: created.data.user.id, anonymous: true };
  },

  async list(): Promise<RemoteProject[]> {
    const client = supabase();
    if (!client) throw new Error("Supabase isn't configured.");
    // Soft-deleted rows come back too, carrying `deletedAt`.
    //
    // Filtering them out here would leave sync to infer a deletion from a row
    // being *absent*, and absence has more than one cause: a session that
    // changed, a policy that no longer matches, a project restored from a
    // backup. Every one of those would read as "deleted everywhere" and take
    // the local copy with it. A tombstone says what an absence only implies.
    const { data, error } = await client
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const own = await ownWorkspaceForReads(client);
    return (data ?? []).map((row) => stampScope(row, own));
  },

  async get(id: string): Promise<RemoteProject | null> {
    const client = supabase();
    if (!client) throw new Error("Supabase isn't configured.");
    const { data, error } = await client
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? stampScope(data, await ownWorkspaceForReads(client)) : null;
  },

  async put(project: RemoteProject): Promise<void> {
    const client = supabase();
    if (!client) throw new Error("Supabase isn't configured.");
    const session = await supabaseDatabase.session();
    if (!session) throw new Error("No session to write as.");
    const own = await ensureWorkspace(client, session.userId);
    // A team document lives under the team's workspace so every member sees
    // it. The row's id never changes, so moving a project between worlds is
    // the same upsert with a different workspace column — one row, one home.
    const workspace =
      project.content.scope === "team"
        ? ((await teamWorkspaceId(client, session.userId)) ?? own)
        : own;

    // Last-write-wins on `revision` until there is a CRDT. The store holds a
    // complete document, so a losing write costs one document rather than a
    // merge conflict — and `revision` makes that visible instead of silent.
    const { error } = await client
      .from("projects")
      .upsert(projectToRow(project, workspace, session.userId));
    if (error) throw new Error(error.message);
  },

  async remove(id: string): Promise<void> {
    const client = supabase();
    if (!client) throw new Error("Supabase isn't configured.");
    // Soft delete. A hard delete makes "restore" impossible and makes sync
    // between two devices ambiguous — the second device cannot tell "deleted"
    // from "never seen".
    const { error } = await client
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async claim(email: string): Promise<void> {
    const client = supabase();
    if (!client) throw new Error("Supabase isn't configured.");
    // Same user id comes out, so every project made anonymously is already
    // owned by the account this produces. Nothing is migrated.
    const { error } = await client.auth.updateUser({ email });
    if (error) throw new Error(error.message);
    const { data } = await client.auth.getUser();
    if (data.user)
      await client
        .from("profiles")
        .update({ is_anonymous: false })
        .eq("id", data.user.id);
  },
};
