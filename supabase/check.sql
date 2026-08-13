-- Is everything actually in there?
--
-- Paste this into the Supabase SQL editor. It changes nothing — it only looks
-- — and prints one row per thing the app expects, with `yes` or `MISSING`
-- beside it. Anything missing means a piece of `schema.sql` or of
-- `migrations/0001-forms-and-administration.sql` did not run.
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
  ('function','is_member',           'used by nearly every policy'),
  ('function','owns_workspace',      'the owner, even without a membership row'),
  ('function','role_rank',           'the role ladder'),
  ('function','has_role',            'what the admin policies ask'),
  ('function','touch_updated_at',    'keeps updated_at honest'),
  ('function','handle_new_user',     'gives every auth user a profile'),
  ('function','add_owner_as_member', 'the owner joins their own workspace'),
  ('function','purge_preview',       'what retention would remove'),
  ('function','purge_expired',       'what retention does remove'),
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

-- And the two things that are *supposed* to be absent: no policy on the audit
-- log may allow UPDATE or DELETE. Anything listed here is a hole.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'audit_log'
  and cmd in ('UPDATE', 'DELETE', 'ALL');

-- How much is actually stored. A small answer here is normal, not a fault:
-- the app keeps work in the browser until somebody signs in, and a document
-- is one row however long it is.
select 'projects' as what, count(*) as rows from public.projects
union all select 'workspaces', count(*) from public.workspaces
union all select 'people',     count(*) from public.profiles
union all select 'form answers', count(*) from public.form_responses
union all select 'audit entries', count(*) from public.audit_log
order by what;
