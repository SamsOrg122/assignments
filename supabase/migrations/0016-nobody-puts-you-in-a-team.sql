-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — nobody puts you in a team but you
--
-- 0015 gave this app real invitations, and in doing so it made an old hole
-- worth something. `members_managed_by_owner` was written `for all using
-- (you own the workspace)` with no `with check` at all, and `authenticated`
-- holds insert on the table — so anybody could write any user id into their
-- own workspace's membership list. Before 0015 that bought them nothing:
-- profiles_self meant they still could not read the person. After 0015,
-- `profiles_people_you_know` lets a member read the display_name of anybody
-- they share a workspace with. Put together, that is: know somebody's uuid,
-- insert a row, read their name. No token, no expiry, no revocation, none of
-- the machinery 0015 built.
--
-- Proved on a database built from schema.sql + catch-up.sql + 0015: as
-- `authenticated` with a stranger's uuid, the insert succeeds and their name
-- comes back on the next select. Zero rows before, one after.
--
-- The fix is not a better `with check`. It is that a client has no business
-- inserting a membership at all. There are exactly two legitimate writers and
-- both are `security definer`, so both are unaffected by a revoke aimed at
-- `authenticated`:
--
--   add_owner_as_member()      the trigger that files the owner on creation
--   accept_workspace_invite()  somebody following a link, of their own accord
--
-- Nothing in the app has ever inserted one from the browser — all five client
-- calls against this table are selects — so this costs no feature.
--
-- Update survives, narrowed to the one column it is for. An owner changing
-- somebody's role is ordinary; an owner rewriting `user_id` to a stranger is
-- the same attack through a different verb, and a `with check` on
-- workspace_id would not have stopped it, because the row never leaves the
-- workspace. A column grant does.
--
-- Also here, because it is the same class of thing: eight `security definer`
-- functions that predate 0015 pin `search_path` without `pg_temp`. Leaving it
-- off does not take pg_temp out of the search — it leaves it searched first,
-- implicitly, for relations. Nothing is exploitable today because every body
-- is schema-qualified, which is precisely the argument that is one careless
-- edit from being false. Two of these, `is_member` and `has_role`, are on the
-- policies 0015 added.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A membership is something you accept, not something you are given ──────

drop policy if exists members_managed_by_owner on public.workspace_members;

-- Role changes, and nothing else. `with check` as well as `using`, so a row
-- cannot be updated out of a workspace you own into one you do not.
drop policy if exists members_role_set_by_owner on public.workspace_members;
create policy members_role_set_by_owner on public.workspace_members
  for update
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

-- Removing somebody from a workspace you own is legitimate and takes nothing
-- from them that they did not give: the row is the membership.
drop policy if exists members_removed_by_owner on public.workspace_members;
create policy members_removed_by_owner on public.workspace_members
  for delete
  using (public.owns_workspace(workspace_id));

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Insert is gone entirely. The two definer writers are unaffected.
    revoke insert on public.workspace_members from authenticated;
    -- Update narrowed to `role`. Re-granted from nothing rather than
    -- subtracted from the table-wide grant, because a later `grant update on
    -- ... to authenticated` anywhere would silently restore the wide one.
    revoke update on public.workspace_members from authenticated;
    grant update (role) on public.workspace_members to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update on public.workspace_members from anon;
  end if;
end
$migration$;

-- ── The rest of the search_path pins ───────────────────────────────────────
--
-- Bodies unchanged; only the pin, so `alter function` rather than a re-created
-- definition — copying eight bodies into this file to change one setting on
-- each is eight chances to paste a stale one. The signatures are spelled out
-- because that is what `alter function` matches on, and a wrong one RAISES
-- (`function public.is_member(text) does not exist`), which under
-- ON_ERROR_STOP takes the whole paste down rather than quietly skipping. That
-- is the behaviour to want here: a pin that silently did not happen is
-- indistinguishable from one that did.

alter function public.is_member(uuid) set search_path = public, auth, pg_temp;
alter function public.has_role(uuid, text) set search_path = public, auth, pg_temp;
alter function public.owns_workspace(uuid) set search_path = public, auth, pg_temp;
alter function public.handle_new_user() set search_path = public, auth, pg_temp;
alter function public.add_owner_as_member() set search_path = public, auth, pg_temp;

-- These two are maintenance, called by the retention job rather than by a
-- policy, and they take the same treatment for the same reason.
do $migration$
begin
  if to_regprocedure('public.purge_preview(uuid)') is not null then
    execute 'alter function public.purge_preview(uuid) set search_path = public, auth, pg_temp';
  end if;
  if to_regprocedure('public.purge_expired(uuid)') is not null then
    execute 'alter function public.purge_expired(uuid) set search_path = public, auth, pg_temp';
  end if;
  -- schema_report reads pg_catalog on purpose and keeps it first; it only
  -- gains pg_temp.
  if to_regprocedure('public.schema_report()') is not null then
    execute 'alter function public.schema_report() set search_path = pg_catalog, public, pg_temp';
  end if;
end
$migration$;

-- ── The account test must not depend on a column we do not own ─────────────
--
-- `is_real_account` read `auth.users.is_anonymous` directly. That column
-- arrived with Supabase's anonymous sign-in and is not in every project's
-- auth schema — and plpgsql resolves a column reference when the function
-- RUNS, not when it is created, so on a project without it the function does
-- not refuse an anonymous caller, it raises "column u.is_anonymous does not
-- exist" and takes the whole invitation down with it. Found by pointing the
-- test harness at an auth schema that predates the column.
--
-- `to_jsonb(u) ->> 'is_anonymous'` asks the same question of whatever columns
-- the row actually has, and answers null instead of raising when there is no
-- such column. That null is then the right answer anyway: a project with no
-- anonymous sign-in has no anonymous users.
--
-- The email test carries the weight either way, and it is the one that cannot
-- go stale — Supabase's anonymous users have no email, by construction.

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
  select u.email is not null
     and u.email <> ''
     and coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) is not true
    into genuine
    from auth.users u
   where u.id = who;
  return coalesce(genuine, false);
end;
$$;

do $migration$
begin
  revoke all on function public.is_real_account(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.is_real_account(uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.is_real_account(uuid) from anon;
  end if;
end
$migration$;
