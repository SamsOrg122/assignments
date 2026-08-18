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
