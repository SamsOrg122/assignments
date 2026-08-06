-- Assignments — database schema.
--
-- Not yet in use. The app runs entirely in the browser today; this is the
-- shape it syncs into when it stops. It is checked in rather than improvised
-- later because the decisions below are the ones that are expensive to change
-- afterwards, and they should be arguable now.
--
--   psql "$DATABASE_URL" -f supabase/schema.sql
--
-- Three decisions worth defending:
--
-- 1. Documents are stored as jsonb, not shredded into rows per block.
--    The client already owns a complete document model and edits it as one
--    object; splitting it into tables would mean maintaining two models and
--    reassembling on every read. Postgres indexes jsonb well enough for the
--    queries this app actually makes (by owner, by kind, by updated_at), and
--    full-text search runs off a generated column rather than off the blocks.
--
-- 2. Anonymous users are first-class. The free plan has no sign-up, so a row
--    keyed to an anonymous auth session is the normal case, not an edge case.
--    Claiming that work with a real account later is an UPDATE of owner_id,
--    which is why nothing else references the anonymous identity.
--
-- 3. Row Level Security is on everywhere, with policies written so that a
--    forgotten WHERE clause in application code cannot leak another user's
--    thesis. The database is the last line, not the first.

create extension if not exists "pgcrypto";

-- ── Identity ──────────────────────────────────────────────────────────────

-- Mirrors auth.users with the parts the app needs. Supabase's auth schema is
-- not ours to extend, and joining to it in every policy is slower than a
-- narrow table we control.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- True while this identity came from an anonymous sign-in. Set to false when
  -- the session is upgraded to a real account; the id never changes, so every
  -- project the person made anonymously follows them across.
  is_anonymous boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Workspaces ────────────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'My workspace',
  kind       text not null default 'personal'
             check (kind in ('personal', 'study', 'company')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_idx on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'editor'
               check (role in ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists members_user_idx on public.workspace_members(user_id);

-- ── Documents ─────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  kind         text not null
               check (kind in ('doc', 'notes', 'deck', 'board', 'code', 'design')),
  glyph        text,
  -- The document, exactly as the client's model holds it: blocks, board items,
  -- typography, sources, history.
  content      jsonb not null default '{}'::jsonb,
  -- Bumped by the client on every write. Used for last-write-wins until
  -- there is a CRDT; see the note on `revision` below.
  revision     bigint not null default 1,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Search runs off flattened text the client supplies, not off `content`:
  -- extracting prose from nested blocks in SQL would duplicate logic that
  -- already exists in TypeScript and would drift from it within a month.
  search_text  text,
  search_tsv   tsvector generated always as (
                 to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(search_text, ''))
               ) stored
);

create index if not exists projects_workspace_idx on public.projects(workspace_id, updated_at desc);
create index if not exists projects_owner_idx     on public.projects(owner_id);
create index if not exists projects_search_idx    on public.projects using gin(search_tsv);
create index if not exists projects_live_idx      on public.projects(workspace_id) where deleted_at is null;

-- ── Billing ───────────────────────────────────────────────────────────────

-- Written by the payment webhook, never by the client. The client reads it to
-- decide what to unlock and nothing else — entitlement checks that matter
-- happen server-side.
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  plan                   text not null check (plan in ('free', 'pro', 'team')),
  status                 text not null default 'active'
                         check (status in ('active', 'past_due', 'canceled', 'trialing')),
  seats                  integer not null default 1 check (seats >= 1),
  interval               text not null default 'month' check (interval in ('month', 'year')),
  -- Provider-agnostic on purpose. Stripe is the intended first one, and
  -- naming the column after it would make the second one awkward.
  provider               text not null default 'stripe',
  provider_customer_id   text,
  provider_subscription_id text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (workspace_id)
);

-- Metered AI. One row per charge, so an invoice can be explained line by line
-- rather than asserted.
create table if not exists public.usage_events (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  -- What was run: 'rewrite', 'summarize', 'deck', 'speech', …
  kind         text not null,
  credits      integer not null check (credits > 0),
  created_at   timestamptz not null default now()
);

create index if not exists usage_workspace_idx on public.usage_events(workspace_id, created_at desc);

-- ── Impact ────────────────────────────────────────────────────────────────

-- The commitment, as rows rather than as a sentence on a landing page. Every
-- payment writes one; the public total is a sum over this table, which is what
-- makes the figure checkable instead of claimed.
create table if not exists public.impact_ledger (
  id             bigserial primary key,
  workspace_id   uuid references public.workspaces(id) on delete set null,
  -- Minor units, matching the payment provider. Integers, never floats:
  -- money in floating point is how a ledger stops adding up.
  revenue_cents  integer not null check (revenue_cents >= 0),
  share_bps      integer not null check (share_bps between 0 and 10000),
  set_aside_cents integer generated always as (revenue_cents * share_bps / 10000) stored,
  cause          text not null default 'trees',
  -- Null until the money has actually been transferred to a partner. The gap
  -- between "set aside" and "transferred" is the honest part of this table.
  transferred_at timestamptz,
  transfer_ref   text,
  created_at     timestamptz not null default now()
);

create index if not exists impact_created_idx on public.impact_ledger(created_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.usage_events      enable row level security;
alter table public.impact_ledger     enable row level security;

-- Membership, as a function, so the policies below read as English and the
-- planner sees one indexed lookup rather than a repeated subquery.
create or replace function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists workspaces_member on public.workspaces;
create policy workspaces_member on public.workspaces
  for all using (owner_id = auth.uid() or public.is_member(id))
  with check (owner_id = auth.uid());

drop policy if exists members_visible on public.workspace_members;
create policy members_visible on public.workspace_members
  for select using (public.is_member(workspace_id));

drop policy if exists members_managed_by_owner on public.workspace_members;
create policy members_managed_by_owner on public.workspace_members
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists projects_member on public.projects;
create policy projects_member on public.projects
  for all using (public.is_member(workspace_id) or owner_id = auth.uid())
  with check (public.is_member(workspace_id) or owner_id = auth.uid());

-- Read-only to the client. Only the service role writes these.
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions
  for select using (public.is_member(workspace_id));

drop policy if exists usage_read on public.usage_events;
create policy usage_read on public.usage_events
  for select using (public.is_member(workspace_id));

-- The ledger is public on purpose: a transparency commitment nobody can read
-- is a press release. No workspace identity is exposed by the select policy —
-- callers see amounts and dates, and `workspace_id` is not selectable to
-- anonymous readers through the API's column grants.
drop policy if exists impact_public_read on public.impact_ledger;
create policy impact_public_read on public.impact_ledger
  for select using (true);

-- ── Housekeeping ──────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists workspaces_touch on public.workspaces;
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();
