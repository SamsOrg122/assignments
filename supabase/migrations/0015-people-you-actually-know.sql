-- People you actually know: an invite link, a friend link, and being able to
-- read a teammate's name.
--
-- Until now there was no way to put a second person in a workspace. The
-- store's `acceptInvite` is documented as "Simulates the invitee following
-- the link", the members list and the person picker are seeded fixtures, and
-- nothing anybody clicked ever reached the database. This is the migration
-- that makes the link real.
--
-- ── WHAT A LINK IS HERE ──────────────────────────────────────────────────
-- An OPEN link. Whoever holds it and is signed in may use it; it is not
-- addressed to an email address, because it is going to be pasted into a
-- group chat and forwarded twice before anybody opens it. Addressing it to
-- an email would mean the link stops working for the exact person who was
-- meant to get it, and would still not stop anybody else who had the email.
--
-- What makes an open link safe is not who it names, it is that expiry and
-- revocation genuinely work — so both of those are columns the accept
-- function reads on every single use, not advice in a UI.
--
-- ── THE TOKEN IS NEVER STORED ────────────────────────────────────────────
-- `token_hash` is `sha256(convert_to(token, 'utf8'))` and there is no column
-- holding the token. A database dump must not be a pile of working invite
-- links: somebody with a backup file gets a list of hashes, which lets them
-- into nothing. The browser mints the token, hashes it, stores the hash and
-- keeps the token only long enough to build the URL.
--
-- Not `digest(token, 'sha256')`. Supabase installs pgcrypto into the
-- `extensions` schema, so `digest` is invisible to a `security definer`
-- function with a pinned `search_path` and the file dies at run time with
-- "function digest(text, unknown) does not exist". That has already happened
-- once in this project — see 0012. `sha256(bytea)` has been in `pg_catalog`
-- since Postgres 11, needs no extension, and produces the same bytes.
--
-- ── A REAL ACCOUNT IS REQUIRED ───────────────────────────────────────────
-- The app signs people in anonymously by default and that is a supported way
-- to use it — but an anonymous identity is lost the moment the browser is
-- cleared and can never be recovered. Letting one join a team would be
-- handing somebody a membership that quietly evaporates, and handing the
-- team a member who cannot be contacted, cannot come back, and cannot be
-- told apart from the next anonymous session.
--
-- The test is against `auth.users`: an email on the row, and `is_anonymous`
-- not true. Deliberately NOT `public.profiles.is_anonymous`, tempting as the
-- shorter join is: `profiles_self` is a `for all` policy, so a person can
-- update their own profile row and set `is_anonymous` to false. A check
-- somebody can answer for themselves is not a check. Nobody can write
-- `auth.users`.
--
-- ── WHY THE ACCEPT PATH IS A FUNCTION ────────────────────────────────────
-- Because the only way to use a link is to prove you hold the token, and no
-- row-level policy can express that: a policy that let you select the invite
-- row whose hash matches what you typed would also let you enumerate. So
-- nobody may read `workspace_invites` by token at all. Members can list
-- their workspace's links (to see what is outstanding and to revoke one),
-- and the accept path is a `security definer` function that takes the token,
-- hashes it, and either does the whole join or refuses with a reason.
--
-- Which is also why `connections` has no insert policy. There is no way to
-- write a policy for "b agreed to this" — agreement is an event, not a
-- property of a row — so the table is unwritable from outside and the only
-- door is `accept_connection`, which requires the token. Without that, any
-- signed-in person could add themselves to a stranger's friend list.

begin;

/*
 * Is this caller a real account?
 *
 * `language plpgsql` and not `language sql` on purpose. An SQL body is parsed
 * and its columns resolved when the function is created; a plpgsql body is
 * not. `auth.users.is_anonymous` is Supabase's column, not ours, and on an
 * older or self-hosted auth schema that lacks it an SQL body would fail at
 * CREATE time and take this whole migration down. plpgsql fails later, and
 * only if this path is actually used — which is the failure the founder can
 * read and act on rather than one that blocks every other table in the file.
 *
 * Not granted to anybody. It exists for the two accept functions below, which
 * run as the definer and so may call it; a client has no business asking the
 * database a question it already knows the answer to from its own session.
 */
create or replace function public.is_real_account(who uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  -- Not called `real`: that is a type name, and a plpgsql variable that
  -- shadows one is the kind of thing that works until somebody writes a cast.
  genuine boolean;
begin
  select (u.email is not null and u.email <> '' and u.is_anonymous is not true)
    into genuine
    from auth.users u
   where u.id = who;
  return coalesce(genuine, false);
end;
$$;

-- Not granted to `anon` or `authenticated` — and `revoke ... from public` is
-- not the thing that keeps it that way. Supabase's default privileges grant
-- execute on every new function in `public` to both roles by name, and a
-- privilege held by a role outlives a revoke aimed at `public`. So the two
-- roles are named, guarded on `pg_roles` the way every other role-specific
-- statement in this file is, because a self-hosted Postgres may not have them.
revoke all on function public.is_real_account(uuid) from public;
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.is_real_account(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.is_real_account(uuid) from authenticated;
  end if;
end
$migration$;

-- ── An open link into a workspace ─────────────────────────────────────────

create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The same ladder as `workspace_members`, minus 'owner'. A link may not
  -- hand over ownership: ownership is a transfer between two named people,
  -- and a thing that has been forwarded through a group chat is nobody in
  -- particular. Rank is what everything else checks, so a link that could
  -- mint an owner could mint somebody who then removes the founder.
  role         text not null default 'editor'
               check (role in ('admin', 'editor', 'commenter', 'viewer')),
  -- sha256 of the token, and nothing else. See the header.
  token_hash   bytea not null unique,
  -- Cascades rather than nulls, unlike `audit_log.actor_id`. A link is a
  -- credential somebody handed out, not a record of what happened; when the
  -- person who minted it is erased their live links stop working, which is
  -- the behaviour a person deleting their account would expect.
  created_by   uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  -- Not null, no default. An invite that never expires is the one that turns
  -- up in a search result in two years, so making a link is always making a
  -- decision about how long it lives.
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  uses         integer not null default 0,
  -- Null means "as many as the expiry allows". A team link is normally
  -- reusable — it goes to the whole group at once and you do not know how
  -- many people are in the group.
  max_uses     integer check (max_uses is null or max_uses > 0),
  created_at   timestamptz not null default now()
);

-- What the team screen asks for: the outstanding links for this workspace.
create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites(workspace_id, created_at desc);

alter table public.workspace_invites enable row level security;

-- Any member may see what links exist, because "who can currently walk into
-- this workspace" is not a secret from the people already in it — and a
-- revoke button needs something to list. The token is not here to be seen.
drop policy if exists workspace_invites_visible on public.workspace_invites;
create policy workspace_invites_visible on public.workspace_invites
  for select using (public.is_member(workspace_id));

-- Making one is an admin act, and `has_role` counts an owner as above an
-- admin. `owns_workspace` is ORed in for the same reason the rest of the
-- schema does it: a workspace made before the membership trigger existed has
-- an owner with no membership row.
drop policy if exists workspace_invites_made_by_admins on public.workspace_invites;
create policy workspace_invites_made_by_admins on public.workspace_invites
  for insert with check (
    (public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id))
    -- So a link cannot be attributed to somebody else. The default fills this
    -- in; the check is what makes the default a guard rather than a nicety.
    and created_by = auth.uid()
  );

-- Revoking is an update — `revoked_at = now()` — which is why this is the
-- only write path a link has after it exists. There is no delete policy and
-- no delete grant: deleting the row would throw away the record that the link
-- was ever handed out, and that record is most of the value of revoking it.
drop policy if exists workspace_invites_revoked_by_admins on public.workspace_invites;
create policy workspace_invites_revoked_by_admins on public.workspace_invites
  for update using (
    public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id)
  ) with check (
    public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id)
  );

-- ── Following an invite link ──────────────────────────────────────────────

/*
 * Take a token, and either join the workspace or say plainly why not.
 *
 * Returns jsonb rather than a row so one call answers completely:
 *
 *   { ok: true,  already: false, workspace_id, workspace_name, role,
 *     reason: null, message: null }
 *   { ok: false, already: false, workspace_id: null, workspace_name: null,
 *     role: null, reason: 'expired', message: 'this link has expired. …' }
 *
 * `reason` is a short stable slug for code to branch on; `message` is the
 * sentence to show. Both live here because the reasons are decided here — a
 * page that re-derives them from a boolean drifts from what the database
 * actually did within a release, and the person reading the screen is the one
 * who pays for that. A page is free to override the wording; the slug is the
 * contract.
 */
create or replace function public.accept_workspace_invite(token text)
returns jsonb
language plpgsql
security definer
-- Pinned, and `auth` is on it because `is_real_account` is reached through
-- here. A definer function that resolves names through the caller's
-- search_path is a way to hand out the owner's rights by accident.
set search_path = public, auth, pg_temp
as $$
declare
  me      uuid := auth.uid();
  link    public.workspace_invites%rowtype;
  ws_name text;
  mine    text;
  claimed integer;
begin
  if me is null then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'signed out',
      'message', 'you are not signed in. sign in, then open the link again.');
  end if;

  -- A distinct reason, because it is a distinct thing to fix and the fix is
  -- not obvious: "make an account" is a different instruction from "ask for a
  -- new link", and telling somebody the wrong one wastes their afternoon.
  if not public.is_real_account(me) then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'anonymous',
      'message', 'this browser is signed in anonymously, and an anonymous '
              || 'sign-in is lost as soon as the browser is cleared. make an '
              || 'account first, then open the link again.');
  end if;

  select * into link
    from public.workspace_invites
   where token_hash = sha256(convert_to(coalesce(token, ''), 'utf8'));

  if not found then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'no such link',
      'message', 'that link does not work. ask whoever sent it for a new one.');
  end if;

  select name into ws_name from public.workspaces where id = link.workspace_id;

  -- Before revoked/expired/used up, and that ordering is the point. A one-use
  -- link that has already been used is used up — so a second click, which is
  -- usually the same person's browser reloading the page, would be told "this
  -- link is used up" while they are standing inside the workspace. Answering
  -- about their membership instead is both friendlier and truer, and it costs
  -- the link nothing: no use is counted on this path.
  select role into mine
    from public.workspace_members
   where workspace_id = link.workspace_id and user_id = me;

  if found then
    return jsonb_build_object(
      'ok', true, 'already', true, 'workspace_id', link.workspace_id,
      'workspace_name', ws_name, 'role', mine,
      'reason', null, 'message', null);
  end if;

  if link.revoked_at is not null then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'revoked',
      'message', 'this link was turned off. ask for a new one.');
  end if;

  if link.expires_at <= now() then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'expired',
      'message', 'this link has expired. ask for a new one.');
  end if;

  if link.max_uses is not null and link.uses >= link.max_uses then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'used up',
      'message', 'this link has already been used as many times as it allows.');
  end if;

  -- Claim the use with the conditions in the UPDATE itself, not from the row
  -- read above. Two people opening the last use of a link at the same moment
  -- both read `uses = 0`; only one of them can win a conditional update, and
  -- the loser is refused rather than let in past the cap. The three checks
  -- above are still worth having — they are what produces a reason a person
  -- can read, where this only produces a row count.
  update public.workspace_invites i
     set uses = i.uses + 1
   where i.id = link.id
     and i.revoked_at is null
     and i.expires_at > now()
     and (i.max_uses is null or i.uses < i.max_uses);
  get diagnostics claimed = row_count;

  if claimed = 0 then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'used up',
      'message', 'this link has already been used as many times as it allows.');
  end if;

  -- Counted first, then joined: the other order lets a race put somebody in
  -- the workspace and only then discover there was no use left for them.
  --
  -- `on conflict do nothing` and not `do update`: the membership already
  -- existing means the row above returned, or two tabs raced. Either way the
  -- role stays what it is. A link may not change the role of somebody already
  -- in the workspace — an admin who is handed a viewer link should not come
  -- out of it a viewer, and the reverse is worse.
  insert into public.workspace_members (workspace_id, user_id, role)
  values (link.workspace_id, me, link.role)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true, 'already', false, 'workspace_id', link.workspace_id,
    'workspace_name', ws_name, 'role', link.role,
    'reason', null, 'message', null);
end;
$$;

-- `authenticated` only. `anon` is the role a request with no JWT arrives as,
-- and such a request has no `auth.uid()`, so it could only ever get the
-- 'signed out' refusal — there is no reason to let it ask. Guarded, as every
-- role-specific grant in this project is.
revoke all on function public.accept_workspace_invite(text) from public;
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.accept_workspace_invite(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.accept_workspace_invite(text) to authenticated;
  end if;
end
$migration$;

-- ── Knowing somebody ──────────────────────────────────────────────────────

/*
 * The friend graph. Symmetric, and stored once.
 *
 * The pair is ordered — `person_a` is always the smaller uuid — and a check
 * enforces it. Storing both directions would mean "a knows b" and "b knows a"
 * are two rows that can be deleted independently, and the first time they
 * disagree the app has to decide which one is the truth. There is no right
 * answer to that question, so the shape of the table refuses to ask it.
 */
create table if not exists public.connections (
  person_a   uuid not null references public.profiles(id) on delete cascade,
  person_b   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_a, person_b),
  constraint connections_ordered check (person_a < person_b)
);

-- The primary key indexes lookups by `person_a`. This is the other half: "who
-- do I know" has to be answerable from either side of the pair.
create index if not exists connections_b_idx on public.connections(person_b);

alter table public.connections enable row level security;

-- Reading and ending a connection are both yours to do, from either side.
-- Ending it needs no agreement: somebody who wants out of a connection does
-- not have to negotiate with the person they want out of.
drop policy if exists connections_mine on public.connections;
create policy connections_mine on public.connections
  for select using (person_a = auth.uid() or person_b = auth.uid());

drop policy if exists connections_end on public.connections;
create policy connections_end on public.connections
  for delete using (person_a = auth.uid() or person_b = auth.uid());

-- No insert policy and no update policy, on purpose — see the header. RLS
-- already refuses what has no policy; the revoke below is the second lock, so
-- that a future `grant all on all tables` cannot quietly open the door.

-- ── An open link to yourself ──────────────────────────────────────────────

create table if not exists public.connection_links (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  uses         integer not null default 0,
  -- One, by default, and this is the difference from a team link. You send a
  -- friend link to one person; a link that stays good after they have used it
  -- is a link that works for whoever they forward it to. Explicitly settable,
  -- because a link on a conference badge is a real thing somebody might want.
  max_uses     integer default 1 check (max_uses is null or max_uses > 0),
  created_at   timestamptz not null default now()
);

create index if not exists connection_links_owner_idx
  on public.connection_links(created_by, created_at desc);

alter table public.connection_links enable row level security;

-- Only yours, and only ever yours. Nobody looks up somebody else's link, and
-- as with invites there is no delete: revoking is an update, so the record of
-- what was handed out survives being turned off.
drop policy if exists connection_links_mine on public.connection_links;
create policy connection_links_mine on public.connection_links
  for select using (created_by = auth.uid());

drop policy if exists connection_links_make on public.connection_links;
create policy connection_links_make on public.connection_links
  for insert with check (created_by = auth.uid());

drop policy if exists connection_links_revoke on public.connection_links;
create policy connection_links_revoke on public.connection_links
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid());

/*
 * Follow a friend link. Same shape as the invite, same reasons.
 *
 *   { ok: true,  already: false, person_id, display_name,
 *     reason: null, message: null }
 *   { ok: false, already: false, person_id: null, display_name: null,
 *     reason: 'your own link', message: "that is your own link. …" }
 */
create or replace function public.accept_connection(token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me      uuid := auth.uid();
  link    public.connection_links%rowtype;
  them    uuid;
  name_of text;
  lo      uuid;
  hi      uuid;
  claimed integer;
begin
  if me is null then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'signed out',
      'message', 'you are not signed in. sign in, then open the link again.');
  end if;

  -- The same rule as joining a team, for the same reason: a connection to an
  -- identity that disappears with the browser cache is not a connection.
  if not public.is_real_account(me) then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'anonymous',
      'message', 'this browser is signed in anonymously, and an anonymous '
              || 'sign-in is lost as soon as the browser is cleared. make an '
              || 'account first, then open the link again.');
  end if;

  select * into link
    from public.connection_links
   where token_hash = sha256(convert_to(coalesce(token, ''), 'utf8'));

  if not found then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'no such link',
      'message', 'that link does not work. ask whoever sent it for a new one.');
  end if;

  them := link.created_by;

  -- Checked here, before expiry and before the use count, because this is a
  -- mistake rather than an attack: somebody has opened their own link to see
  -- what the other person will see, or pasted it back into the wrong window.
  -- Telling them "this link is used up" would be an answer to a question they
  -- did not ask. It costs the link nothing — no use is counted on this path.
  if them = me then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'your own link',
      'message', 'that is your own link. send it to somebody else — when they '
              || 'open it, you will both show up in each other''s people.');
  end if;

  lo := least(me, them);
  hi := greatest(me, them);

  select display_name into name_of from public.profiles where id = them;

  -- Ahead of the expiry and use checks, exactly as the invite does it: a
  -- second click on a one-use link is normally the same browser reloading.
  if exists (
    select 1 from public.connections c where c.person_a = lo and c.person_b = hi
  ) then
    return jsonb_build_object(
      'ok', true, 'already', true, 'person_id', them, 'display_name', name_of,
      'reason', null, 'message', null);
  end if;

  if link.revoked_at is not null then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'revoked',
      'message', 'this link was turned off. ask for a new one.');
  end if;

  if link.expires_at <= now() then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'expired',
      'message', 'this link has expired. ask for a new one.');
  end if;

  if link.max_uses is not null and link.uses >= link.max_uses then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'used up',
      'message', 'this link has already been used. ask for a new one.');
  end if;

  update public.connection_links l
     set uses = l.uses + 1
   where l.id = link.id
     and l.revoked_at is null
     and l.expires_at > now()
     and (l.max_uses is null or l.uses < l.max_uses);
  get diagnostics claimed = row_count;

  if claimed = 0 then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'used up',
      'message', 'this link has already been used. ask for a new one.');
  end if;

  insert into public.connections (person_a, person_b)
  values (lo, hi)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true, 'already', false, 'person_id', them, 'display_name', name_of,
    'reason', null, 'message', null);
end;
$$;

revoke all on function public.accept_connection(text) from public;
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.accept_connection(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.accept_connection(text) to authenticated;
  end if;
end
$migration$;

-- ── Being able to read a teammate's name ──────────────────────────────────

/*
 * Two lookups, as security definer functions, for the reason `is_member` is
 * one: a policy on `profiles` whose subquery reads `workspace_members` gets
 * that table's own policies applied inside it, and the shape of that is a
 * policy evaluating a policy on every row of every members query. Definer
 * functions make each one flat and indexed.
 *
 * `pg_temp` is spelled out, and last, for the same reason it is on the accept
 * functions: leave it off the list and Postgres still searches it — first —
 * for relations, so the pin would rest on nobody ever writing an unqualified
 * table name in these bodies, and a caller could answer the question with a
 * temp table of their own. Both of these sit on the `profiles` SELECT policy,
 * which is every profile read.
 */
create or replace function public.shares_a_workspace(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from public.workspace_members mine
      join public.workspace_members theirs
        on theirs.workspace_id = mine.workspace_id
     where mine.user_id = auth.uid()
       and theirs.user_id = other
  );
$$;

create or replace function public.is_connected_to(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.connections c
     where (c.person_a = auth.uid() and c.person_b = other)
        or (c.person_b = auth.uid() and c.person_a = other)
  );
$$;

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.shares_a_workspace(uuid) to authenticated;
    grant execute on function public.is_connected_to(uuid) to authenticated;
  end if;
end
$migration$;

/*
 * The live bug this fixes.
 *
 * `profiles_self` restricts SELECT to `id = auth.uid()`, so the members list
 * in `src/lib/admin/index.ts` — which asks PostgREST for
 * `workspace_members(..., profiles(display_name, is_anonymous))` — has been
 * getting null for every teammate. The team screen has been showing a list of
 * uuids belonging to people whose names the app knows perfectly well.
 *
 * `profiles_self` stays EXACTLY as it is, and this is a second policy rather
 * than a rewrite of it. Two reasons:
 *
 *   1. `profiles_self` is `for all`. It is what lets a person insert and
 *      update their own row, and its `with check (id = auth.uid())` is the
 *      only thing standing between anybody and writing somebody else's
 *      profile. Widening it to cover teammates would widen the write side
 *      with it, and a policy that lets you rename your teammates is a worse
 *      bug than the one being fixed.
 *
 *   2. Permissive policies are ORed. Adding a select-only policy widens
 *      exactly SELECT and touches nothing else, which is a change that can be
 *      read and reverted on its own.
 *
 * On what it exposes: Postgres policies choose rows, not columns, so this
 * makes the whole profile row readable to a teammate — and that row is
 * `display_name`, `is_anonymous`, and the timestamps, next to an `id` they
 * can already read out of `workspace_members`. `display_name` is the point;
 * `is_anonymous` is already shown deliberately on the members list, because
 * "never signed up" is a normal state here and pretending otherwise helps
 * nobody. THIS IS THE CONSTRAINT ON THE TABLE FROM NOW ON: `profiles` holds
 * nothing a teammate may not read. Anything private about a person belongs in
 * a table of its own with its own policy, not in a new column here.
 */
drop policy if exists profiles_people_you_know on public.profiles;
create policy profiles_people_you_know on public.profiles
  for select using (
    public.shares_a_workspace(id) or public.is_connected_to(id)
  );

-- ── Privileges ────────────────────────────────────────────────────────────
--
-- Policies decide which rows; grants decide whether the table can be reached
-- at all. Said out loud rather than left to Supabase's defaults — and the
-- revokes matter more than the grants here. `connections` must not be
-- insertable by a client under any circumstances, and Supabase's default
-- privileges hand out insert on every new table in `public`, so the grant it
-- would otherwise inherit is taken away explicitly.
--
-- Guarded, so a self-hosted Postgres without these roles still applies the
-- rest of the file.
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update on public.workspace_invites  to authenticated;
    grant select, insert, update on public.connection_links   to authenticated;
    grant select, delete         on public.connections        to authenticated;

    -- Deleting an invite would erase the fact that it existed; revoking it is
    -- an update. And nothing may write `connections` except the function.
    revoke delete on public.workspace_invites from authenticated;
    revoke delete on public.connection_links  from authenticated;
    revoke insert, update on public.connections from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.workspace_invites from anon;
    revoke all on public.connection_links  from anon;
    revoke all on public.connections       from anon;
  end if;
end
$migration$;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('workspace_invites', 'connections', 'connection_links')) as tables_there,
  (select count(*) from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('accept_workspace_invite', 'accept_connection',
                           'is_real_account', 'shares_a_workspace',
                           'is_connected_to'))                                    as functions_there,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'connections')                    as connection_policies,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'connections'
      and cmd in ('INSERT', 'UPDATE', 'ALL'))                                     as must_be_zero;

-- ── Handing a link out ────────────────────────────────────────────────────
--
-- The browser mints the token and stores only its hash; bytea goes over
-- PostgREST as a hex string.
--
--   const token = crypto.randomUUID() + crypto.randomUUID();
--   const bytes = new Uint8Array(
--     await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
--   const hex = "\\x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
--
--   await supabase.from("workspace_invites").insert({
--     workspace_id: ws, role: "editor", token_hash: hex,
--     expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
--   });
--
-- The URL carries `token`, which is now the only copy of it anywhere.
-- Revoking is `update workspace_invites set revoked_at = now() where id = …`,
-- and following the link is `supabase.rpc("accept_workspace_invite", { token })`.
