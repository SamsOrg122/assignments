"use client";

/**
 * Administration.
 *
 * Four questions an organisation asks before it will put a year of work in
 * somebody else's product: who is in this, what have they done, how long is it
 * kept, and can I get rid of it. Everything here answers one of those against
 * the real database — there is no local imitation, and that is deliberate.
 *
 * The boundary is worth stating plainly because it is unusual for this app.
 * Every other feature works with no server at all; this one cannot. An audit
 * log of a browser is a log of one person's own actions, kept by that person,
 * deletable by that person — which is not an audit log, it is a diary. So with
 * no database configured, every call here comes back `setup: true` with a
 * sentence saying so, and the console shows that sentence instead of an empty
 * table that looks like nothing ever happened.
 *
 * The other limit, which the console also says out loud: this can only see
 * what reached the server. Work someone keeps in their own browser leaves no
 * entry here, because there is nothing to leave one.
 */

import { supabase } from "../db/client";
import { currentWorkspaceId } from "../db/supabase";
import { explainAuthErrorLine } from "../auth/errors";
import type { Role } from "../team/types";

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; setup?: boolean };

const NO_DATABASE = {
  ok: false as const,
  setup: true,
  reason:
    "Administration needs a database. Without one there is no shared workspace to administer — work stays in each person's browser, where only they can see it.",
};

const failed = (error: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: explainAuthErrorLine(error),
});

/* ── The audit log ──────────────────────────────────────── */

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  subject: string | null;
  detail: Record<string, unknown>;
  at: number;
}

/**
 * The actions worth recording.
 *
 * A short list on purpose, and only actions the app really writes. A log that
 * records every keystroke is one nobody reads; a *label* for an action nothing
 * ever performs is worse, because it implies coverage that isn't there. Roles
 * and invitations are missing from this list for exactly that reason — the
 * team page keeps them in the browser today, so there is nothing to record.
 */
export const AUDIT_LABELS: Record<string, string> = {
  "project.deleted": "deleted a project",
  "template.published": "published a template",
  "template.withdrawn": "withdrew a template",
  "retention.changed": "changed how long things are kept",
  "retention.purged": "ran the retention purge",
  "workspace.exported": "exported the whole workspace",
};

export const describeAudit = (entry: AuditEntry): string =>
  AUDIT_LABELS[entry.action] ?? entry.action.replace(/[._]/g, " ");

/**
 * Write an entry. Never throws, never blocks, never reports failure upwards.
 *
 * The deletion is the thing the user asked for; the log is bookkeeping. If
 * the insert fails because there is no database, or the network is down, or
 * the workspace has no membership row yet, the deletion still happened and
 * telling somebody their project was deleted *and* something went wrong would
 * be alarming about the wrong half.
 */
export async function record(
  action: keyof typeof AUDIT_LABELS | (string & {}),
  subject?: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const client = supabase();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const actor = data.session?.user.id;
    if (!actor) return;
    const workspace = await currentWorkspaceId();
    if (!workspace) return;
    await client.from("audit_log").insert({
      workspace_id: workspace,
      actor_id: actor,
      action,
      subject: subject?.slice(0, 300) ?? null,
      detail,
    });
  } catch {
    // Deliberately silent. See the note above.
  }
}

export async function fetchAudit(limit = 200): Promise<Outcome<AuditEntry[]>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data, error } = await client
      .from("audit_log")
      .select("id, actor_id, action, subject, detail, at")
      .eq("workspace_id", workspace)
      .order("at", { ascending: false })
      .limit(limit);
    if (error) return failed(error.message);
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: String(row.id),
        actorId: (row.actor_id as string | null) ?? null,
        action: String(row.action),
        subject: (row.subject as string | null) ?? null,
        detail: (row.detail ?? {}) as Record<string, unknown>,
        at: Date.parse(row.at as string) || Date.now(),
      })),
    };
  } catch (error) {
    return failed(error);
  }
}

/* ── Who is here ────────────────────────────────────────── */

export interface AdminMember {
  userId: string;
  role: Role;
  displayName: string | null;
  /**
   * Never signed up — the free plan's normal state, not a broken one.
   *
   * Null when the profile could not be read, which is a different fact and
   * must not be printed as this one. The embed comes back null both for
   * somebody really on a throwaway session AND when the profile is
   * unreadable — the ordinary state of a database that does not have
   * migration 0015's profiles policy yet, and every migration here is run by
   * hand — so defaulting to `true` told a whole real team that none of them
   * had accounts. The same three states as `TeamMember.anonymous`.
   */
  anonymous: boolean | null;
  joinedAt: number;
}

interface MemberRow {
  user_id: string;
  role: string;
  created_at: string;
  profiles: { display_name: string | null; is_anonymous: boolean } | null;
}

export async function fetchMembers(): Promise<Outcome<AdminMember[]>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data, error } = await client
      .from("workspace_members")
      .select("user_id, role, created_at, profiles(display_name, is_anonymous)")
      .eq("workspace_id", workspace);
    if (error) return failed(error.message);
    return {
      ok: true,
      value: (data as unknown as MemberRow[]).map((row) => ({
        userId: row.user_id,
        role: row.role as Role,
        displayName: row.profiles?.display_name ?? null,
        // `null`, not `true` — see the field. An unreadable profile is not
        // evidence that somebody never signed up.
        anonymous: row.profiles ? row.profiles.is_anonymous : null,
        joinedAt: Date.parse(row.created_at) || 0,
      })),
    };
  } catch (error) {
    return failed(error);
  }
}

/** What the signed-in person may do here, according to the database. */
export async function myRole(): Promise<Outcome<Role | null>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data: session } = await client.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return { ok: true, value: null };
    const { data, error } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace)
      .eq("user_id", me)
      .maybeSingle();
    if (error) return failed(error.message);
    return { ok: true, value: (data?.role as Role | undefined) ?? null };
  } catch (error) {
    return failed(error);
  }
}

/* ── Retention ──────────────────────────────────────────── */

/** Null means keep everything, and that stays the default. */
export async function retentionDays(): Promise<Outcome<number | null>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data, error } = await client
      .from("workspaces")
      .select("retention_days")
      .eq("id", workspace)
      .maybeSingle();
    if (error) return failed(error.message);
    return { ok: true, value: (data?.retention_days as number | null) ?? null };
  } catch (error) {
    return failed(error);
  }
}

export async function setRetentionDays(
  days: number | null,
): Promise<Outcome<number | null>> {
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650))
    return { ok: false, reason: "Pick between 1 and 3650 days, or keep everything." };
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { error } = await client
      .from("workspaces")
      .update({ retention_days: days })
      .eq("id", workspace);
    if (error) return failed(error.message);
    await record(
      "retention.changed",
      days === null ? "keep everything" : `${days} days`,
      { days },
    );
    return { ok: true, value: days };
  } catch (error) {
    return failed(error);
  }
}

export interface PurgeCount {
  projects: number;
  audit: number;
}

const countsFrom = (rows: { kind: string; doomed?: number; removed?: number }[]) => {
  const out: PurgeCount = { projects: 0, audit: 0 };
  for (const row of rows) {
    const n = Number(row.doomed ?? row.removed ?? 0);
    if (row.kind === "projects") out.projects = n;
    if (row.kind === "audit") out.audit = n;
  }
  return out;
};

/** What retention would remove if it ran now. Removes nothing. */
export async function previewPurge(): Promise<Outcome<PurgeCount>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data, error } = await client.rpc("purge_preview", { ws: workspace });
    if (error) return failed(error.message);
    return { ok: true, value: countsFrom(data ?? []) };
  } catch (error) {
    return failed(error);
  }
}

export async function runPurge(): Promise<Outcome<PurgeCount>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data, error } = await client.rpc("purge_expired", { ws: workspace });
    if (error) return failed(error.message);
    return { ok: true, value: countsFrom(data ?? []) };
  } catch (error) {
    return failed(error);
  }
}
