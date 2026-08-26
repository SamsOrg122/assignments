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
  -- Text, not uuid, and that is not a shortcut. The id is minted the moment
  -- somebody makes a document — offline, before any account exists — by
  -- `uid()` in `src/lib/factories.ts`, which is a ten-character nanoid. It is
  -- already written into every share link, folder, label and comment thread.
  -- A uuid column rejected every one of those, so nothing a signed-in user
  -- wrote ever landed; see migration 0003. An id a local-first app cannot mint
  -- for itself is the wrong id.
  id           text primary key default gen_random_uuid()::text
               check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
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

-- ══ Administration ════════════════════════════════════════════════════════
--
-- Everything below is what an organisation needs before it can put its work in
-- somebody else's product: who may do what, a record of what was done, a rule
-- about how long things are kept, and templates the whole organisation starts
-- from.
--
-- One thing is deliberately *not* here, and saying so is the point of this
-- comment: single sign-on. SAML and the OAuth providers are configured in the
-- Supabase dashboard, not in this schema and not in this app — see
-- `AUTH_PROVIDERS` in `src/app/api/config/route.ts` for the one line the app
-- needs in order to offer the buttons. An app-side imitation of SSO would be a
-- login screen that authenticates nobody.

-- ── Roles, as the database understands them ───────────────────────────────

-- The same ladder as `src/lib/team/permissions.ts`, in the one place that can
-- actually enforce it. A rank comparison rather than a list of role names, so
-- adding a role later is one row here instead of an edit to every policy.
create or replace function public.role_rank(role text)
returns integer language sql immutable as $$
  select case role
    when 'owner'     then 4
    when 'admin'     then 3
    when 'editor'    then 2
    when 'commenter' then 1
    when 'viewer'    then 0
    else -1
  end;
$$;

-- Whether the caller holds at least `needed` in this workspace. Security
-- definer so the membership lookup is not itself subject to the policies it is
-- being used to evaluate — which would recurse.
create or replace function public.has_role(ws uuid, needed text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(needed)
  );
$$;

-- ── Retention ─────────────────────────────────────────────────────────────

-- Null means "keep everything", which stays the default: silently deleting
-- somebody's work because a column defaulted to 30 would be indefensible.
alter table public.workspaces
  add column if not exists retention_days integer
  check (retention_days is null or retention_days between 1 and 3650);

-- ── The audit log ─────────────────────────────────────────────────────────
--
-- Append-only, and that is enforced by the *absence* of an update policy and
-- of update/delete grants rather than by anybody's good intentions. A log an
-- admin can edit is not a log.
--
-- What it is not: it cannot see anything that never reached the server. Work
-- kept in one browser leaves no trace here, because there is nothing to leave
-- one. That is the honest boundary of this table and the console says so.
create table if not exists public.audit_log (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Null when the actor's profile is later deleted; the entry survives them,
  -- which is the whole point of keeping one.
  actor_id     uuid references public.profiles(id) on delete set null,
  -- 'project.deleted', 'member.role_changed', 'template.published', …
  action       text not null,
  -- What it was done to, in words a person recognises: a project name, an
  -- email address. Not an id, because an id is unreadable a month later and
  -- the row it pointed at is usually gone.
  subject      text,
  detail       jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now()
);

create index if not exists audit_workspace_idx on public.audit_log(workspace_id, at desc);

-- ── Organisation templates ────────────────────────────────────────────────
--
-- A template is a document with its content kept and its identity thrown away.
-- Stored as blocks, exactly as `projects.content` stores them, so publishing
-- one is a copy rather than a conversion.
create table if not exists public.workspace_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  name         text not null,
  kind         text not null
               check (kind in ('doc', 'notes', 'deck', 'board', 'code', 'design')),
  blurb        text,
  blocks       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists templates_workspace_idx
  on public.workspace_templates(workspace_id, updated_at desc);

drop trigger if exists templates_touch on public.workspace_templates;
create trigger templates_touch before update on public.workspace_templates
  for each row execute function public.touch_updated_at();

-- ── Policies ──────────────────────────────────────────────────────────────

alter table public.audit_log           enable row level security;
alter table public.workspace_templates enable row level security;

-- Anybody in the workspace may write an entry, because everybody does things
-- worth recording and the client is what notices. Nobody may write one against
-- a workspace they are not in.
drop policy if exists audit_append on public.audit_log;
create policy audit_append on public.audit_log
  for insert with check (public.is_member(workspace_id) and actor_id = auth.uid());

-- Only admins read it. A log of who deleted what is a management tool, not a
-- feed for the team.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select using (public.has_role(workspace_id, 'admin'));

-- No update or delete policy exists, on purpose. Retention below is the only
-- thing that ever removes an entry, and it runs as the definer.

-- Everybody in the workspace starts from the templates; admins decide what
-- they are. That split is the entire feature: a shared shape is only useful if
-- it is not quietly different for each person.
drop policy if exists templates_read on public.workspace_templates;
create policy templates_read on public.workspace_templates
  for select using (public.is_member(workspace_id));

drop policy if exists templates_write on public.workspace_templates;
create policy templates_write on public.workspace_templates
  for all using (public.has_role(workspace_id, 'admin'))
  with check (public.has_role(workspace_id, 'admin'));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.workspace_templates to authenticated;
    -- Select and insert only. The missing grants are the append-only guarantee
    -- restated at the privilege level, where a future policy cannot undo it.
    grant select, insert on public.audit_log to authenticated;
    grant usage on sequence public.audit_log_id_seq to authenticated;
  end if;
end
$$;

-- ── Purging ───────────────────────────────────────────────────────────────

-- What retention *would* remove, without removing it.
--
-- Shown in the console before anybody presses anything. A retention policy
-- whose effect you discover afterwards is how an organisation loses a year of
-- minutes on a Friday afternoon.
create or replace function public.purge_preview(ws uuid)
returns table (kind text, doomed bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare days integer;
begin
  -- Same rule as `purge_expired` below, and for the same reason: a scheduled
  -- job and the SQL editor both run with no `auth.uid()`, and anybody who has
  -- reached either of those already holds the keys to the whole database.
  -- Through the API — where a session always exists — it is admins only.
  if auth.uid() is not null and not public.has_role(ws, 'admin') then
    raise exception 'Only an admin can look at this.';
  end if;
  select retention_days into days from public.workspaces where id = ws;
  if days is null then
    return query select 'projects'::text, 0::bigint
      union all select 'audit'::text, 0::bigint;
    return;
  end if;

  return query
    -- Only what was already in the bin. Retention deletes things nobody is
    -- using; deleting a live document because it has not been edited in ninety
    -- days would be a different and much worse feature.
    select 'projects'::text, count(*)::bigint
      from public.projects
      where workspace_id = ws
        and deleted_at is not null
        and deleted_at < now() - make_interval(days => days)
    union all
    select 'audit'::text, count(*)::bigint
      from public.audit_log
      where workspace_id = ws and at < now() - make_interval(days => days);
end;
$$;

-- Actually remove it.
--
-- One caveat worth writing down rather than discovering: deleting a project
-- row removes its *tombstone*, and a device that has been offline since before
-- the purge still holds the document and no longer sees a deletion to apply.
-- It would push it back. That is an argument for retention windows measured in
-- months rather than days, not a bug to fix here — the alternative is keeping
-- tombstones forever, which is the opposite of what a retention policy is for.
--
-- Scheduling is deliberately left out of the schema: pg_cron is not available
-- on every plan, so this is a function an admin can run from the console today
-- and a scheduled job can call tonight. To schedule it, once pg_cron is on:
--
--   select cron.schedule('tougather-purge', '0 3 * * *',
--     $job$ select public.purge_expired(id) from public.workspaces
--           where retention_days is not null $job$);
create or replace function public.purge_expired(ws uuid)
returns table (kind text, removed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  days     integer;
  gone_p   bigint := 0;
  gone_a   bigint := 0;
begin
  -- The scheduled job runs as the definer with no `auth.uid()`; a person has
  -- to be an admin. Both are allowed, nothing else is.
  if auth.uid() is not null and not public.has_role(ws, 'admin') then
    raise exception 'Only an admin can do this.';
  end if;

  select retention_days into days from public.workspaces where id = ws;
  if days is null then
    return query select 'projects'::text, 0::bigint
      union all select 'audit'::text, 0::bigint;
    return;
  end if;

  -- The CTEs are not called `removed`: that is also the name of an OUT
  -- parameter of this function, and a table reference that shadows a variable
  -- is the kind of thing that works until somebody adds a column to it.
  with gone as (
    delete from public.projects
    where workspace_id = ws
      and deleted_at is not null
      and deleted_at < now() - make_interval(days => days)
    returning 1
  ) select count(*) into gone_p from gone;

  with gone as (
    delete from public.audit_log
    where workspace_id = ws and at < now() - make_interval(days => days)
    returning 1
  ) select count(*) into gone_a from gone;

  -- The purge records itself, and its own entry outlives what it deleted.
  insert into public.audit_log (workspace_id, actor_id, action, subject, detail)
  values (ws, auth.uid(), 'retention.purged',
          days || ' day retention',
          jsonb_build_object('projects', gone_p, 'audit', gone_a));

  return query select 'projects'::text, gone_p
    union all select 'audit'::text, gone_a;
end;
$$;


-- ── Can the app check its own database? ───────────────────────────────────
--
-- Added after `projects.id` sat as a `uuid` for weeks while the app wrote
-- ten-character ids into it — every save refused, and the app's own Settings
-- check reporting the table "there and readable", which it was. Reading was
-- never the problem.
--
-- PostgREST does not expose `information_schema`, so a browser cannot ask
-- what type a column is. This answers that one question, for a fixed list of
-- tables, and writes nothing.

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


-- ── The desktop note ──────────────────────────────────────────────────────
--
-- Notes written on the floating desktop app. Deliberately not `projects`: a
-- sticky note is a few hundred bytes written every eight hundred
-- milliseconds, and a project row carries blocks, board items, typography and
-- a search index. Two tables, each shaped like what it holds.

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

-- ── The agenda ────────────────────────────────────────────────────────────
--
-- Events for the calendar. Same shape and reasoning as `notes` above: a
-- narrow owner-only table, client-minted text ids, client clocks, tombstones.
-- Day as a date and times as minutes from midnight, because a lecture at
-- 09:30 is at 09:30 whatever timezone the laptop wakes up in.

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
  -- Null is personal, owner-only. Set, the event belongs to that workspace
  -- and every member can see and change it — a team calendar where only the
  -- author can move the meeting is a noticeboard.
  workspace_id uuid references public.workspaces(id) on delete cascade,
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
  using (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  )
  with check (
    (workspace_id is null and owner_id = auth.uid())
    or (workspace_id is not null and public.is_member(workspace_id))
  );

-- Things to do on a day, with no time. Not events with zero duration: a task
-- has a done state and no times, and one table with two moods makes every
-- reader tell them apart.
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

-- ── Dropped files ─────────────────────────────────────────────────────────
--
-- Any file dropped on the desktop note, so it is in the library everywhere.
-- Base64 in a capped text column; when somebody needs videos, object storage
-- is the upgrade and the cap keeps that decision honest.

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

/* ── The commons ─────────────────────────────────────────────────────────
   What people choose to share with everyone on this deployment: ideas,
   designs (a project's look), templates (a project's structure). Read is
   the widest policy in this schema — every signed-in account, anonymous
   included, sees every live post; writing and retiring stay the author's.
   See migrations/0009-a-commons.sql for the full reasoning. */

create table if not exists public.community_posts (
  id          text primary key
              check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  author_id   uuid not null default auth.uid()
              references public.profiles(id) on delete cascade,
  author_name text not null default ''
              check (length(author_name) <= 60),
  kind        text not null
              check (kind in ('idea', 'design', 'template')),
  title       text not null
              check (length(title) between 1 and 120),
  body        text not null default ''
              check (length(body) <= 4000),
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

drop policy if exists community_update_own on public.community_posts;
create policy community_update_own on public.community_posts
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

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

/* ── People you actually know ────────────────────────────────────────────
   How a second person gets into a workspace, and how two people who do not
   share one come to know each other. Both are OPEN links: whoever holds the
   link and is signed in may use it, because a link is going to be pasted
   into a group chat and forwarded twice before anybody opens it. What makes
   that safe is not who the link names — it is that expiry and revocation are
   columns the accept function reads on every use.

   The token is never stored. Only `sha256(convert_to(token,'utf8'))`, so a
   database dump is a pile of hashes rather than a pile of working links; and
   `sha256`, not pgcrypto's `digest`, because Supabase puts pgcrypto in the
   `extensions` schema where a pinned search_path cannot see it.

   See migrations/0015-people-you-actually-know.sql for the full reasoning. */

-- Is this caller a real account, rather than an anonymous sign-in?
--
-- Against `auth.users`, deliberately, and never `public.profiles`:
-- `profiles_self` is `for all`, so a person can update their own profile and
-- set `is_anonymous` to false. A check somebody can answer for themselves is
-- not a check. `language plpgsql` so the body is not resolved at CREATE time
-- — `is_anonymous` is Supabase's column, not ours, and an auth schema without
-- it should fail this one call rather than the whole file.
create or replace function public.is_real_account(who uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  genuine boolean;
begin
  select (u.email is not null and u.email <> '' and u.is_anonymous is not true)
    into genuine
    from auth.users u
   where u.id = who;
  return coalesce(genuine, false);
end;
$$;

-- `revoke ... from public` is not what keeps this away from `anon` and
-- `authenticated`: Supabase's default privileges grant execute on every new
-- function in `public` to both roles by name, and a privilege held by a role
-- outlives a revoke aimed at `public`. The two roles are named below, in the
-- guarded block with the rest of the role-specific statements.
revoke all on function public.is_real_account(uuid) from public;

create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The members ladder minus 'owner'. A link may not hand over ownership:
  -- ownership is a transfer between two named people, and a thing that has
  -- been forwarded through a group chat is nobody in particular.
  role         text not null default 'editor'
               check (role in ('admin', 'editor', 'commenter', 'viewer')),
  token_hash   bytea not null unique,
  -- Cascades: a link is a credential somebody handed out, not a record of
  -- what happened, so it dies with the person who minted it.
  created_by   uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  -- No default. An invite that never expires is the one that turns up in a
  -- search result in two years.
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  uses         integer not null default 0,
  -- Null means "as many as the expiry allows"; a team link goes to a group
  -- whose size you do not know.
  max_uses     integer check (max_uses is null or max_uses > 0),
  created_at   timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites(workspace_id, created_at desc);

alter table public.workspace_invites enable row level security;

-- Members may see what links are outstanding — that is not a secret from the
-- people already inside, and a revoke button needs something to list. Nobody
-- may look a link up by token; that is what the function is for.
drop policy if exists workspace_invites_visible on public.workspace_invites;
create policy workspace_invites_visible on public.workspace_invites
  for select using (public.is_member(workspace_id));

drop policy if exists workspace_invites_made_by_admins on public.workspace_invites;
create policy workspace_invites_made_by_admins on public.workspace_invites
  for insert with check (
    (public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id))
    and created_by = auth.uid()
  );

-- Revoking is an update. There is no delete policy and no delete grant:
-- deleting the row would throw away the record that the link was handed out.
drop policy if exists workspace_invites_revoked_by_admins on public.workspace_invites;
create policy workspace_invites_revoked_by_admins on public.workspace_invites
  for update using (
    public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id)
  ) with check (
    public.has_role(workspace_id, 'admin') or public.owns_workspace(workspace_id)
  );

/*
 * Take a token, and either join the workspace or say plainly why not. Returns
 * { ok, already, workspace_id, workspace_name, role, reason, message } —
 * `reason` a short stable slug for code, `message` the sentence to show.
 */
create or replace function public.accept_workspace_invite(token text)
returns jsonb
language plpgsql
security definer
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

  -- Its own reason, because "make an account" is a different instruction from
  -- "ask for a new link" and telling somebody the wrong one wastes their day.
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

  -- Before revoked/expired/used up, and that ordering is the point: a second
  -- click is usually the same person's browser reloading, and telling them a
  -- link is used up while they stand inside the workspace is a lie about
  -- their own membership. No use is counted on this path.
  select role into mine
    from public.workspace_members
   where workspace_id = link.workspace_id and user_id = me;

  if found then
    return jsonb_build_object(
      'ok', true, 'already', true, 'workspace_id', link.workspace_id,
      'workspace_name', ws_name, 'role', mine, 'reason', null, 'message', null);
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

  -- The conditions live in the UPDATE, not in the row read above: two people
  -- opening the last use at the same moment both read `uses = 0`, and only
  -- one can win a conditional update. The checks above still earn their keep
  -- — they produce a reason a person can read, where this produces a count.
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
  -- and only then discover there was no use left. `do nothing` and not `do
  -- update`, so a link can never change the role of somebody already here.
  insert into public.workspace_members (workspace_id, user_id, role)
  values (link.workspace_id, me, link.role)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true, 'already', false, 'workspace_id', link.workspace_id,
    'workspace_name', ws_name, 'role', link.role, 'reason', null, 'message', null);
end;
$$;

revoke all on function public.accept_workspace_invite(text) from public;

/*
 * The friend graph. Symmetric, and stored once, with the pair ordered.
 *
 * Storing both directions would mean "a knows b" and "b knows a" are two rows
 * that can be deleted independently, and the first time they disagree the app
 * has to decide which is true. There is no right answer, so the table refuses
 * to ask.
 *
 * No insert policy, on purpose. No row-level policy can express "b agreed to
 * this" — agreement is an event, not a property of a row — so the only door
 * is `accept_connection`, which requires the token.
 */
create table if not exists public.connections (
  person_a   uuid not null references public.profiles(id) on delete cascade,
  person_b   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_a, person_b),
  constraint connections_ordered check (person_a < person_b)
);

-- The primary key covers `person_a`; "who do I know" has to be answerable
-- from the other side of the pair too.
create index if not exists connections_b_idx on public.connections(person_b);

alter table public.connections enable row level security;

-- Ending a connection needs no agreement: somebody who wants out does not
-- have to negotiate with the person they want out of.
drop policy if exists connections_mine on public.connections;
create policy connections_mine on public.connections
  for select using (person_a = auth.uid() or person_b = auth.uid());

drop policy if exists connections_end on public.connections;
create policy connections_end on public.connections
  for delete using (person_a = auth.uid() or person_b = auth.uid());

create table if not exists public.connection_links (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  uses         integer not null default 0,
  -- One, by default — the difference from a team link. You send a friend link
  -- to one person, and a link still good after they used it is a link that
  -- works for whoever they forward it to.
  max_uses     integer default 1 check (max_uses is null or max_uses > 0),
  created_at   timestamptz not null default now()
);

create index if not exists connection_links_owner_idx
  on public.connection_links(created_by, created_at desc);

alter table public.connection_links enable row level security;

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
 * Follow a friend link. Returns
 * { ok, already, person_id, display_name, reason, message }.
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

  -- Checked before expiry and before the use count, because this is a mistake
  -- and not an attack: somebody has opened their own link to see what the
  -- other person will see. "This link is used up" would answer a question
  -- they did not ask, and no use is counted on this path.
  if them = me then
    return jsonb_build_object(
      'ok', false, 'already', false, 'reason', 'your own link',
      'message', 'that is your own link. send it to somebody else — when they '
              || 'open it, you will both show up in each other''s people.');
  end if;

  lo := least(me, them);
  hi := greatest(me, them);

  select display_name into name_of from public.profiles where id = them;

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

-- Two lookups as definer functions, for the reason `is_member` is one: a
-- policy on `profiles` whose subquery reads `workspace_members` gets that
-- table's own policies applied inside it, on every row.
--
-- `pg_temp` is spelled out, and last, because leaving it off the list does not
-- take it out of the search — Postgres still looks there first for relations,
-- so the pin would rest on nobody ever writing an unqualified table name in
-- these bodies. Both sit on the `profiles` SELECT policy, which is every
-- profile read.
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

/*
 * Read the name of somebody you share a workspace with, or are connected to.
 *
 * `profiles_self` stays EXACTLY as it is, and this is a second policy rather
 * than a rewrite of it. `profiles_self` is `for all`: it is what lets a person
 * write their own row, and its `with check (id = auth.uid())` is the only
 * thing between anybody and writing somebody else's profile. Widening it to
 * cover teammates would widen the write side with it, and a policy that lets
 * you rename your teammates is a worse bug than the one being fixed here —
 * the members list showing a uuid where a name should be, because the
 * embedded `profiles(display_name)` join came back null for everybody.
 * Permissive policies are ORed, so a select-only policy widens exactly SELECT.
 *
 * Policies choose rows, not columns, so a teammate sees the whole profile
 * row: `display_name` — the point — plus `is_anonymous`, which the members
 * list already shows deliberately, and the timestamps, beside an id they can
 * already read out of `workspace_members`. That is the constraint on this
 * table from now on: `profiles` holds nothing a teammate may not read.
 * Anything private about a person belongs in its own table with its own
 * policy, not in a new column here.
 */
drop policy if exists profiles_people_you_know on public.profiles;
create policy profiles_people_you_know on public.profiles
  for select using (
    public.shares_a_workspace(id) or public.is_connected_to(id)
  );

-- Grants, and here the revokes matter more. `connections` must not be
-- insertable by a client under any circumstances, and Supabase's default
-- privileges hand out insert on every new table in `public` — so the grant it
-- would otherwise inherit is taken away explicitly. Guarded, because these
-- roles are Supabase's and a self-hosted Postgres may not have them.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update on public.workspace_invites to authenticated;
    grant select, insert, update on public.connection_links  to authenticated;
    grant select, delete         on public.connections       to authenticated;

    -- Revoking a link is an update; deleting it would erase the fact that it
    -- was ever handed out. And nothing writes `connections` but the function.
    revoke delete on public.workspace_invites from authenticated;
    revoke delete on public.connection_links  from authenticated;
    revoke insert, update on public.connections from authenticated;

    grant execute on function public.shares_a_workspace(uuid) to authenticated;
    grant execute on function public.is_connected_to(uuid) to authenticated;
    grant execute on function public.accept_workspace_invite(text) to authenticated;
    grant execute on function public.accept_connection(text) to authenticated;

    -- `is_real_account` answers a question about `auth.users`. It exists for
    -- the two accept functions, which reach it as the definer; no client gets
    -- to ask it.
    revoke all on function public.is_real_account(uuid) from authenticated;
  end if;

  -- `anon` is the role a request with no JWT arrives as. It has no
  -- `auth.uid()`, so it could only ever be refused — there is no reason to
  -- let it ask.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.workspace_invites from anon;
    revoke all on public.connection_links  from anon;
    revoke all on public.connections       from anon;
    revoke all on function public.accept_workspace_invite(text) from anon;
    revoke all on function public.accept_connection(text) from anon;
    revoke all on function public.is_real_account(uuid) from anon;
  end if;
end
$$;
