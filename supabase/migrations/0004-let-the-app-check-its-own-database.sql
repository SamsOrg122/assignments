-- The uuid bug was not found by the app. It was found by a user reading an
-- error message, weeks after every save had started failing — and the app's
-- own Settings check said "the projects table is there and readable" the
-- whole time. It was: reading worked perfectly. Nothing ever tried to write.
--
-- So this adds the one thing that would have caught it on day one: a way for
-- the app to ask the database what shape it actually has, and compare that to
-- the shape the app was written against.
--
-- Why a function rather than a query. PostgREST only exposes the schemas it
-- is told to, and `information_schema` is not one of them — a browser cannot
-- ask what type a column is. So the question is answered here, once, by a
-- function that takes no arguments, writes nothing, and returns only metadata
-- about a fixed list of tables. That metadata is not a secret: PostgREST
-- already publishes every column name of every exposed table to anyone who
-- asks it for an OPTIONS. What is not published, and what matters, is the
-- *types* — which is precisely where the app and the database drifted apart.

begin;

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

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- `projects_id_type` must read `text`. If it says `uuid`, migration 0003 has
-- not been run on this database and nothing anybody writes is being saved.

select
  jsonb_pretty(public.schema_report() -> 'applied')             as migrations_applied,
  public.schema_report() #>> '{columns,projects,id}'            as projects_id_type;
