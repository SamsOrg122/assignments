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
