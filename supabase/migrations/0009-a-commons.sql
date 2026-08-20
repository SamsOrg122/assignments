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
