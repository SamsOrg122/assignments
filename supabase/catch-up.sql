-- ═══════════════════════════════════════════════════════════════════════
-- Everything, in one paste.
--
-- Run this once in the Supabase SQL editor and the database is fully up to
-- date with the app: the id fix, the self-check, notes, the agenda, team
-- agendas, daily tasks, dropped files, and the community. Every section is
-- idempotent — running it on a database that already has some or all of it
-- changes nothing and breaks nothing, so when in doubt, run it.
--
-- It is the migrations 0003 to 0009 concatenated, in order, verbatim. The
-- individual files remain the record of why each change exists.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── from 0003-ids-the-client-can-actually-make.sql ────────────────────

-- Every save has been failing, and the error said so plainly:
--
--     invalid input syntax for type uuid: "0k62j7egfx"
--
-- `projects.id` is a `uuid`. The client's ids are not uuids and never were —
-- `uid()` in `src/lib/factories.ts` is `nanoid(10)`, which is what a project
-- has been carrying since long before there was a database. So every upsert
-- was rejected at the type check, the local copy stayed the only copy, and
-- the Library said "1 project is in this browser only" — which was true, and
-- was the only part of this that behaved.
--
-- Which side moves?
--
-- Not the client. The id is minted the moment somebody makes a document,
-- which is offline, before any account exists, and it is already written into
-- every share link that has been handed out, every folder, every label and
-- every comment thread. Switching the app to uuids would orphan all of that
-- to satisfy a column type. And an id that a local-first app cannot mint for
-- itself is the wrong id: `gen_random_uuid()` needs a database, and the whole
-- premise here is that the database is optional.
--
-- So the column moves. Nothing has a foreign key onto `projects(id)`, and no
-- view or policy reads it, so this is contained: one type change, one
-- constraint, and the primary key index rebuilt by Postgres.
--
-- Safe to run twice, and safe to run on a table that already has rows: uuids
-- cast to text without loss and keep matching the constraint, so a row
-- written before this migration is still found by an id read after it.

begin;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'projects'
       and column_name  = 'id'
       and data_type    = 'uuid'
  ) then
    -- The default has to go first: `gen_random_uuid()` is a uuid expression
    -- and would block the type change.
    alter table public.projects alter column id drop default;
    alter table public.projects alter column id type text using id::text;
    -- Kept so a row inserted server-side — a fixture, a support script, a
    -- template copy — still gets an id without having to invent one.
    alter table public.projects alter column id set default gen_random_uuid()::text;
  end if;
end $$;

-- Losing the uuid type loses its validation, so put a shape back. This accepts
-- both what the client makes (nanoid: 10 characters of A-Za-z0-9_-) and what a
-- uuid looks like (36 characters, hex and dashes), which is what makes the
-- migration safe for existing rows.
--
-- The point is not tidiness. An id ends up in a URL and in a share link, and a
-- column that accepts anything is a column that accepts a newline, a slash, or
-- ten kilobytes of someone else's idea of a joke.
alter table public.projects drop constraint if exists projects_id_shape;
alter table public.projects
  add constraint projects_id_shape
  check (id ~ '^[A-Za-z0-9_-]{8,64}$');

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Run this after the migration. It writes a project with a real client-shaped
-- id and reads it back, then removes it. If the first insert errors, the
-- migration did not take; if it returns a row, saving works.
--
-- Uses your own account and your own workspace, so it also proves the policy
-- lets you write — which is the other half of "my work is not landing".

-- do $$
-- declare
--   me   uuid := auth.uid();
--   ws   uuid;
--   got  text;
-- begin
--   select workspace_id into ws from public.workspace_members where user_id = me limit 1;
--   if ws is null then
--     raise exception 'no workspace for %, run migration 0002 first', me;
--   end if;
--
--   insert into public.projects (id, workspace_id, owner_id, name, kind, content, revision)
--   values ('0k62j7egfx', ws, me, 'Migration proof', 'doc', '{}'::jsonb, 1);
--
--   select id into got from public.projects where id = '0k62j7egfx';
--   raise notice 'wrote and read back: %', got;
--
--   delete from public.projects where id = '0k62j7egfx';
-- end $$;

select
  (select data_type
     from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'id')
    as project_id_type,
  (select count(*) from public.projects where deleted_at is null)
    as projects_that_survived;


-- ─── from 0004-let-the-app-check-its-own-database.sql ────────────────────

-- The uuid bug was not found by the app. It was found by a user reading an
-- error message, weeks after every save had started failing — and the app's
-- own Settings check said "the projects table is there and readable" the
-- whole time. It was: reading worked perfectly. Nothing ever tried to write.
--
-- So this adds the one thing that would have caught it on day one: a way for
-- the app to ask the database what shape it actually has, and compare that to
-- the shape the app was written against.
--
-- Why a function rather than a query. PostgREST only exposes the schemas it
-- is told to, and `information_schema` is not one of them — a browser cannot
-- ask what type a column is. So the question is answered here, once, by a
-- function that takes no arguments, writes nothing, and returns only metadata
-- about a fixed list of tables. That metadata is not a secret: PostgREST
-- already publishes every column name of every exposed table to anyone who
-- asks it for an OPTIONS. What is not published, and what matters, is the
-- *types* — which is precisely where the app and the database drifted apart.

begin;

create or replace function public.schema_report()
returns jsonb
language sql
stable
security definer
-- Pinned, because a security definer function that resolves names through the
-- caller's search_path can be pointed at tables the caller made.
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'columns', (
      select jsonb_object_agg(t, cols)
        from (
          select c.table_name as t,
                 jsonb_object_agg(c.column_name, c.data_type) as cols
            from information_schema.columns c
           where c.table_schema = 'public'
             -- A fixed list. Not "every table": this answers a question about
             -- the app's own writes, and a function that enumerates whatever
             -- happens to be in the schema tells a stranger more than it
             -- tells the app.
             and c.table_name in ('projects', 'workspaces', 'workspace_members', 'profiles')
           group by c.table_name
        ) per_table
    ),
    'rls', (
      select jsonb_object_agg(cl.relname, cl.relrowsecurity)
        from pg_class cl
        join pg_namespace n on n.oid = cl.relnamespace
       where n.nspname = 'public'
         and cl.relname in ('projects', 'workspaces', 'workspace_members', 'profiles')
    ),
    -- Which migrations have visibly been applied, inferred from what they
    -- left behind rather than from a table somebody has to remember to write
    -- to. A version number that is maintained by hand is a version number
    -- that is wrong.
    'applied', jsonb_build_object(
      '0002', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'handle_new_user'
      ),
      '0003', exists (
        select 1 from pg_constraint
         where conname = 'projects_id_shape'
           and conrelid = 'public.projects'::regclass
      )
    )
  );
$$;

comment on function public.schema_report() is
  'Read-only description of the tables the app writes to, so the app can tell '
  'the user when the deployed schema and the code have drifted apart. Added '
  'after a uuid/text mismatch on projects.id silently rejected every save.';

-- Both roles, deliberately: somebody debugging a deployment where anonymous
-- sign-in is switched off has no session at all, and that is exactly when
-- they need this answer most.
--
-- Guarded because these two roles are Supabase's, not Postgres'. On a
-- self-hosted database without them, an unguarded grant fails the whole
-- migration over a role that was never going to be used there.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.schema_report() to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.schema_report() to authenticated;
  end if;
end $$;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- `projects_id_type` must read `text`. If it says `uuid`, migration 0003 has
-- not been run on this database and nothing anybody writes is being saved.

select
  jsonb_pretty(public.schema_report() -> 'applied')             as migrations_applied,
  public.schema_report() #>> '{columns,projects,id}'            as projects_id_type;


-- ─── from 0005-notes-that-follow-you.sql ────────────────────

-- A place for the desktop app's notes.
--
-- Deliberately not `projects`. A sticky note is a few hundred bytes written
-- every eight hundred milliseconds; a project row carries blocks, board
-- items, typography, sources and a search index, and pushing all of that over
-- the wire for a changed word would be silly. Two tables, each shaped like
-- what it holds.
--
-- The id is `text` with the same constraint `projects.id` now has, and for
-- the same reason: the note is written on a laptop, offline, before anything
-- has asked the database's opinion. A column that only accepts ids the
-- database itself minted is a column that cannot hold a note taken on a
-- train. That mistake has already been made once here — see migration 0003.

begin;

create table if not exists public.notes (
  id         text primary key
             check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- Defaulted from the session, so the client never sends it and cannot get
  -- it wrong. The policy below checks it anyway: a default is a convenience,
  -- not a guard.
  owner_id   uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  body       text not null default '',
  -- The client's clock, not the server's. Last-write-wins compares these two
  -- machines' idea of when, and a server timestamp would make every push look
  -- newer than everything it is being compared against.
  updated_at timestamptz not null,
  -- A tombstone. A row that is simply gone cannot be told from one this
  -- device has never seen, and resolving that wrongly deletes a note that
  -- somebody still wanted.
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notes_owner_idx
  on public.notes(owner_id, updated_at desc);

-- Live notes only, which is what every list asks for.
create index if not exists notes_live_idx
  on public.notes(owner_id, updated_at desc)
  where deleted_at is null;

alter table public.notes enable row level security;

-- Yours and only yours. Notes are not shared, have no workspace, and are not
-- part of anybody's team — so the policy is the simplest one in this schema,
-- and that is a feature. Every clause here is a clause that could be wrong.
drop policy if exists notes_own on public.notes;
create policy notes_own on public.notes
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Run this signed in as yourself. It writes a note the way the desktop app
-- does — a ten-character id it made up, and its own timestamp — reads it back
-- and removes it. If the insert fails, the app cannot sync.

-- insert into public.notes (id, body, updated_at)
-- values ('Pr0beAbcD-', 'from the SQL editor', now());
--
-- select id, body, updated_at from public.notes where id = 'Pr0beAbcD-';
--
-- delete from public.notes where id = 'Pr0beAbcD-';

select
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'id')
    as note_id_type,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notes')
    as policies,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notes')
    as row_level_security;


-- ─── from 0006-an-agenda-of-your-own.sql ────────────────────

-- Where agenda events live.
--
-- Same shape and same reasoning as `notes` (migration 0005): a separate,
-- narrow table rather than a project row, an id the client mints offline,
-- the client's own clock in `updated_at` because last-write-wins compares two
-- machines' idea of when, and a tombstone because a row that is simply gone
-- cannot be told from one the other machine has never seen.
--
-- One choice of its own: the day is a date and the times are minutes from
-- midnight, not timestamps. A lecture at 09:30 is at 09:30 — the wall-clock
-- time is the fact. Stored as instants, everybody's timetable would shift the
-- first time they crossed a timezone or the clocks changed.

begin;

create table if not exists public.events (
  id           text primary key
               check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id     uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  title        text not null default '',
  day          date not null,
  start_minute integer not null check (start_minute between 0 and 1440),
  end_minute   integer not null check (end_minute between 0 and 1440),
  color        text not null default 'slate'
               check (color in ('slate', 'red', 'gold', 'blue', 'green', 'purple')),
  location     text,
  notes        text,
  repeat       text not null default 'none'
               check (repeat in ('none', 'weekly')),
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),

  -- An event that ends before it starts is not an event; refusing it here
  -- means a client bug becomes an error somebody sees rather than a block
  -- that renders upside down.
  check (end_minute > start_minute)
);

create index if not exists events_owner_idx
  on public.events(owner_id, day);

create index if not exists events_live_idx
  on public.events(owner_id, day)
  where deleted_at is null;

alter table public.events enable row level security;

drop policy if exists events_own on public.events;
create policy events_own on public.events
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'id')
    as event_id_type,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events')
    as policies,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'events')
    as row_level_security;


-- ─── from 0007-team-agendas-and-daily-tasks.sql ────────────────────

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


-- ─── from 0008-files-that-follow-you.sql ────────────────────

-- Where dropped files land in the account.
--
-- The desktop note takes any file dropped on it; this is where those files
-- go, so they are in the library on every machine rather than trapped on the
-- one that caught the drop. Same discipline as notes and events: client
-- text ids, client clocks, tombstones, owner-only.
--
-- The bytes are base64 in a text column, capped. Postgres holds blobs of
-- this size without complaint, and the alternative — object storage — brings
-- buckets, storage policies and a second API for what is, at an 8 MB cap, a
-- table. When someone drops videos, storage is the upgrade; the cap is what
-- keeps that decision honest instead of accidental.

begin;

create table if not exists public.kit_files (
  id          text primary key
              check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id    uuid not null default auth.uid()
              references public.profiles(id) on delete cascade,
  name        text not null,
  mime        text not null default '',
  size        integer not null check (size > 0),
  -- Base64 of the bytes. The cap is ~8 MB of raw file, encoded; the desktop
  -- app refuses bigger files at the drop, where the person can see it, and
  -- this check is the backstop for any other client.
  content_b64 text not null check (length(content_b64) <= 12000000),
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists kit_files_owner_idx
  on public.kit_files(owner_id, updated_at desc);

alter table public.kit_files enable row level security;

drop policy if exists kit_files_own on public.kit_files;
create policy kit_files_own on public.kit_files
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables where table_name = 'kit_files') as table_there,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'kit_files') as locked;


-- ─── from 0009-a-commons.sql ────────────────────

begin;

create table if not exists public.community_posts (
  id          text primary key
              check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  author_id   uuid not null default auth.uid()
              references public.profiles(id) on delete cascade,
  -- Chosen at posting time, stored denormalized: profiles are private to
  -- their owner under RLS, so a join would show everyone else "somebody".
  author_name text not null default ''
              check (length(author_name) <= 60),
  kind        text not null
              check (kind in ('idea', 'design', 'template')),
  title       text not null
              check (length(title) between 1 and 120),
  body        text not null default ''
              check (length(body) <= 4000),
  -- design: {backdrop, accent?} — template: {project} — idea: {}.
  -- Capped because a template carries blocks and somebody will eventually
  -- paste a book into one. 400KB holds any honest template.
  payload     jsonb not null default '{}'::jsonb
              check (pg_column_size(payload) <= 400000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists community_posts_live_idx
  on public.community_posts(created_at desc)
  where deleted_at is null;

alter table public.community_posts enable row level security;

drop policy if exists community_read on public.community_posts;
create policy community_read on public.community_posts
  -- The author still sees their own retired posts. Not generosity: Postgres
  -- checks an UPDATE's new row against the SELECT policy too, so an author
  -- whose tombstone made the row invisible to themselves would be refused
  -- the very update that sets it. Everyone else never sees a tombstone.
  for select using (deleted_at is null or author_id = auth.uid());

drop policy if exists community_write_own on public.community_posts;
create policy community_write_own on public.community_posts
  for insert with check (author_id = auth.uid());

-- Update exists solely to set the tombstone (and lets an author edit their
-- own words, which costs nothing to allow).
drop policy if exists community_update_own on public.community_posts;
create policy community_update_own on public.community_posts
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Hearts. A row is a heart; the pair is the primary key, so a second heart
-- from the same person is a constraint violation rather than a counter bug.
create table if not exists public.community_hearts (
  post_id    text not null
             references public.community_posts(id) on delete cascade,
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_hearts enable row level security;

drop policy if exists hearts_read on public.community_hearts;
create policy hearts_read on public.community_hearts
  for select using (true);

drop policy if exists hearts_give on public.community_hearts;
create policy hearts_give on public.community_hearts
  for insert with check (user_id = auth.uid());

drop policy if exists hearts_take_back on public.community_hearts;
create policy hearts_take_back on public.community_hearts
  for delete using (user_id = auth.uid());

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_name in ('community_posts', 'community_hearts'))       as tables_there,
  (select count(*) from pg_policies
    where tablename in ('community_posts', 'community_hearts'))        as policies,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'community_posts')      as posts_locked;
