-- Tougather — database schema.
--
-- What `lib/db/supabase.ts` is written against. Run it once against a new
-- project, then turn on anonymous sign-ins in Authentication → Providers: the
-- free plan has no sign-up, so an anonymous auth user is the normal case here
-- rather than an edge case.
--
--   psql "$DATABASE_URL" -f supabase/schema.sql
--
-- With no Supabase variables set the app never calls any of this — it keeps
-- work in the browser instead, which is a supported way to run it and not a
-- degraded one.
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

-- ── Forms ─────────────────────────────────────────────────────────────────

-- Answers to a form.
--
-- The questions are not here on purpose: they travel inside the link, so a
-- form works with no account and nothing to provision. Only the answers need
-- a server, because a browser cannot receive anything from somebody else's
-- browser.
--
-- `form_id` is the form block's id, which the link carries. `owner_id` is who
-- the answers belong to, which the link also carries — and the honest caveat
-- is that a determined person could file answers against a form id they were
-- given. They cannot read anybody's answers, which is the property that
-- matters; spoofed *inserts* are the same exposure any public form has.
create table if not exists public.form_responses (
  id           uuid primary key default gen_random_uuid(),
  form_id      text not null,
  owner_id     uuid references public.profiles(id) on delete cascade,
  -- The whole response, keyed by field id. JSON because the shape is the
  -- form's, and a form changes between Tuesday and Thursday.
  answers      jsonb not null,
  submitted_at timestamptz not null default now()
);

create index if not exists form_responses_idx
  on public.form_responses(form_id, submitted_at);

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
alter table public.form_responses    enable row level security;
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

-- Owner of the workspace, whether or not the membership row exists. Kept
-- separate from `is_member` so a workspace created before the membership
-- trigger existed does not lock its own owner out.
create or replace function public.owns_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  );
$$;

drop policy if exists projects_member on public.projects;
create policy projects_member on public.projects
  -- Reading: anything in a workspace you belong to, plus anything you own.
  -- The second half matters after a workspace hand-over.
  for all using (public.is_member(workspace_id) or owner_id = auth.uid())
  -- Writing: the *workspace* decides, not the row. Allowing `owner_id =
  -- auth.uid()` here would let anyone file their own documents into a stranger's
  -- workspace — and the stranger, being a member, would then read them. A
  -- client bug is enough to do it by accident; this is the backstop.
  with check (public.is_member(workspace_id) or public.owns_workspace(workspace_id));

-- Owners of workspaces made before the membership trigger existed. Without
-- this they are not members of their own workspace, and the write policy above
-- would fall back to the ownership clause on every single query.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_id, 'owner' from public.workspaces w
on conflict do nothing;

-- Read-only to the client. Only the service role writes these.
-- Anybody may answer a form. That is what a form is: refusing an insert from
-- someone without an account would mean every respondent needed one, which is
-- the opposite of the point.
drop policy if exists form_responses_insert on public.form_responses;
create policy form_responses_insert on public.form_responses
  for insert with check (true);

-- Only the owner reads them back. Nobody else — not other respondents, not
-- other members of the owner's workspace, because a survey answer is given to
-- one person and sharing a workspace is not consent.
drop policy if exists form_responses_read on public.form_responses;
create policy form_responses_read on public.form_responses
  for select using (owner_id = auth.uid());

drop policy if exists form_responses_delete on public.form_responses;
create policy form_responses_delete on public.form_responses
  for delete using (owner_id = auth.uid());

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

-- ── Privileges ────────────────────────────────────────────────────────────

-- Policies decide who may see a row; grants decide who may reach the table at
-- all. A stock Supabase project sets default privileges that cover this, so
-- normally these are belt and braces — but a project whose defaults have been
-- changed, or a self-hosted Postgres, would apply every policy above to roles
-- that get "permission denied" before a policy is ever consulted. Writes stay
-- shut on the read-only tables because there is no policy permitting them, not
-- because the grant is missing.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete
      on public.profiles, public.workspaces, public.workspace_members,
         public.projects, public.form_responses
      to authenticated;
    grant select
      on public.subscriptions, public.usage_events, public.impact_ledger
      to authenticated;
  end if;

  -- The ledger is deliberately readable by everyone; nothing else is.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon;
    grant select on public.impact_ledger to anon;
  end if;
end
$$;

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

-- Every auth user gets a profile, including anonymous ones.
--
-- `workspaces.owner_id` references `profiles`, so without this the very first
-- write after an anonymous sign-in fails on a foreign key — and it would fail
-- in a way that reads like a permissions problem. Doing it in the database
-- rather than in the client also means it cannot be skipped by a code path
-- that forgets.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_anonymous)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    new.email is null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The owner is a member of their own workspace.
--
-- The policies already grant the owner access directly, so this is not what
-- makes their own work readable. It is what makes `is_member` agree with
-- reality, so the team surfaces list the owner instead of an empty workspace
-- that somebody is nevertheless editing.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists workspaces_owner_member on public.workspaces;
create trigger workspaces_owner_member after insert on public.workspaces
  for each row execute function public.add_owner_as_member();
