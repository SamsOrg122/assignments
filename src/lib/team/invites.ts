"use client";

/**
 * Team invite links.
 *
 * One link, handed to whoever should be in the workspace. It is an *open*
 * link: it is not addressed to an email and it does not know who will follow
 * it. That is the decision, not an omission — an invite gets pasted into a
 * group chat, forwarded, and read on a phone that is signed in as somebody
 * the sender never typed. Everything that would normally be enforced by
 * "only this address may use it" is enforced instead by the two things that
 * survive a forward: an expiry, and a revocation that takes effect the moment
 * it is pressed.
 *
 * The token is never stored. The row carries only its SHA-256, so the token
 * exists exactly once in the world: in the link. Nobody with the database —
 * including whoever runs it — can reconstruct a working link from a row, and
 * a leaked backup is a list of hashes. The cost, which the UI has to say out
 * loud rather than hide: a link cannot be shown a second time. `listInvites`
 * can tell you an invite exists, when it dies and how often it has been used,
 * and it cannot tell you what to paste. Lost link, new link.
 *
 * The token travels in the URL *path*, and never in a query string. A
 * fragment would have been better on paper — browsers do not send one to a
 * server, so it would stay out of access logs entirely — but a fragment does
 * not survive the trip: mail clients and chat apps rewrite links, several
 * drop everything after the "#", and a link that arrives without its token is
 * not private, it is broken. A query string is the one form that is genuinely
 * worse than the path, because `?t=` is fetched by every unfurler the message
 * passes through, and a use burned by a chat app drawing a thumbnail is a use
 * nobody can explain. `max_uses` on a team link is normally unlimited, which
 * is what keeps that from being a live problem either way.
 *
 * `Outcome<T>` is `lib/admin`'s, including its `setup: true` flag for "this
 * deployment has no database" as distinct from "the question failed". A
 * second identical result type here would only be somewhere for the two to
 * disagree.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../db/client";
import { currentWorkspaceId } from "../db/supabase";
import { explainAuthErrorLine } from "../auth/errors";
import { useAuth } from "../auth/store";
import { useRemoteConfigSettled } from "../db/use-config";
import type { Outcome } from "../admin";
import { can } from "./permissions";
import type { Role } from "./types";

export type { Outcome } from "../admin";

const NO_DATABASE = {
  ok: false as const,
  setup: true,
  reason:
    "Invite links need the account database, and this deployment has none. Without one there is no shared workspace to join — everyone's work stays in their own browser.",
};

const failed = (error: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: explainAuthErrorLine(error),
});

/**
 * The longest an invite link may live.
 *
 * Three months, because a link that is good for a year is not really expiring
 * — it is a permanent door with a date on it, still live in a group chat
 * nobody reads any more. Ninety days is long enough to cover a term or a
 * hiring round and short enough that forgetting about a link is survivable.
 */
export const MAX_DAYS = 90;

/* ── Tokens ─────────────────────────────────────────────── */

/** A team invite. */
export const TEAM_PREFIX = "t_";
/** A friend link. Same minting, same hashing, different table. */
export const FRIEND_PREFIX = "f_";

export type LinkKind = "team" | "friend";

/**
 * Which kind of link this token opens.
 *
 * One `/join` page serves both, and the prefix is how it knows which without
 * asking the database twice — a wrong guess would mean two RPC calls, the
 * first of which refuses, and a refusal in the network log for every friend
 * link anybody ever accepts.
 *
 * Three answers: `"team"`, `"friend"`, or `null` for anything that is not one
 * of ours — a truncated paste, an empty fragment, a link from another app.
 */
export function tokenKind(token: string): LinkKind | null {
  if (token.startsWith(TEAM_PREFIX)) return "team";
  if (token.startsWith(FRIEND_PREFIX)) return "friend";
  return null;
}

const base64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * A new token: 32 random bytes from the OS, base64url, prefixed.
 *
 * 256 bits because the row is looked up *by* this value and there is no rate
 * limit in front of a Postgres function — the only thing stopping somebody
 * walking the token space is that it cannot be walked. `getRandomValues` and
 * not `Math.random`: the second is a predictable sequence, and a predictable
 * invite token is a public one.
 *
 * base64url keeps every character ASCII and URL-safe, which matters twice
 * over — the token goes in a URL untouched, and it hashes identically on both
 * sides (see `hashToken`).
 */
export function mintToken(kind: LinkKind): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (kind === "team" ? TEAM_PREFIX : FRIEND_PREFIX) + base64url(bytes);
}

/**
 * The value `token_hash` takes, computed in the browser exactly as Postgres
 * computes it. Throws only when the page has no `crypto.subtle` at all.
 *
 * The column is `bytea` — the raw 32 bytes, not text — and PostgREST carries
 * bytea as a hex literal, so the leading `\x` is part of the value going over
 * the wire rather than decoration. Postgres decodes it back to bytes before
 * anything compares it, and the comparison inside the definer function is
 * `token_hash = sha256(convert_to(token, 'utf8'))`: bytes against bytes, with
 * no hex on that side at all.
 *
 * How I know the two agree byte for byte. The digest is taken over the same
 * input on both sides:
 *
 *   convert_to(t, 'utf8')  ≡  new TextEncoder().encode(t)  — UTF-8 bytes
 *   sha256(bytea)          ≡  crypto.subtle.digest("SHA-256", bytes)
 *
 * The only place two "identical" strings can hash differently is that first
 * step, where an encoding or a Unicode normalisation could disagree. It
 * cannot here: the token is base64url, so every character is ASCII, and the
 * UTF-8 encoding of ASCII is the ASCII itself. No locale, collation or
 * normalisation form is involved on either side.
 *
 * And it is `sha256()`, from `pg_catalog` since PG11 — not pgcrypto's
 * `digest()`. Supabase installs pgcrypto into the `extensions` schema, which
 * is invisible to a security definer function pinned to
 * `search_path = public, pg_temp`, so `digest()` dies at run time with
 * "function digest(text, unknown) does not exist". That has already killed
 * one migration in this project. `sha256(convert_to(t,'utf8'))` is
 * byte-identical and always in scope.
 */
export async function hashToken(token: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle)
    throw new Error(
      "This page isn't on a secure connection, so the browser won't hash the invite token. Links can only be made over https, or on localhost.",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `\\x${hex}`;
}

/** Where both kinds of link land. */
export const JOIN_PATH = "/join";

/**
 * The whole URL to give somebody.
 *
 * The token is in the PATH, not the fragment, and that is a deliberate
 * second choice. A fragment never leaves the browser, which is why this
 * project puts a shared *document* there — but a fragment also never
 * survives being pasted into the places an invite actually travels: mail
 * clients and chat apps rewrite links, and several drop everything after the
 * "#". A link that arrives without its token is not private, it is broken.
 *
 * What the path costs is one line in the access log of whatever serves this
 * app. That is bounded and it is ours; the token is single-workspace,
 * expiring and revocable, and the join page never forwards it anywhere else
 * — see the note on the sign-in round trip in `components/join`.
 *
 * Returns a path-relative URL if ever called without a window, which no
 * caller does — minting is a button press.
 */
export function linkFor(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${JOIN_PATH}/${token}`;
}

/**
 * The token out of a `location.hash`, or null if there isn't one.
 *
 * Null covers every way a link arrives broken — no fragment, a fragment from
 * some other feature, half a token because a chat app wrapped the line — and
 * the page shows "this link is incomplete" rather than asking the database
 * about nonsense.
 */
export function tokenFromHash(hash: string): string | null {
  let raw: string;
  try {
    raw = decodeURIComponent(hash.replace(/^#/, "")).trim();
  } catch {
    // decodeURIComponent throws URIError on a stray or truncated percent
    // escape — "#t_ab%zz" — which is exactly what a chat app produces when it
    // mangles a wrapped line. Uncaught, that took the whole page blank, which
    // is the one failure this page exists to delete.
    return null;
  }
  return tokenKind(raw) ? raw : null;
}

/** A uuid, as Postgres writes them. Used to guard values before they are
 *  interpolated into a PostgREST filter, which is parsed, not escaped. */
export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/* ── The account rule ───────────────────────────────────── */

/**
 * Whether this browser is somebody a membership can safely be given to.
 *
 *   "no-database"  nothing to join; this deployment runs on the browser alone.
 *   "signed-out"   nobody is here. Also what a session that has expired since
 *                  the page loaded looks like, which is the point.
 *   "anonymous"    signed in, but with an identity that lives only in this
 *                  browser's storage. Clear the browser and it is gone for
 *                  good — there is no email, so there is nothing to sign back
 *                  in with and no way to recover it. A membership handed to
 *                  one of these quietly evaporates.
 *   "real"         an account with an email on it. This one can be joined to
 *                  things.
 *
 * Read from the auth server, not from `useAuth`'s persisted identity: that
 * store is a cache of who this browser last saw and happily outlives an
 * expired session, so it would answer "real" for somebody the database will
 * refuse. `getUser()` goes to the server, which is the same authority the
 * definer function consults — it checks `auth.users` for an email and
 * `is_anonymous` not true, and so does this.
 *
 * A network failure comes back "signed-out", which errs towards not offering
 * a button rather than offering one that fails.
 */
export type AccountState = "no-database" | "signed-out" | "anonymous" | "real";

export async function accountState(): Promise<AccountState> {
  const client = supabase();
  if (!client) return "no-database";
  try {
    const { data, error } = await client.auth.getUser();
    const user = data?.user;
    if (error || !user) return "signed-out";
    if (!user.email || user.is_anonymous === true) return "anonymous";
    return "real";
  } catch {
    return "signed-out";
  }
}

/**
 * The predicate a page asks *before* drawing "Join". True only for a real
 * account; false for the other three states, which `explainAccount` names.
 *
 * The database refuses an anonymous caller anyway. This exists so the person
 * finds that out from a sentence next to a disabled button, instead of from a
 * refusal after they have followed a link and pressed the thing.
 */
export async function hasRealAccount(): Promise<boolean> {
  return (await accountState()) === "real";
}

/**
 * Why the button is off, or null when it isn't. Four answers, one per state —
 * `null` for "real", and a plain sentence for each of the other three.
 */
export function explainAccount(state: AccountState): string | null {
  if (state === "real") return null;
  if (state === "no-database")
    return "This deployment has no account database, so there is no team to join.";
  if (state === "signed-out") return "Sign in first — joining needs an account.";
  return "This browser is signed in without an account. That identity disappears the moment the browser is cleared and can't be recovered, so it can't be given a place in a team. Add an email to keep it.";
}

export interface AccountRead {
  /** False until the runtime config lookup has answered. Until then the
   *  honest thing to draw is "checking", not "no database". */
  settled: boolean;
  /** Null while the first read is in flight. */
  state: AccountState | null;
  /** Shorthand for `state === "real"`. False while still unknown. */
  ready: boolean;
}

/** `accountState` for a component, re-read whenever the signed-in person
 *  changes. Three renders: not settled, settled but unknown, then answered. */
export function useAccountState(): AccountRead {
  const settled = useRemoteConfigSettled();
  const [state, setState] = useState<AccountState | null>(null);

  /*
   * The identity store is the *trigger*, never the answer. Signing in and
   * out happen on pages that also show these buttons, and without this the
   * hook would keep answering for whoever was signed in when it mounted.
   */
  const who = useAuth((s) => s.identity.id);

  useEffect(() => {
    if (!settled) return;
    let alive = true;
    // Off the effect body: setting state synchronously here is the cascading
    // render the lint rule is about.
    void Promise.resolve().then(async () => {
      const answer = await accountState();
      if (alive) setState(answer);
    });
    return () => {
      alive = false;
    };
  }, [settled, who]);

  return { settled, state, ready: state === "real" };
}

/* ── Link lifetime ──────────────────────────────────────── */

export type LinkStatus = "live" | "expired" | "revoked" | "used-up";

/**
 * What a link row is worth now. Four answers, checked in the order they
 * override each other: revoked beats everything (it was a decision), then
 * expired, then out of uses, then live.
 *
 * This is a label for a list, not a gate. The database decides for real, on
 * its own clock — this one belongs to a laptop that may be an hour out.
 */
export function linkStatus(link: {
  expiresAt: number;
  revokedAt: number | null;
  uses: number;
  maxUses: number | null;
}): LinkStatus {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt <= Date.now()) return "expired";
  if (link.maxUses !== null && link.uses >= link.maxUses) return "used-up";
  return "live";
}

/* ── Which workspace this is about ──────────────────────── */

export interface Team {
  workspaceId: string;
  /** Null when the row came from the fallback lookup, which selects no name. */
  name: string | null;
  /** What this account may do here. Null if the membership row is missing. */
  myRole: Role | null;
  me: string;
}

interface MembershipRow {
  workspace_id: string;
  role: string;
  workspaces: { owner_id: string; name: string | null } | null;
}

/**
 * The workspace an invite is an invite *to*.
 *
 * Not `currentWorkspaceId()`, which answers "my personal workspace". For
 * somebody who has accepted an invite that is emphatically the wrong one:
 * their team lives under the workspace somebody else owns, so the team page
 * would list one member — them — and invite people into a workspace nobody
 * else is in. So: a workspace I am a member of and do not own wins, exactly
 * the rule `teamWorkspaceId` uses in `db/supabase.ts`; otherwise my own;
 * otherwise the fallback creates one.
 *
 * Three answers: `setup: true` with no database or no session, the workspace,
 * or a failure sentence.
 */
export async function currentTeam(): Promise<Outcome<Team>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { data: auth } = await client.auth.getSession();
    const me = auth.session?.user.id;
    if (!me) return NO_DATABASE;

    const { data, error } = await client
      .from("workspace_members")
      .select("workspace_id, role, workspaces(owner_id, name)")
      .eq("user_id", me);
    if (error) return failed(error.message);

    const rows = (data ?? []) as unknown as MembershipRow[];
    // `row.workspaces` null means the embed came back empty, which says
    // nothing about who owns it — so that row is not evidence of a team.
    const joined = rows.find(
      (row) => row.workspaces != null && row.workspaces.owner_id !== me,
    );
    const own = rows.find((row) => row.workspaces?.owner_id === me);
    const pick = joined ?? own;
    if (pick)
      return {
        ok: true,
        value: {
          workspaceId: pick.workspace_id,
          name: pick.workspaces?.name ?? null,
          myRole: pick.role as Role,
          me,
        },
      };

    // No membership row anywhere: a workspace made before the trigger that
    // adds its owner existed. The owner still owns it, and the policies still
    // let them in — see `owns_workspace` in schema.sql.
    const fallback = await currentWorkspaceId();
    if (!fallback) return NO_DATABASE;
    return {
      ok: true,
      value: { workspaceId: fallback, name: null, myRole: "owner", me },
    };
  } catch (error) {
    return failed(error);
  }
}

/* ── Invites ────────────────────────────────────────────── */

/**
 * The roles a link may carry, most capable first — the same ladder as
 * `workspace_members` minus `owner`, which mirrors the check constraint on
 * the column. A role picker should be built from this rather than from
 * `ROLE_ORDER`, which includes an option the database will reject.
 */
export const INVITE_ROLES: Role[] = ["admin", "editor", "commenter", "viewer"];

export interface TeamInvite {
  id: string;
  role: Role;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  uses: number;
  /** Null means no limit — bounded by the expiry and by revoking it. */
  maxUses: number | null;
  status: LinkStatus;
}

interface InviteRow {
  id: string;
  role: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  uses: number | null;
  max_uses: number | null;
}

const rowToInvite = (row: InviteRow): TeamInvite => {
  const invite = {
    id: String(row.id),
    role: row.role as Role,
    createdBy: String(row.created_by),
    createdAt: Date.parse(row.created_at) || 0,
    expiresAt: Date.parse(row.expires_at) || 0,
    revokedAt: row.revoked_at ? Date.parse(row.revoked_at) : null,
    uses: Number(row.uses ?? 0),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
  };
  return { ...invite, status: linkStatus(invite) };
};

/**
 * Mint a link that puts whoever follows it into this workspace at `role`.
 *
 * Four answers: `setup: true` when there is no database; a refusal sentence
 * when the request itself is wrong (an impossible lifetime, a role this
 * account may not hand out, no permission to invite at all); a failure
 * sentence when the insert was refused; or the URL — which is the only time
 * the token will ever exist outside the link, so the caller must show it and
 * the caller must say it cannot be shown again.
 *
 * `owner` is never mintable, whoever is asking. An open link that arrives in
 * a group chat and turns its first taker into the owner of the workspace is
 * a way to lose a workspace, not a way to invite somebody. Ownership is
 * handed over deliberately, to a person, in the members list.
 */
export async function createInvite(
  role: Role,
  days: number,
  maxUses: number | null = null,
): Promise<Outcome<string>> {
  if (role === "owner")
    return {
      ok: false,
      reason:
        "An invite link can't make somebody the owner. Hand ownership over to a named person in the members list instead.",
    };
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS)
    return {
      ok: false,
      reason: `Pick a lifetime between 1 and ${MAX_DAYS} days. A link that lives longer than that isn't really expiring.`,
    };
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))
    return {
      ok: false,
      reason: "A use limit has to be a whole number, at least one — or none at all.",
    };

  const team = await currentTeam();
  if (!team.ok) return team;
  if (!can(team.value.myRole ?? undefined, "manageMembers"))
    return {
      ok: false,
      reason: "Only an owner or an admin can invite people to this workspace.",
    };

  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const token = mintToken("team");
    const { error } = await client.from("workspace_invites").insert({
      workspace_id: team.value.workspaceId,
      role,
      token_hash: await hashToken(token),
      created_by: team.value.me,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
      max_uses: maxUses,
    });
    if (error) return failed(error.message);
    return { ok: true, value: linkFor(token) };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Every invite ever minted for this workspace, newest first — live, expired
 * and revoked alike, because "who could still get in" is only half the
 * question and "who did we hand a link to, and did anyone use it" is the
 * other half.
 *
 * Three answers: `setup: true`, the rows, or a failure sentence. An empty
 * array is a real answer and means no links have been made.
 *
 * The rows carry no token and never will — only its hash was kept. A screen
 * built on this can offer "revoke" and "make another", and must not offer
 * "copy link" for anything but the one just minted.
 */
export async function listInvites(): Promise<Outcome<TeamInvite[]>> {
  const team = await currentTeam();
  if (!team.ok) return team;
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { data, error } = await client
      .from("workspace_invites")
      .select(
        "id, role, created_by, created_at, expires_at, revoked_at, uses, max_uses",
      )
      .eq("workspace_id", team.value.workspaceId)
      .order("created_at", { ascending: false });
    if (error) return failed(error.message);
    return {
      ok: true,
      value: ((data ?? []) as unknown as InviteRow[]).map(rowToInvite),
    };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Kill a link. Three answers: `setup: true`, done, or a failure sentence.
 *
 * Idempotent, and deliberately does not touch a row that is already revoked:
 * the first revocation is the true one, and overwriting its timestamp would
 * rewrite when the door actually shut. Pressing it twice is not an error —
 * two admins reading the same group chat is the normal case.
 */
export async function revokeInvite(id: string): Promise<Outcome<void>> {
  const team = await currentTeam();
  if (!team.ok) return team;
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { error } = await client
      .from("workspace_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", team.value.workspaceId)
      .is("revoked_at", null);
    if (error) return failed(error.message);
    return { ok: true, value: undefined };
  } catch (error) {
    return failed(error);
  }
}

export interface Acceptance {
  /** The workspace joined, or the person connected to. */
  id: string;
  /** Its name, or theirs. Null when nobody has set one. */
  name: string | null;
  /**
   * Already in before this click, and nothing changed — usually the same
   * browser reloading `/join`. It is a success, and screens have to draw it
   * as one: `already: false` says "you're in", `already: true` says "you were
   * already in", and telling somebody standing inside the workspace that they
   * could not get in is the bug this flag exists to prevent. No use is
   * counted against the link on this path, so a one-use link survives a
   * reload.
   */
  already: boolean;
}

/**
 * What an accept function said, turned into an `Outcome`.
 *
 * `accept_workspace_invite` and `accept_connection` both answer one jsonb
 * object: `ok`, `already`, an id, a name, and — when `ok` is false — a short
 * `reason` slug plus the `message` to show. The message is written in the
 * migration next to the check that produces it, so this passes it through
 * rather than rewording it here; two places deciding what "expired" means to
 * a reader is how they drift apart within a release.
 *
 * The slug is deliberately not surfaced. Every refusal leads to one of two
 * actions — make a real account, which `accountState` already answers before
 * the button is drawn, or ask whoever sent the link for a new one — and the
 * message says which. A page that needs to branch further should read the
 * jsonb itself rather than have this invent a second result type for it.
 *
 * Three answers: the thing joined, the database's refusal in its own words,
 * or "no answer at all" — which is not success and must never be drawn as
 * one.
 */
export function readAcceptance(
  data: unknown,
  idKey: "workspace_id" | "person_id",
  nameKey: "workspace_name" | "display_name",
): Outcome<Acceptance> {
  // A `returns jsonb` function comes back as the object itself; the array
  // case is only here so a set-returning older version does not read as
  // "no answer".
  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!row || typeof row !== "object")
    return {
      ok: false,
      reason: "The database gave no answer, so nothing happened.",
    };

  const id = row[idKey];
  if (row.ok !== true || typeof id !== "string" || !id) {
    const message = typeof row.message === "string" ? row.message.trim() : "";
    const slug = typeof row.reason === "string" ? row.reason.trim() : "";
    return { ok: false, reason: message || slug || "That link can't be used." };
  }
  const name = row[nameKey];
  return {
    ok: true,
    value: {
      id,
      name: typeof name === "string" && name ? name : null,
      already: row.already === true,
    },
  };
}

export interface Joined extends Acceptance {
  /** The same id, named for what it is. */
  workspaceId: string;
  /** What you are in the workspace as — the role the link carried, or the one
   *  you already had if you were already a member. Null if it was not sent. */
  role: Role | null;
}

/**
 * Follow a team invite.
 *
 * Four answers: `setup: true` with no database; a plain refusal when this
 * browser may not accept anything (see `explainAccount`) or the token is not
 * a team link at all; the database's own refusal — expired, revoked, used up,
 * no such link — passed through in its words; or the workspace, with
 * `already` saying whether this click is what put you in it.
 *
 * The account check happens twice on purpose. The definer function is the one
 * that counts, and it asks `auth.users`, where an anonymous session cannot
 * lie about itself. This one is so the refusal reads like a sentence written
 * for a person rather than arriving after they followed a link and pressed
 * the thing.
 */
export async function acceptInvite(token: string): Promise<Outcome<Joined>> {
  if (tokenKind(token) !== "team")
    return { ok: false, reason: "That isn't a team invite link." };

  const state = await accountState();
  if (state !== "real")
    return {
      ok: false,
      reason: explainAccount(state) ?? "",
      setup: state === "no-database",
    };

  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { data, error } = await client.rpc("accept_workspace_invite", {
      token,
    });
    if (error) return failed(error.message);
    const answer = readAcceptance(data, "workspace_id", "workspace_name");
    if (!answer.ok) return answer;
    const row = (Array.isArray(data) ? data[0] : data) as Record<
      string,
      unknown
    >;
    return {
      ok: true,
      value: {
        ...answer.value,
        workspaceId: answer.value.id,
        role: typeof row.role === "string" ? (row.role as Role) : null,
      },
    };
  } catch (error) {
    return failed(error);
  }
}

/* ── Who is actually in here ────────────────────────────── */

export interface TeamMember {
  userId: string;
  role: Role;
  displayName: string | null;
  /**
   * Never signed up. Normal, not broken — but they will lose this seat if
   * they clear the browser, which is worth showing.
   *
   * Null when the profile could not be read, which is a different fact and
   * must not be printed as this one. It is the ordinary state of a database
   * that does not have migration 0015 yet, and every migration here is run by
   * hand — so on such a deployment this defaulting to `true` told a whole
   * real team that none of them had accounts.
   */
  anonymous: boolean | null;
  joinedAt: number;
  isMe: boolean;
}

interface MemberRow {
  user_id: string;
  role: string;
  created_at: string;
  profiles: { display_name: string | null; is_anonymous: boolean } | null;
}

/**
 * The real membership rows, joined to profiles for names.
 *
 * Three answers: `setup: true`, the members, or a failure sentence. The array
 * is never empty in practice — you are in it — so an empty one means the
 * membership row is missing and the workspace predates the trigger that adds
 * its owner.
 *
 * Not `fetchMembers` from `lib/admin`, which asks the same question of
 * `currentWorkspaceId()` — the personal workspace. For somebody who joined a
 * team that lists exactly one person: themselves. `currentTeam()` picks the
 * workspace the team is actually in.
 */
export async function listMembers(): Promise<Outcome<TeamMember[]>> {
  const team = await currentTeam();
  if (!team.ok) return team;
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { data, error } = await client
      .from("workspace_members")
      .select("user_id, role, created_at, profiles(display_name, is_anonymous)")
      .eq("workspace_id", team.value.workspaceId)
      .order("created_at", { ascending: true });
    if (error) return failed(error.message);
    return {
      ok: true,
      value: ((data ?? []) as unknown as MemberRow[]).map((row) => ({
        userId: row.user_id,
        role: row.role as Role,
        displayName: row.profiles?.display_name ?? null,
        // `null`, not `true`. The embed comes back null both when somebody
        // really is on a throwaway session AND when the profile could not be
        // read at all — which is the normal state of a database where 0015's
        // profiles_people_you_know policy has not been applied yet, since
        // every migration here is run by hand. Defaulting to the alarming
        // value told a whole real team they were about to evaporate.
        anonymous: row.profiles ? row.profiles.is_anonymous : null,
        joinedAt: Date.parse(row.created_at) || 0,
        isMe: row.user_id === team.value.me,
      })),
    };
  } catch (error) {
    return failed(error);
  }
}

export interface InvitesRead {
  settled: boolean;
  outcome: Outcome<TeamInvite[]> | null;
  busy: boolean;
  reload: () => Promise<void>;
}

/** `listInvites` for a component, with the same "not settled yet" honesty the
 *  plan card uses: settled, then in flight, then an outcome. */
export function useInvites(): InvitesRead {
  const settled = useRemoteConfigSettled();
  const [outcome, setOutcome] = useState<Outcome<TeamInvite[]> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    const answer = await listInvites();
    setOutcome(answer);
    setBusy(false);
  }, []);

  const who = useAuth((s) => s.identity.id);

  useEffect(() => {
    if (!settled) return;
    void Promise.resolve().then(reload);
  }, [settled, reload, who]);

  return { settled, outcome, busy, reload };
}


/* ── Is there really a team? ────────────────────────────── */

/**
 * How many people are in the workspace this person belongs to.
 *
 * `lib/scope` answers "is there a team" from the local store, which nothing
 * writes any more — so somebody who accepted a real invite was still told
 * they had no team, and the whole team world stayed shut to them. This is the
 * real answer, and `scope` prefers it whenever it has one.
 *
 * Null rather than 1 when it cannot be asked: no database, signed out, or a
 * database without migration 0015. "I do not know" and "you are alone" lead
 * to the same screen but not to the same sentence, and only one of them is
 * safe to cache.
 */
export async function countMembers(): Promise<number | null> {
  const team = await currentTeam();
  if (!team.ok) return null;
  const client = supabase();
  if (!client) return null;
  try {
    const { count, error } = await client
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", team.value.workspaceId);
    if (error) return null;
    return count ?? null;
  } catch {
    return null;
  }
}
