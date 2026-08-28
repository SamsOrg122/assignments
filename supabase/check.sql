-- Is everything actually in there?
--
-- Paste this into the Supabase SQL editor. It changes nothing — it only looks
-- — and prints one row per thing the app expects, with `yes` or `MISSING`
-- beside it. Anything missing means a piece of `schema.sql` or of
-- `migrations/0001-forms-and-administration.sql` did not run.
--
-- The last result set is the one to read first: it names every migration and
-- whether it has visibly been applied. Anything there that is NOT APPLIED is
-- fixed by running `supabase/catch-up.sql`, which is 0003–0017 in one paste
-- and is safe to run however many times it has already been run.
--
-- The expected list is not a guess: it was taken from a Postgres 16 that had
-- the schema applied to it from empty.

with expected(kind, name, note) as (values
  ('table',   'profiles',            'one row per person, mirroring auth.users'),
  ('table',   'workspaces',          'one per account; holds the retention rule'),
  ('table',   'workspace_members',   'who is in a workspace, and as what'),
  ('table',   'projects',            'ONE ROW PER DOCUMENT — the whole document is one jsonb value'),
  ('table',   'subscriptions',       'written by the payment webhook, not the app'),
  ('table',   'usage_events',        'one row per AI charge'),
  ('table',   'impact_ledger',       'the public share-of-revenue ledger'),
  ('table',   'form_responses',      'answers to forms'),
  ('table',   'audit_log',           'append-only record of what was done'),
  ('table',   'workspace_templates', 'templates published to everyone'),
  ('table',   'workspace_invites',   'open links into a workspace; only the hash of each token'),
  ('table',   'connections',         'the friend graph, one row per pair, ordered least/greatest'),
  ('table',   'connection_links',    'open links to a person; one use by default'),
  ('function','is_member',           'used by nearly every policy'),
  ('function','owns_workspace',      'the owner, even without a membership row'),
  ('function','role_rank',           'the role ladder'),
  ('function','has_role',            'what the admin policies ask'),
  ('function','touch_updated_at',    'keeps updated_at honest'),
  ('function','handle_new_user',     'gives every auth user a profile'),
  ('function','add_owner_as_member', 'the owner joins their own workspace'),
  ('function','purge_preview',       'what retention would remove'),
  ('function','purge_expired',       'what retention does remove'),
  ('function','is_real_account',     'an anonymous sign-in may not join anything'),
  ('function','accept_workspace_invite', 'the only way to use an invite link'),
  ('function','accept_connection',   'the only way anything is written to connections'),
  ('function','shares_a_workspace',  'lets you read a teammate''s name'),
  ('column',  'workspaces.retention_days', 'null means keep everything')
)
select
  e.kind,
  e.name,
  case
    when e.kind = 'table' then
      case when exists (select 1 from information_schema.tables
                        where table_schema = 'public' and table_name = e.name)
           then 'yes' else 'MISSING' end
    when e.kind = 'function' then
      case when exists (select 1 from information_schema.routines
                        where routine_schema = 'public' and routine_name = e.name)
           then 'yes' else 'MISSING' end
    else
      case when exists (select 1 from information_schema.columns
                        where table_schema = 'public'
                          and table_name = split_part(e.name, '.', 1)
                          and column_name = split_part(e.name, '.', 2))
           then 'yes' else 'MISSING' end
  end as present,
  e.note
from expected e
order by present desc, e.kind, e.name;

-- Row level security, which is the half that matters if anything is ever
-- shared. Every one of these should say `on`, with the policy count beside it.
select
  c.relname as table_name,
  case when c.relrowsecurity then 'on' else 'OFF — FIX THIS' end as rls,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- And the things that are *supposed* to be absent. No policy on the audit log
-- may allow UPDATE or DELETE — a log an admin can edit is not a log. No policy
-- on `connections` may allow INSERT or UPDATE either: the only way into the
-- friend graph is `accept_connection`, which requires the token, and an insert
-- policy would let anybody add themselves to a stranger. And none on
-- `workspace_members` may allow INSERT: a membership is created by the owner
-- trigger or by somebody following an invite link, both of which are
-- `security definer` and need no policy — a client-side insert is how a
-- stranger ends up in a team they never joined. Anything listed here is a
-- hole.
--
-- `pg_policies` is queried by table NAME rather than by `'public.x'::regclass`,
-- which matters: a regclass cast to a table this database does not have is an
-- error at parse time, and it would take this whole report down on exactly the
-- database that most needs to read it.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'audit_log'   and cmd in ('UPDATE', 'DELETE', 'ALL'))
    or (tablename = 'connections' and cmd in ('INSERT', 'UPDATE', 'ALL'))
    or (tablename = 'workspace_members' and cmd in ('INSERT', 'ALL'))
  );

-- How much is actually stored. A small answer here is normal, not a fault:
-- the app keeps work in the browser until somebody signs in, and a document
-- is one row however long it is.
select 'projects' as what, count(*) as rows from public.projects
union all select 'workspaces', count(*) from public.workspaces
union all select 'people',     count(*) from public.profiles
union all select 'form answers', count(*) from public.form_responses
union all select 'audit entries', count(*) from public.audit_log
order by what;

-- ── Do the columns the app writes to have the types the app writes? ───────
--
-- This section exists because everything above it once said "fine" while not
-- a single save was reaching the database. `projects.id` was a `uuid`, the
-- app has always made ten-character ids, and every write was rejected — for
-- weeks, silently, with the tables all present and correct.
--
-- Read `verdict`. Anything that is not `ok` is a save that is failing right
-- now.
with expected(table_name, column_name, data_type, why) as (values
  ('projects',   'id',           'text',                     'the app mints ten-character ids offline; a uuid column refuses every one'),
  ('projects',   'workspace_id', 'uuid',                      'which account the document belongs to'),
  ('projects',   'owner_id',     'uuid',                      'who wrote it'),
  ('projects',   'name',         'text',                      'the title'),
  ('projects',   'kind',         'text',                      'doc, deck, board…'),
  ('projects',   'content',      'jsonb',                     'the whole document'),
  ('projects',   'revision',     'bigint',                    'last-write-wins between two machines'),
  ('projects',   'deleted_at',   'timestamp with time zone',  'a tombstone, so sync can tell deleted from never-seen'),
  ('projects',   'search_text',  'text',                      'flattened prose, for search'),
  ('workspaces', 'id',           'uuid',                      'the account'),
  ('workspaces', 'owner_id',     'uuid',                      'whose it is')
)
select
  e.table_name || '.' || e.column_name as column,
  e.data_type                          as expected,
  coalesce(c.data_type, '— missing —') as found,
  case
    when c.data_type is null       then 'MISSING'
    when c.data_type = e.data_type then 'ok'
    else 'WRONG TYPE — SAVES ARE FAILING'
  end                                  as verdict,
  e.why
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = e.table_name
 and c.column_name  = e.column_name
order by (case when c.data_type is distinct from e.data_type then 0 else 1 end),
         e.table_name, e.column_name;

-- Which of the migrations have visibly been applied, inferred from what each
-- one left behind rather than from a number somebody has to remember to bump.
select
  '0002 — work lands in the account' as migration,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then 'applied' else 'NOT APPLIED' end as state
union all
select
  '0003 — ids the client can actually make',
  case when exists (
    select 1 from pg_constraint
     where conname = 'projects_id_shape' and conrelid = 'public.projects'::regclass
  ) then 'applied' else 'NOT APPLIED — NOTHING IS BEING SAVED' end
union all
select
  '0004 — let the app check its own database',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'schema_report'
  ) then 'applied' else 'not applied — Settings cannot self-check' end
union all
select
  '0005 — notes that follow you',
  case when to_regclass('public.notes') is not null
       then 'applied' else 'NOT APPLIED — the desktop note cannot sync' end
union all
select
  '0006 — an agenda of your own',
  case when to_regclass('public.events') is not null
       then 'applied' else 'NOT APPLIED — the agenda stays in one browser' end
union all
select
  '0007 — team agendas and daily tasks',
  case when to_regclass('public.agenda_tasks') is not null
       then 'applied' else 'NOT APPLIED — tasks stay in one browser' end
union all
select
  '0008 — files that follow you',
  case when to_regclass('public.kit_files') is not null
       then 'applied' else 'NOT APPLIED — dropped files stay in one browser' end
union all
select
  '0009 — a commons',
  case when to_regclass('public.community_posts') is not null
       then 'applied' else 'NOT APPLIED — nothing can be shared publicly' end
union all
select
  '0010 — a ceiling on the model',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ai_spend'
  ) then 'applied' else 'NOT APPLIED — AI use is uncounted and uncapped' end
union all
select
  '0011 — a way out',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'delete_my_account'
  ) then 'applied' else 'NOT APPLIED — nobody can erase themselves' end
union all
select
  '0012 — money arrives from outside',
  -- Deliberately not "…and a secret has been set", tempting though it is:
  -- naming `public.billing_secret` here is an error at parse time on a
  -- database where 0012 has not run, and that would take this whole report
  -- down on exactly the database that needs it most. So the reminder is
  -- unconditional instead.
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_subscription'
  ) then 'applied — set_billing_secret() still has to be called once'
    else 'not applied — only needed if you take payments' end
union all
select
  '0013 — a thing with a deadline',
  case when to_regclass('public.assignments') is not null
       then 'applied' else 'NOT APPLIED — assignments stay in one browser' end
union all
select
  '0014 — cards to learn from',
  case when to_regclass('public.study_sets') is not null
       then 'applied' else 'NOT APPLIED — study sets stay in one browser' end
union all
select
  '0015 — people you actually know',
  -- `to_regclass`, which returns null for a table that is not there, and not
  -- `from public.workspace_invites` or `'public.connections'::regclass`.
  -- Either of those is resolved when this file is PARSED, so on a database
  -- where 0015 has not run they do not report "not applied" — they abort the
  -- whole report before its first row, which is the one report the founder
  -- needs at that moment. Same reason 0012's row above is written the way it
  -- is.
  case when to_regclass('public.workspace_invites') is not null
        and to_regclass('public.connections') is not null
       then 'applied' else 'NOT APPLIED — nobody can be added to a team' end
union all
select
  '0016 — nobody puts you in a team but you',
  -- Read through `pg_policies` by NAME, like 0015's row above and for the
  -- same reason: this row has to survive being read on a database that has
  -- no `workspace_members` at all. `'public.workspace_members'::regclass`
  -- would be resolved when this file is PARSED and abort the whole report
  -- before its first line; `has_table_privilege('authenticated',
  -- 'public.workspace_members', 'insert')` — the more direct question, and
  -- the tempting one — would abort it at run time instead, on a database
  -- missing either the table or the role. Both name a thing directly. A
  -- policy name is just text until it matches something.
  --
  -- THREE halves, and the third is the one that matters. 0016 is a policy
  -- change AND a grant change, and for a while this row tested only the
  -- policies — so it printed 'applied' against a database that still had the
  -- table-wide UPDATE grant, where the attack simply runs through a different
  -- verb: move a membership row's user_id onto a stranger, read their name,
  -- move it back. A check that passes on the state it exists to catch is
  -- worse than no check, because somebody stops looking.
  --
  -- The grant is read out of pg_class rather than with
  -- `has_table_privilege`, which aborts at run time on a database missing
  -- either the table or the role, and rather than
  -- `information_schema.role_table_grants`, which only shows grants the
  -- current role is party to. `aclexplode` on a table found by NAME is exact
  -- and is still only text until it matches something.
  --
  -- Each half alone lies: the new policy says nothing about whether the old
  -- one was dropped; the old one being absent is also true of a database that
  -- never had the table; and no insert grant is vacuously true where there is
  -- no table at all — which is why the first half has to be a positive.
  case when exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = 'workspace_members'
            and policyname = 'members_role_set_by_owner')
        and not exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = 'workspace_members'
            and policyname = 'members_managed_by_owner')
        and not exists (
         select 1
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           cross join lateral aclexplode(c.relacl) a
           join pg_roles r on r.oid = a.grantee
          where n.nspname = 'public'
            and c.relname = 'workspace_members'
            and r.rolname in ('authenticated', 'anon')
            and a.privilege_type in ('INSERT', 'UPDATE'))
       then 'applied'
       else 'NOT APPLIED — AN OWNER CAN PUT A STRANGER IN THEIR OWN TEAM' end
union all
select
  '0017 — a message that arrives',
  -- Two halves. The tables alone would pass on a database where the policies
  -- failed to apply, which is the state that matters: `messages` without
  -- `messages_in_your_channels` is a table anybody authenticated can read.
  -- Read by NAME through pg_tables and pg_policies, never through regclass —
  -- a regclass literal is resolved when this file is parsed and would abort
  -- the whole report on a database that does not have the table yet.
  case when (select count(*) from pg_tables
              where schemaname = 'public'
                and tablename in ('channels', 'channel_members', 'messages')) = 3
        and (select count(*) from pg_policies
              where schemaname = 'public' and tablename = 'messages'
                and policyname in ('messages_in_your_channels',
                                   'messages_written_by_you')) = 2
       then 'applied'
       else 'NOT APPLIED — chat stays in each browser, and nothing is sent' end
order by migration;
