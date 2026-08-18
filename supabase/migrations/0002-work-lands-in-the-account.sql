-- ═══════════════════════════════════════════════════════════════════════════
-- Make sure signed-in work has somewhere to land — and prove it.
--
-- Safe to run as many times as you like, on a database that has had every
-- earlier script run or only some of them. Nothing here deletes anything.
--
-- WHAT WAS WRONG
--
-- A project row needs a workspace: `projects.workspace_id` is `not null` and
-- points at `workspaces`. Signing up created a *profile* and nothing else, so
-- the workspace was the browser's job — it looked for one and made one if it
-- found none. That works right up until the moment it doesn't: a request that
-- fails, a policy that refuses, a tab closed halfway through. And when it
-- doesn't, the account exists, the sign-in works, and every attempt to save a
-- document fails on a foreign key — which reads to the person as "my work is
-- only in the browser", because that is exactly what it then is.
--
-- Somewhere to put your work is not a thing a client should have to get right.
-- After this it is the database's job, it happens inside the same transaction
-- that creates the account, and no code path can skip it.
--
-- HOW TO RUN IT
--   Supabase dashboard → SQL Editor → paste the whole file → Run.
--   The last statement prints a row per account. Read it; it is the point.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. A new account gets a profile *and* a workspace ─────────────────────
--
-- `security definer` because it runs against `auth.users`, which the caller
-- has no rights on. `on conflict do nothing` throughout so that re-running,
-- or a client that got there first, is not an error.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  insert into public.profiles (id, display_name, is_anonymous)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    new.email is null
  )
  on conflict (id) do nothing;

  -- The part that was missing. One workspace per account, made here so that
  -- the first document has somewhere to go before the browser asks.
  select w.id into ws from public.workspaces w where w.owner_id = new.id limit 1;
  if ws is null then
    insert into public.workspaces (owner_id, name)
    values (new.id, 'My workspace')
    returning id into ws;
  end if;

  -- `add_owner_as_member` covers this on insert; repeated here so an existing
  -- workspace without a membership row is repaired rather than left half-made.
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, new.id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Repair every account that already exists ───────────────────────────
--
-- Anyone who signed up before the above, including you. Three passes, each
-- one only filling in what is absent.

-- A profile for every account.
insert into public.profiles (id, display_name, is_anonymous)
select u.id,
       nullif(u.raw_user_meta_data ->> 'display_name', ''),
       u.email is null
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- A workspace for every account that has none.
insert into public.workspaces (owner_id, name)
select p.id, 'My workspace'
from public.profiles p
where not exists (
  select 1 from public.workspaces w where w.owner_id = p.id
);

-- A membership row for every workspace owner missing one.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_id, 'owner'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members m
  where m.workspace_id = w.id and m.user_id = w.owner_id
)
on conflict do nothing;

-- ── 3. Re-assert the rules that decide whether a save is allowed ──────────
--
-- Idempotent, and here because a half-run earlier script leaves a policy
-- missing — and a missing policy on a table with row level security switched
-- on is not "everything allowed", it is "nothing allowed". A save then fails
-- with a permissions error the browser reports as a sync problem.

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists workspaces_member on public.workspaces;
create policy workspaces_member on public.workspaces
  for all using (owner_id = auth.uid() or public.is_member(id))
  with check (owner_id = auth.uid());

drop policy if exists members_visible on public.workspace_members;
create policy members_visible on public.workspace_members
  for select using (public.is_member(workspace_id));

drop policy if exists members_managed_by_owner on public.workspace_members;
create policy members_managed_by_owner on public.workspace_members
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists projects_member on public.projects;
create policy projects_member on public.projects
  for all using (public.is_member(workspace_id) or owner_id = auth.uid())
  with check (public.is_member(workspace_id) or public.owns_workspace(workspace_id));

commit;

-- ── 4. The proof ──────────────────────────────────────────────────────────
--
-- One row per account. Read `ready` first: `yes` means a document saved from
-- that account now has somewhere to land. `projects` is how many are actually
-- up here — if that is 0 while the app shows work on screen, the work is still
-- only in that browser and the app's own check in Settings will say why.

select
  u.email,
  case when u.email is null then 'anonymous' else 'account' end as kind,
  (p.id is not null)                                            as has_profile,
  (w.id is not null)                                            as has_workspace,
  case when p.id is not null and w.id is not null then 'yes' else 'NO' end as ready,
  coalesce(counts.live, 0)                                      as projects,
  counts.last_saved
from auth.users u
left join public.profiles   p on p.id = u.id
left join lateral (
  select w2.id from public.workspaces w2 where w2.owner_id = u.id limit 1
) w on true
left join lateral (
  select count(*) filter (where pr.deleted_at is null) as live,
         max(pr.updated_at)                            as last_saved
  from public.projects pr
  where pr.owner_id = u.id
) counts on true
order by u.created_at desc;
