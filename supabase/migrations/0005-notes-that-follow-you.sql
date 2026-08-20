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
