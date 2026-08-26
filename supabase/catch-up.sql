-- ═══════════════════════════════════════════════════════════════════════
-- Everything, in one paste.
--
-- Run this once in the Supabase SQL editor and the database is fully up to
-- date with the app: the id fix, the self-check, notes, the agenda, team
-- agendas, daily tasks, dropped files, the community, the spend ceiling, a
-- way out, the payment write path, assignments, study sets, and the invite
-- and friend links that let a second person into a workspace — and then the
-- consent fix that stops a workspace owner putting somebody in a team who
-- never asked to be in one. Every section is idempotent — running it on a
-- database that already has some or all of it changes nothing and breaks
-- nothing, so when in doubt, run it.
--
-- It is the migrations 0003 to 0016 concatenated, in order, verbatim; the
-- only line here that is not in one of those files is the proof select at
-- the very end, because 0016 is the one migration that ends without one. The
-- individual files remain the record of why each change exists.
--
-- Two things it deliberately does NOT do, because neither can be written
-- down in a file:
--
--   * Set the webhook's secret. That is one call with a value only you have:
--         select public.set_billing_secret('<32+ random characters>');
--     and the same value goes in the deployment as STRIPE_HOOK_DB_SECRET.
--     Skip it if you are not taking payments; nothing else needs it.
--
--   * Anything from `schema.sql`, `0001` or `0002`. Those built the account
--     era and are assumed to be in place. `check.sql` says whether they are.
-- ═══════════════════════════════════════════════════════════════════════


-- ─── from 0003-ids-the-client-can-actually-make.sql ───────────────

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


-- ─── from 0004-let-the-app-check-its-own-database.sql ─────────────

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


-- ─── from 0005-notes-that-follow-you.sql ──────────────────────────

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


-- ─── from 0006-an-agenda-of-your-own.sql ──────────────────────────

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


-- ─── from 0007-team-agendas-and-daily-tasks.sql ───────────────────

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


-- ─── from 0008-files-that-follow-you.sql ──────────────────────────

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


-- ─── from 0009-a-commons.sql ──────────────────────────────────────

-- The commons: what people choose to share with everyone.
--
-- Three kinds of post, one table. An *idea* is words. A *design* carries a
-- project's look — backdrop and accent — so somebody else can put their
-- document on the same page. A *template* carries a project's structure, so
-- somebody can start from it. One table rather than three because they are
-- the same social object — authored, titled, hearted, deletable by their
-- author — and the payload column holds whichever shape the kind implies.
--
-- Visibility is the point, so the read policy is the widest in this schema:
-- every signed-in account (anonymous ones included — that is the free plan)
-- reads every live post. Writing stays yours: you insert as yourself, you
-- can retire only your own, and deletion is the same tombstone everything
-- else here uses — except the policy hides tombstoned posts outright, so
-- "deleted" and "gone" look identical to every other account.
--
-- What is deliberately absent: moderation queues, follower graphs, comment
-- threads. A commons for a small product starts as a pinboard, not a social
-- network; every absent feature is one that cannot be abused yet.

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


-- ─── from 0010-a-ceiling-on-the-model.sql ─────────────────────────

-- A ceiling on what one account can spend of somebody else's money.
--
-- `/api/ai` and `/api/assist` both call a paid model. Until now the only
-- thing between a stranger and that budget was a counter in one Node
-- process's memory: it resets on every deploy, it is per-instance on
-- serverless, and it is keyed on an address a botnet has thousands of. The
-- file that implements it says so out loud. This is the ceiling that
-- survives all three.
--
-- ── WHY A FUNCTION AND NOT A TABLE THE CLIENT WRITES ─────────────────────
-- This project has no service-role key, deliberately: nothing anywhere holds
-- a credential that can read every row. So the server has no identity of its
-- own to record usage with — it acts as the caller, using the token the
-- caller sent.
--
-- That creates the obvious hole: if the counter were an ordinary table with
-- an owner policy, the person being counted could update their own row back
-- to zero. `security definer` closes it. The table has row-level security on
-- and *no* write policies at all, so no client can touch it directly; the
-- only way in is this function, which does one thing — add one — and hands
-- back the new total. Reading your own usage is allowed, because a ceiling
-- somebody cannot see is a ceiling they will only meet as a mysterious
-- refusal.
--
-- ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
-- Proof of personhood. The free plan runs on anonymous accounts, and anyone
-- willing to clear their browser gets a fresh one and a fresh allowance. It
-- raises the cost of abuse from "a for-loop" to "a loop that also has to mint
-- accounts", which is worth having and is not the last line. The last line is
-- a spend limit on the OpenRouter key itself, which no code in this
-- repository can set.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.ai_usage (
  owner_id uuid not null
           references public.profiles(id) on delete cascade,
  -- A calendar day in UTC. Not a rolling window: a rolling window needs every
  -- request's timestamp kept, and this needs one integer per person per day.
  day      date not null default (now() at time zone 'utc')::date,
  spent    integer not null default 0 check (spent >= 0),
  primary key (owner_id, day)
);

alter table public.ai_usage enable row level security;

-- You may see your own usage. Nobody may write it — see the header.
drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage
  for select
  using (owner_id = auth.uid());

/*
 * And the same thing again at the grant level, deliberately.
 *
 * "There is no write policy, so nobody can write" is true only while nobody
 * adds one. Supabase also hands `anon` and `authenticated` table privileges
 * on new public tables by default, so the absence of a policy is the *only*
 * thing standing here — one `create policy` in a later migration, written by
 * somebody who has not read this file, and the counter becomes resettable by
 * the person being counted.
 *
 * Taking the privilege away as well means such a policy would still not be
 * enough. Two independent things now have to be undone to open this, and
 * neither can be done by accident.
 */
revoke insert, update, delete, truncate on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

/*
 * Charge one request to today, and say where that leaves you.
 *
 * Returns the total *after* charging and whether it was within the
 * allowance, so the caller does one round trip rather than read-then-write —
 * two statements would let two concurrent requests both read 99 and both
 * proceed. The upsert is atomic, so the number handed back is the real one.
 *
 * The allowance is passed in rather than stored, so it stays configurable
 * from the deployment without a migration. It is clamped: a caller cannot ask
 * for a ceiling of two billion.
 */
create or replace function public.ai_spend(allowance integer)
returns table (spent integer, allowed boolean)
language plpgsql
security definer
-- Pinned, so a caller cannot put their own `now()` or their own table in
-- front of the ones this function means. A security-definer function without
-- this is the standard way to hand out the owner's rights by accident.
set search_path = public, pg_temp
as $$
declare
  who   uuid := auth.uid();
  cap   integer := least(greatest(coalesce(allowance, 0), 0), 10000);
  total integer;
begin
  if who is null then
    raise exception 'ai_spend requires a signed-in caller';
  end if;

  insert into public.ai_usage (owner_id, day, spent)
  values (who, (now() at time zone 'utc')::date, 1)
  on conflict (owner_id, day)
    do update set spent = public.ai_usage.spent + 1
  returning public.ai_usage.spent into total;

  return query select total, total <= cap;
end;
$$;

-- Only signed-in callers, and never the anonymous PostgREST role.
revoke all on function public.ai_spend(integer) from public;
grant execute on function public.ai_spend(integer) to authenticated;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Run as an ordinary signed-in user. The first block should count up; the
-- second should fail, which is the whole point.
--
--   select * from public.ai_spend(3);   -- 1, true
--   select * from public.ai_spend(3);   -- 2, true
--   select * from public.ai_spend(3);   -- 3, true
--   select * from public.ai_spend(3);   -- 4, false
--
--   update public.ai_usage set spent = 0;   -- 0 rows: no write policy
--   delete from public.ai_usage;            -- 0 rows
--   select * from public.ai_usage;          -- your own row, honestly


-- ─── from 0011-a-way-out.sql ──────────────────────────────────────

-- A way out.
--
-- There was an export and no delete. For a tool used by people at school
-- that is not a missing convenience, it is the right to erasure missing —
-- and "email us and we'll do it" is not that right either when the person
-- who has to answer the email is one teenager.
--
-- ── WHY A FUNCTION ───────────────────────────────────────────────────────
-- Supabase's client SDK cannot delete the account it is signed in as. That
-- normally means reaching for the service-role key, and this project
-- deliberately does not have one: nothing anywhere holds a credential that
-- can read or destroy every row. So the deletion runs as a `security
-- definer` function that can only ever reach one person — `auth.uid()`, the
-- caller. There is no parameter naming whose account to remove, because a
-- parameter is something an attacker gets to choose.
--
-- ── WHAT IT ACTUALLY REMOVES ─────────────────────────────────────────────
-- One row, in `auth.users`. Everything else follows: `profiles` cascades
-- from it, and eighteen tables cascade from `profiles` — projects, notes,
-- events, tasks, files, community posts and hearts, subscriptions, the AI
-- counter. That is the whole point of having built the schema that way, and
-- it means this function cannot fall out of step with a table added later.
--
-- Five columns are `on delete set null` rather than cascade, and stay that
-- way on purpose: `audit_log.actor_id`, `workspace_templates.created_by` and
-- `usage_events.user_id`. Those rows belong to a workspace rather than to a
-- person — an audit log that deletes itself when the person audited leaves
-- is not an audit log — and once the id is null they name nobody. The
-- account screen says this in words rather than leaving somebody to find it.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
-- Pinned for the same reason `ai_spend` is: a security-definer function that
-- resolves names through the caller's search_path is a way to hand out the
-- owner's rights by accident. This one deletes people, so it matters more.
set search_path = public, auth, pg_temp
as $$
declare
  who uuid := auth.uid();
begin
  if who is null then
    raise exception 'delete_my_account requires a signed-in caller';
  end if;

  -- One statement, no parameter, no loop over tables. Everything owned
  -- cascades from here; see the header.
  delete from auth.users where id = who;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Signed in as somebody with work in the account:
--
--   select count(*) from public.projects;      -- some
--   select public.delete_my_account();
--   select count(*) from public.projects;      -- 0 — and the session is dead
--
-- And the shape that must never work, from any caller:
--
--   select public.delete_my_account('someone-else');   -- no such function


-- ─── from 0012-money-arrives-from-outside.sql ─────────────────────

-- Money arrives from outside, and has to be written down.
--
-- A Stripe webhook is the one caller in this system with no person behind
-- it. There is no session, no `auth.uid()`, nobody whose row-level policies
-- can decide what it may touch — and it still has to grant somebody a plan.
--
-- ── WHY NOT A SERVICE-ROLE KEY ───────────────────────────────────────────
-- Because that is the answer everybody reaches for and it is far too big.
-- A service-role key bypasses row-level security on every table: one leaked
-- environment variable and every note, document and file in the database is
-- readable. This project has gone without one on purpose, and a webhook is a
-- poor reason to introduce the first one.
--
-- So the webhook gets a key that can do exactly one thing: record a
-- subscription. It calls this function with a shared secret, as the ordinary
-- anonymous role. If the secret leaks, what an attacker gains is the ability
-- to give somebody a Pro plan they did not pay for — embarrassing, and
-- recoverable by rotating one row. They cannot read a single document.
--
-- ── ON COMPARING THE SECRET ──────────────────────────────────────────────
-- What is stored is a SHA-256 of the secret, not the secret. `=` on bytea is
-- not constant-time, so a determined attacker could in principle learn
-- something from how long a comparison takes — but what leaks is progress
-- towards a *hash*, and inverting SHA-256 is the part that does not work.
-- Storing the secret in the clear and comparing that would leak progress
-- towards the secret itself, which is the difference that matters.
--
-- ── ON BEING CALLED TWICE ────────────────────────────────────────────────
-- Stripe retries. It promises at-least-once, never exactly-once, so this has
-- to be safe to run again with the same event. The subscription is an upsert
-- keyed on the workspace, and the ledger row is keyed on the payment's own
-- id — a second delivery of the same payment changes nothing rather than
-- doubling the money set aside.

begin;

/*
 * Hashing, without pgcrypto.
 *
 * This used to call `digest(secret, 'sha256')`, and that is exactly right on
 * a plain Postgres and exactly wrong on Supabase. Supabase installs its
 * extensions into a schema called `extensions`, not into `public` — so
 * pgcrypto's `digest` is there and not on the search path a `security
 * definer` function pins. The whole file then failed at the moment this
 * function was created, on the only kind of database it was written for.
 *
 * `sha256(bytea)` needs no extension at all: it has been in `pg_catalog`
 * since Postgres 11, so it is visible whatever the search path says. And it
 * returns the same bytes — `digest(t, 'sha256')` hashes the text's UTF-8
 * encoding, which is what `convert_to(t, 'utf8')` hands over — so a secret
 * set by the earlier version still matches after this runs.
 */

/*
 * The one secret, hashed.
 *
 * A table rather than a database setting so it can be rotated with an update
 * and read back by nobody: row-level security is on and there is no policy,
 * which means no client — anon or authenticated — can select from it. Only
 * the definer function below ever sees it.
 */
create table if not exists public.billing_secret (
  id       boolean primary key default true check (id),
  digest   bytea not null,
  rotated_at timestamptz not null default now()
);

alter table public.billing_secret enable row level security;
revoke all on public.billing_secret from anon, authenticated;

/*
 * Set or rotate the secret. Run by hand, from the SQL editor, as the owner.
 *
 * Takes the secret in the clear because it has to be told it once; nothing
 * stores it afterwards but the digest.
 */
create or replace function public.set_billing_secret(secret text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.billing_secret (id, digest, rotated_at)
  values (true, sha256(convert_to(secret, 'utf8')), now())
  on conflict (id) do update
    set digest = excluded.digest, rotated_at = now();
$$;

revoke all on function public.set_billing_secret(text) from public, anon, authenticated;

/*
 * Record what the payment provider says happened.
 *
 * Every number here comes from Stripe's own view of the charge, never from
 * anything a browser sent: `amount_cents` is what was actually captured. The
 * checkout route puts the workspace in the session's metadata and Stripe
 * hands it back, so the client cannot nominate somebody else's workspace
 * after the fact — and even if it did, the worst case is a plan granted to a
 * workspace whose owner did not ask for one, not a disclosure.
 *
 * `share_bps` is passed in rather than read from a table so the split in
 * force on the day of the charge is the one written into the ledger. A
 * ledger that recomputes history when a rate changes is not a ledger.
 */
create or replace function public.record_subscription(
  secret          text,
  p_workspace_id  uuid,
  p_plan          text,
  p_status        text,
  p_seats         integer,
  p_interval      text,
  p_customer_id   text,
  p_subscription_id text,
  p_period_end    timestamptz,
  p_amount_cents  integer default null,
  p_share_bps     integer default null,
  p_payment_ref   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  known bytea;
begin
  select digest into known from public.billing_secret where id;
  if known is null then
    raise exception 'billing secret is not set; run set_billing_secret() first';
  end if;
  if sha256(convert_to(coalesce(secret, ''), 'utf8')) <> known then
    raise exception 'billing secret does not match';
  end if;

  -- The table's own checks refuse a plan or status that is not real, so a
  -- provider sending something unexpected fails loudly here rather than
  -- writing a row nothing downstream knows how to read.
  insert into public.subscriptions (
    workspace_id, plan, status, seats, interval,
    provider, provider_customer_id, provider_subscription_id,
    current_period_end, updated_at
  )
  values (
    p_workspace_id, p_plan, p_status, greatest(coalesce(p_seats, 1), 1),
    coalesce(p_interval, 'month'), 'stripe', p_customer_id, p_subscription_id,
    p_period_end, now()
  )
  on conflict (workspace_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    seats = excluded.seats,
    interval = excluded.interval,
    provider_customer_id = coalesce(excluded.provider_customer_id, public.subscriptions.provider_customer_id),
    provider_subscription_id = coalesce(excluded.provider_subscription_id, public.subscriptions.provider_subscription_id),
    current_period_end = excluded.current_period_end,
    updated_at = now();

  -- Only when money actually moved. A subscription going from trialing to
  -- active is not a payment, and a ledger that counted it would overstate
  -- what has been set aside — which is the one number on this site that has
  -- to be defensible.
  if p_amount_cents is not null and p_amount_cents > 0 and p_payment_ref is not null then
    insert into public.impact_ledger (workspace_id, revenue_cents, share_bps, transfer_ref)
    select p_workspace_id, p_amount_cents, coalesce(p_share_bps, 0), p_payment_ref
    -- Stripe retries; this is what makes a second delivery cost nothing.
    where not exists (
      select 1 from public.impact_ledger where transfer_ref = p_payment_ref
    );
  end if;
end;
$$;

/*
 * Reachable by the anonymous role, because the webhook has no session — the
 * secret is the credential, not the JWT. That is only safe because this
 * function can do nothing except what is written above it.
 */
revoke all on function public.record_subscription(
  text, uuid, text, text, integer, text, text, text, timestamptz, integer, integer, text
) from public;
grant execute on function public.record_subscription(
  text, uuid, text, text, integer, text, text, text, timestamptz, integer, integer, text
) to anon, authenticated;

commit;

-- ── Setting it up ─────────────────────────────────────────────────────────
--
--   select public.set_billing_secret('<paste 32+ random characters>');
--
-- Put the same value in the deployment as STRIPE_HOOK_DB_SECRET. To rotate,
-- run it again with a new value and update the variable; the old one stops
-- working the moment the update commits.
--
-- ── Proof ─────────────────────────────────────────────────────────────────
--
--   -- as anon, with the wrong secret: refused
--   select public.record_subscription('wrong', '<workspace>', 'pro', 'active',
--     1, 'month', 'cus_x', 'sub_x', now() + interval '1 month', 900, 100, 'pi_1');
--
--   -- with the right one: one subscription row, one ledger row
--   -- running it a second time with the same pi_1 leaves the ledger alone
--
--   -- and the secret itself stays unreadable:
--   select * from public.billing_secret;   -- permission denied


-- ─── from 0013-a-thing-with-a-deadline.sql ────────────────────────

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


-- ─── from 0014-cards-to-learn-from.sql ────────────────────────────

-- Study sets: cards made from something you have read.
--
-- One row per set, with the cards as JSON rather than a second table. A set
-- is read whole and written whole — you study all of it or none of it — so
-- splitting the cards into rows would buy a join and cost the thing that
-- actually matters here, which is that a set arrives in one request on a
-- phone on a train.
--
-- `progress` is in the same document as the cards for the same reason, and
-- for one more: which box a card is in is only meaningful next to the card
-- it belongs to. Keeping them apart means a set edited on one machine and
-- studied on another can end up with progress pointing at cards that are no
-- longer there.

begin;

create table if not exists public.study_sets (
  id           text primary key
               check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id     uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name         text not null default '',
  -- Where the cards came from, in words: a note's first line, a document's
  -- name, a file's name. Shown on the set so nobody has to guess.
  source       text,
  -- [{ id, front, back, box, dueDay }]. Shape is the client's; the column's
  -- job is to refuse anything that is not an array.
  cards        jsonb not null default '[]'::jsonb
               check (jsonb_typeof(cards) = 'array'),
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists study_sets_owner_idx
  on public.study_sets(owner_id, updated_at desc);

create index if not exists study_sets_workspace_idx
  on public.study_sets(workspace_id, updated_at desc)
  where workspace_id is not null;

alter table public.study_sets enable row level security;

-- Personal is owner-only. A set made for the team is the team's, to study and
-- to correct: a card everybody is memorising and one person can see is wrong
-- should be fixable by that person.
drop policy if exists study_sets_own on public.study_sets;
create policy study_sets_own on public.study_sets
  for all
  using (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  )
  with check (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  );

-- The policy decides who sees what; the grant decides whether the table can
-- be reached at all. Said out loud rather than left to Supabase's defaults,
-- and guarded so a self-hosted database without these roles still applies.
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.study_sets to authenticated;
  end if;
end
$migration$;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_name = 'study_sets')                               as table_there,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'study_sets')       as locked,
  (select count(*) from pg_policies
    where tablename = 'study_sets')                                as policies;


-- ─── from 0015-people-you-actually-know.sql ───────────────────────

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


-- ─── from 0016-nobody-puts-you-in-a-team.sql ──────────────────────

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

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- 0016 proves a negative, so the numbers to read are the ones that must be
-- zero: no policy of the old shape, no way in for a client, and no definer
-- function left without `pg_temp`. `role_update_stays` is the one that must
-- be true — an owner changing somebody's role is the feature this keeps.
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and policyname = 'members_managed_by_owner')                as old_policy_zero,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and cmd in ('INSERT', 'ALL'))                               as insert_policies_zero,
  -- `case`, because `has_table_privilege` on a role a self-hosted Postgres
  -- does not have is an error rather than an answer.
  case when exists (select 1 from pg_roles where rolname = 'authenticated')
       then has_table_privilege('authenticated',
              'public.workspace_members', 'insert') end           as insert_must_be_false,
  case when exists (select 1 from pg_roles where rolname = 'authenticated')
       then has_column_privilege('authenticated',
              'public.workspace_members', 'role', 'update') end   as role_update_stays,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                      where c like 'search_path=%pg_temp%'))      as unpinned_zero;
