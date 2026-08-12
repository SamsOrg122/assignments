-- Tougather — everything added since the accounts-era schema.
--
-- Safe to run against a project that already has the original
-- `supabase/schema.sql` applied. Safe to run twice: every statement is
-- `if not exists`, `or replace`, or a `drop policy if exists` followed by a
-- create. Nothing here drops a table, a column or a row.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0001-forms-and-administration.sql
--
-- or paste it whole into the Supabase SQL editor.
--
-- Two blocks of work:
--
--   1. **Forms.** Somewhere for the answers to a form to land. The questions
--      themselves travel inside the link and are never stored here.
--   2. **Administration.** Roles the database itself enforces, an append-only
--      audit log, a retention rule with a purge that can be scheduled, and
--      templates an organisation publishes to everyone in it.
--
-- If your project already has the forms half — it shipped a few days before
-- the rest — that part simply does nothing on the second run.

begin;

-- ══ Forms ═════════════════════════════════════════════════════════════════

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

alter table public.form_responses enable row level security;

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

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.form_responses to authenticated;
  end if;
end
$migration$;

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

commit;

-- After this runs, Settings → Connection in the app checks the same things
-- against the live project, and Administration reads the roles, the log and
-- the retention rule out of it. Neither needs any further configuration.
