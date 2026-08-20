-- Two agendas per person, and things to do without a time.
--
-- Events gain a `workspace_id`. Null means personal — owner-only, exactly as
-- before. Set, it means the event is the team's: every member of that
-- workspace can see it and change it, because a team calendar where only the
-- author can move the meeting is a noticeboard, not a calendar.
--
-- Tasks are their own table rather than events with no duration: a task has
-- a `done` state and no times, an event has times and no done state, and one
-- table with two moods means every reader has to keep telling them apart.

begin;

alter table public.events
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade;

create index if not exists events_workspace_idx
  on public.events(workspace_id, day)
  where workspace_id is not null;

-- Personal stays owner-only; team is member read *and* write.
drop policy if exists events_own on public.events;
create policy events_own on public.events
  for all
  using (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  )
  with check (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  );

create table if not exists public.agenda_tasks (
  id           text primary key
               check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id     uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title        text not null default '',
  day          date not null,
  done         boolean not null default false,
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists agenda_tasks_owner_idx
  on public.agenda_tasks(owner_id, day);

alter table public.agenda_tasks enable row level security;

drop policy if exists agenda_tasks_own on public.agenda_tasks;
create policy agenda_tasks_own on public.agenda_tasks
  for all
  using (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  )
  with check (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  );

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_name = 'events' and column_name = 'workspace_id')  as events_have_workspace,
  (select count(*) from information_schema.tables
    where table_name = 'agenda_tasks')                             as tasks_table,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'agenda_tasks')     as tasks_locked;
