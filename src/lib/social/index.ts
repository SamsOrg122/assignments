"use client";

/**
 * Friends.
 *
 * The same mechanism as a team invite, pointed at a person instead of a
 * workspace: an open link, a token that exists only inside it, an expiry and
 * a revoke that both genuinely work. It reuses `lib/team/invites` for the
 * minting and the hashing rather than growing a second copy — two
 * implementations of "hash it the way Postgres does" is two chances for one
 * of them to drift and produce links that silently never match a row.
 *
 * What is different is the shape of the answer. `public.connections` holds
 * one pair-ordered row per friendship and has no insert policy at all, so
 * nobody can write themselves into somebody else's friend list: the only way
 * a row appears is `accept_connection`, from a token only the other person
 * could have handed out. Removing is symmetric — either side can, and it
 * takes the single row with it.
 *
 * `Outcome<T>` throughout, the one from `lib/team/invites` — `lib/admin`'s
 * shape, `setup: true` and all, plus `signInHref` for the case that used to
 * be reported as a missing database.
 */

import { supabase } from "../db/client";
import { explainAuthErrorLine } from "../auth/errors";
import type { Acceptance } from "../team/invites";
import {
  accountState,
  explainAccount,
  hashToken,
  isUuid,
  linkFor,
  linkStatus,
  mintToken,
  MAX_DAYS,
  readAcceptance,
  SIGNIN_PATH,
  tokenKind,
} from "../team/invites";
import type { Outcome } from "../team/invites";
import type { Friend, FriendLink } from "./types";

export type { Friend, FriendLink, LinkStatus } from "./types";
// `lib/team/invites`'s, not `lib/admin`'s: the same shape plus `signInHref`,
// which is how a page tells "nobody is signed in" from "this deployment has
// no database". Re-exported so a friends page never has to hold two result
// types that are nearly the same.
export type { Outcome } from "../team/invites";

/**
 * The account rule is the same rule, so it is the same predicate. Re-exported
 * so a friends page never has to reach into `lib/team` for it — and so there
 * is exactly one answer to "may this browser accept things", not two that
 * could one day disagree.
 */
export {
  accountState,
  explainAccount,
  hasRealAccount,
  useAccountState,
  linkStatus,
  tokenFromHash,
  tokenKind,
  JOIN_PATH,
  SIGNIN_PATH,
  MAX_DAYS,
  type AccountState,
  type Acceptance,
} from "../team/invites";

const NO_DATABASE = {
  ok: false as const,
  setup: true,
  reason:
    "Friends need the account database, and this deployment has none. There is nobody to connect to — the app is running on this browser alone.",
};

/**
 * Not `NO_DATABASE`. There is a database — nobody is signed in to ask it
 * anything on behalf of, which is a different fact with a different way out.
 * Saying the first one to somebody whose session expired overnight tells them
 * their deployment is broken and leaves them nowhere to go.
 *
 * No `setup` flag on purpose, so a screen that hides "try again" for a
 * configuration problem keeps it here: signing in happens in another tab, and
 * coming back to press the button is the whole recovery.
 */
const SIGNED_OUT = {
  ok: false as const,
  signInHref: SIGNIN_PATH,
  reason:
    "Nobody is signed in, so there is nobody to read this for. A tab left open overnight is the usual way this happens — sessions expire on their own — and signing in again is all it needs.",
};

const failed = (error: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: explainAuthErrorLine(error),
});

/** The signed-in account id, or null — which here can only mean signed out,
 *  since every caller has already found a client. */
async function whoAmI(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

/* ── Friends ────────────────────────────────────────────── */

interface ConnectionRow {
  person_a: string;
  person_b: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  is_anonymous: boolean;
}

/**
 * Everyone connected to this account.
 *
 * Four answers: `setup: true` when there is no database; `signInHref` when
 * nobody is signed in; the friends; or a failure sentence. An empty array is a
 * real answer and means no connections — it is not "could not ask", which is
 * the distinction this whole result type exists for.
 *
 * Two queries rather than one embedded join. `connections` has two foreign
 * keys into profiles, so an embed has to be disambiguated by constraint name
 * — a string that lives in the migration and breaks this file the day it is
 * renamed. Reading the pair rows and then the profiles by id is one extra
 * round trip and no coupling to a constraint's name.
 *
 * A profile that fails to come back is not a reason to hide the friend: the
 * connection is real either way, so the name reads null and the page draws
 * whatever it draws for someone who never set one. What it must not do is
 * make up the rest of the row — `anonymous` is `null` for exactly those
 * friends, never `true`. See the note on the map below.
 */
export async function listFriends(): Promise<Outcome<Friend[]>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const me = await whoAmI();
    if (!me) return SIGNED_OUT;

    const { data, error } = await client
      .from("connections")
      .select("person_a, person_b, created_at")
      .order("created_at", { ascending: false });
    if (error) return failed(error.message);

    const rows = (data ?? []) as unknown as ConnectionRow[];
    // Row-level security already returns only pairs this account is in, so
    // the other side is simply whichever column is not me.
    const others = rows.map((row) => ({
      userId: row.person_a === me ? row.person_b : row.person_a,
      since: Date.parse(row.created_at) || 0,
    }));
    if (others.length === 0) return { ok: true, value: [] };

    const { data: profileData, error: profileError } = await client
      .from("profiles")
      .select("id, display_name, is_anonymous")
      .in(
        "id",
        others.map((other) => other.userId),
      );

    /*
     * A friend is in this map only if their profile row was actually read.
     * Both halves of that matter, and the old code checked neither.
     *
     * The select's own error was never looked at, so a refusal — the whole
     * query rejected, which is what a database without 0015's
     * `profiles_people_you_know` policy does, and every migration here is run
     * by hand — arrived as `data: null` and read as a list of people who all
     * turned out to be anonymous. And a row missing from a query that did
     * succeed is the same fact one person at a time: RLS drops rows it will
     * not show rather than erroring, so "not in the answer" says nothing
     * about whether they signed up.
     *
     * Either way the friend is absent from the map and `anonymous` is `null`
     * — "could not tell" — which is the third state the row already knows how
     * to draw. `true` would be an accusation invented here.
     */
    const named = new Map<string, { name: string | null; anonymous: boolean }>();
    if (!profileError)
      for (const row of (profileData ?? []) as unknown as ProfileRow[])
        named.set(String(row.id), {
          name: row.display_name ?? null,
          // The row was read, so this is the column, not a guess. It is
          // `not null default true` in the schema.
          anonymous: row.is_anonymous === true,
        });

    return {
      ok: true,
      value: others.map((other) => {
        const profile = named.get(other.userId);
        return {
          userId: other.userId,
          displayName: profile?.name ?? null,
          anonymous: profile ? profile.anonymous : null,
          since: other.since,
        };
      }),
    };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Drop a connection. Four answers: `setup: true`, `signInHref`, done, or a
 * failure sentence. Removing somebody who is already gone is not an error —
 * two tabs, or two taps, and the second one has nothing to do.
 *
 * The filter names both orderings rather than working out which of you sorted
 * first. Pair ordering is the database's business; guessing it here would put
 * a rule in two places, and the version in this file would be the one that
 * quietly stopped matching. `isUuid` guards the ids before they go into the
 * filter string, because PostgREST *parses* that string — a value carrying a
 * comma or a bracket would change which rows it names.
 */
export async function removeFriend(id: string): Promise<Outcome<void>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const me = await whoAmI();
    if (!me) return SIGNED_OUT;
    if (!isUuid(id) || !isUuid(me))
      return { ok: false, reason: "That isn't someone this app can remove." };

    const { error } = await client
      .from("connections")
      .delete()
      .or(
        `and(person_a.eq.${me},person_b.eq.${id}),and(person_a.eq.${id},person_b.eq.${me})`,
      );
    if (error) return failed(error.message);
    return { ok: true, value: undefined };
  } catch (error) {
    return failed(error);
  }
}

/* ── Links ──────────────────────────────────────────────── */

interface LinkRow {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  uses: number | null;
  max_uses: number | null;
}

const rowToLink = (row: LinkRow): FriendLink => {
  const link = {
    id: String(row.id),
    createdAt: Date.parse(row.created_at) || 0,
    expiresAt: Date.parse(row.expires_at) || 0,
    revokedAt: row.revoked_at ? Date.parse(row.revoked_at) : null,
    uses: Number(row.uses ?? 0),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
  };
  return { ...link, status: linkStatus(link) };
};

/**
 * Mint a link that connects whoever follows it to this account.
 *
 * Five answers: `setup: true` with no database; `signInHref` with no session;
 * a refusal when the lifetime asked for is impossible; a failure sentence when
 * the insert was refused; or the URL.
 *
 * The URL is the only copy of the token there will ever be — the row keeps
 * its hash and nothing else — so whatever shows it has to say that, and has
 * to offer "make another" rather than pretending it can find this one again.
 *
 * Whoever follows it needs a real account; this does not, because the
 * database is the authority on that and it asks at the moment somebody
 * accepts, about the person accepting.
 *
 * One use by default, which is the difference from a team invite and matches
 * the column's own default. A friend link is sent to one person; a link that
 * still works after they have used it works for whoever they forward it to,
 * and a friendship is not a thing to hand out by accident. Pass a number for
 * a link on a conference badge, or null for no limit at all.
 */
export async function createFriendLink(
  days: number,
  maxUses: number | null = 1,
): Promise<Outcome<string>> {
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

  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const me = await whoAmI();
    if (!me) return SIGNED_OUT;

    const token = mintToken("friend");
    const { error } = await client.from("connection_links").insert({
      created_by: me,
      token_hash: await hashToken(token),
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
 * Every friend link this account has minted, newest first — dead ones
 * included, so "did anybody ever use that link I put in the group chat" has
 * an answer.
 *
 * Four answers: `setup: true`, `signInHref`, the rows, or a failure sentence.
 * None of them carry a token; see `createFriendLink`.
 */
export async function listFriendLinks(): Promise<Outcome<FriendLink[]>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const me = await whoAmI();
    if (!me) return SIGNED_OUT;
    const { data, error } = await client
      .from("connection_links")
      .select("id, created_at, expires_at, revoked_at, uses, max_uses")
      .eq("created_by", me)
      .order("created_at", { ascending: false });
    if (error) return failed(error.message);
    return {
      ok: true,
      value: ((data ?? []) as unknown as LinkRow[]).map(rowToLink),
    };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Kill a friend link. Four answers: `setup: true`, `signInHref`, done, or a
 * failure sentence.
 *
 * Leaves an already-revoked row alone, so the timestamp keeps saying when the
 * door actually shut rather than when somebody last pressed the button.
 */
export async function revokeFriendLink(id: string): Promise<Outcome<void>> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const me = await whoAmI();
    if (!me) return SIGNED_OUT;
    const { error } = await client
      .from("connection_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("created_by", me)
      .is("revoked_at", null);
    if (error) return failed(error.message);
    return { ok: true, value: undefined };
  } catch (error) {
    return failed(error);
  }
}

export interface Connected extends Acceptance {
  /** The same id, named for what it is. */
  userId: string;
}

/**
 * Follow a friend link.
 *
 * Four answers: `setup: true` with no database; a plain refusal when this
 * browser has no real account to connect (see `explainAccount`) or the token
 * is a team invite rather than a friend link; the database's own refusal —
 * expired, revoked, used up, your own link — in its words; or the person you
 * are now connected to, with `already` saying whether this click is what
 * connected you.
 *
 * The account check here is a courtesy, not the enforcement. `accept_connection`
 * asks `auth.users` itself, where an anonymous session cannot claim otherwise;
 * this one exists so the answer arrives as a sentence rather than a refusal.
 *
 * The `Friend` this produces has no `anonymous` flag and no `since`, because
 * the function does not return them and guessing either would be a fact this
 * file made up. Reload the list; `listFriends` knows.
 */
export async function acceptFriend(token: string): Promise<Outcome<Connected>> {
  if (tokenKind(token) !== "friend")
    return { ok: false, reason: "That isn't a friend link." };

  const state = await accountState();
  if (state !== "real")
    return {
      ok: false,
      reason: explainAccount(state) ?? "",
      setup: state === "no-database",
      // As in `acceptInvite`: a page that has to draw a way out needs to know
      // which door, and "sign in" is not "this deployment has no database".
      ...(state === "signed-out" ? { signInHref: SIGNIN_PATH } : {}),
    };

  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { data, error } = await client.rpc("accept_connection", { token });
    if (error) return failed(error.message);
    const answer = readAcceptance(data, "person_id", "display_name");
    if (!answer.ok) return answer;
    return { ok: true, value: { ...answer.value, userId: answer.value.id } };
  } catch (error) {
    return failed(error);
  }
}
