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
