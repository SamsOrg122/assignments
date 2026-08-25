-- An assignment: a deadline, a document, and whether it has been handed in.
--
-- The tool is full of documents and full of dates, and until now the two
-- knew nothing about each other. Somebody writing an essay had the essay in
-- the library and "essay due Friday" as a task on the agenda, and kept the
-- connection between them in their head — which is exactly the thing that
-- fails in week eleven.
--
-- Not a column on `agenda_tasks`, for the reason 0007 gave for splitting
-- tasks off events in the first place: a task is done or not, an assignment
-- moves through being started, being written and being handed in, and it has
-- a document attached to it. One table with three moods means every reader
-- has to keep telling them apart.
--
-- `project_id` is deliberately plain text with no foreign key. Projects live
-- in `projects`, but a project can be local-only — the whole app works signed
-- out, and a document made offline has no row anywhere yet. A constraint here
-- would refuse the assignment because its document has not been uploaded,
-- which is the wrong thing to be strict about.

begin;

create table if not exists public.assignments (
  id           text primary key
               check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id     uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title        text not null default '',
  course       text,
  due          date not null,
  due_minute   int check (due_minute is null or (due_minute >= 0 and due_minute < 1440)),
  status       text not null default 'todo'
               check (status in ('todo', 'doing', 'handed')),
  project_id   text,
  notes        text,
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- What every read asks for: my assignments, by when they are due.
create index if not exists assignments_owner_idx
  on public.assignments(owner_id, due);

create index if not exists assignments_workspace_idx
  on public.assignments(workspace_id, due)
  where workspace_id is not null;

alter table public.assignments enable row level security;

-- Personal stays owner-only; a team's assignments are the team's, to read
-- and to change — a group project where only the person who typed it in can
-- move it to "handed in" is a noticeboard, not a shared deadline.
drop policy if exists assignments_own on public.assignments;
create policy assignments_own on public.assignments
  for all
  using (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  )
  with check (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  );

-- The policy decides who sees what; the grant decides whether the table is
-- reachable at all. Supabase's default privileges usually hand this out, but
-- "usually" is not a thing to build a deadline on — 0001 and 0010 say it out
-- loud for the same reason, guarded so a self-hosted database without these
-- roles still applies the file.
--
-- `authenticated` and not `anon`: every session this app makes is signed in,
-- including the anonymous ones the free plan runs on, which carry a real JWT.
-- A request with no token has no `auth.uid()` and so could match no row here
-- anyway; leaving `anon` out means it cannot even ask.
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.assignments to authenticated;
  end if;
end
$migration$;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_name = 'assignments')                              as table_there,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'assignments')      as locked,
  (select count(*) from pg_policies
    where tablename = 'assignments')                               as policies;
