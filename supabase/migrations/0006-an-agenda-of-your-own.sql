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
