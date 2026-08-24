-- A ceiling on what one account can spend of somebody else's money.
--
-- `/api/ai` and `/api/assist` both call a paid model. Until now the only
-- thing between a stranger and that budget was a counter in one Node
-- process's memory: it resets on every deploy, it is per-instance on
-- serverless, and it is keyed on an address a botnet has thousands of. The
-- file that implements it says so out loud. This is the ceiling that
-- survives all three.
--
-- ── WHY A FUNCTION AND NOT A TABLE THE CLIENT WRITES ─────────────────────
-- This project has no service-role key, deliberately: nothing anywhere holds
-- a credential that can read every row. So the server has no identity of its
-- own to record usage with — it acts as the caller, using the token the
-- caller sent.
--
-- That creates the obvious hole: if the counter were an ordinary table with
-- an owner policy, the person being counted could update their own row back
-- to zero. `security definer` closes it. The table has row-level security on
-- and *no* write policies at all, so no client can touch it directly; the
-- only way in is this function, which does one thing — add one — and hands
-- back the new total. Reading your own usage is allowed, because a ceiling
-- somebody cannot see is a ceiling they will only meet as a mysterious
-- refusal.
--
-- ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
-- Proof of personhood. The free plan runs on anonymous accounts, and anyone
-- willing to clear their browser gets a fresh one and a fresh allowance. It
-- raises the cost of abuse from "a for-loop" to "a loop that also has to mint
-- accounts", which is worth having and is not the last line. The last line is
-- a spend limit on the OpenRouter key itself, which no code in this
-- repository can set.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.ai_usage (
  owner_id uuid not null
           references public.profiles(id) on delete cascade,
  -- A calendar day in UTC. Not a rolling window: a rolling window needs every
  -- request's timestamp kept, and this needs one integer per person per day.
  day      date not null default (now() at time zone 'utc')::date,
  spent    integer not null default 0 check (spent >= 0),
  primary key (owner_id, day)
);

alter table public.ai_usage enable row level security;

-- You may see your own usage. Nobody may write it — see the header.
drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage
  for select
  using (owner_id = auth.uid());

/*
 * And the same thing again at the grant level, deliberately.
 *
 * "There is no write policy, so nobody can write" is true only while nobody
 * adds one. Supabase also hands `anon` and `authenticated` table privileges
 * on new public tables by default, so the absence of a policy is the *only*
 * thing standing here — one `create policy` in a later migration, written by
 * somebody who has not read this file, and the counter becomes resettable by
 * the person being counted.
 *
 * Taking the privilege away as well means such a policy would still not be
 * enough. Two independent things now have to be undone to open this, and
 * neither can be done by accident.
 */
revoke insert, update, delete, truncate on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

/*
 * Charge one request to today, and say where that leaves you.
 *
 * Returns the total *after* charging and whether it was within the
 * allowance, so the caller does one round trip rather than read-then-write —
 * two statements would let two concurrent requests both read 99 and both
 * proceed. The upsert is atomic, so the number handed back is the real one.
 *
 * The allowance is passed in rather than stored, so it stays configurable
 * from the deployment without a migration. It is clamped: a caller cannot ask
 * for a ceiling of two billion.
 */
create or replace function public.ai_spend(allowance integer)
returns table (spent integer, allowed boolean)
language plpgsql
security definer
-- Pinned, so a caller cannot put their own `now()` or their own table in
-- front of the ones this function means. A security-definer function without
-- this is the standard way to hand out the owner's rights by accident.
set search_path = public, pg_temp
as $$
declare
  who   uuid := auth.uid();
  cap   integer := least(greatest(coalesce(allowance, 0), 0), 10000);
  total integer;
begin
  if who is null then
    raise exception 'ai_spend requires a signed-in caller';
  end if;

  insert into public.ai_usage (owner_id, day, spent)
  values (who, (now() at time zone 'utc')::date, 1)
  on conflict (owner_id, day)
    do update set spent = public.ai_usage.spent + 1
  returning public.ai_usage.spent into total;

  return query select total, total <= cap;
end;
$$;

-- Only signed-in callers, and never the anonymous PostgREST role.
revoke all on function public.ai_spend(integer) from public;
grant execute on function public.ai_spend(integer) to authenticated;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Run as an ordinary signed-in user. The first block should count up; the
-- second should fail, which is the whole point.
--
--   select * from public.ai_spend(3);   -- 1, true
--   select * from public.ai_spend(3);   -- 2, true
--   select * from public.ai_spend(3);   -- 3, true
--   select * from public.ai_spend(3);   -- 4, false
--
--   update public.ai_usage set spent = 0;   -- 0 rows: no write policy
--   delete from public.ai_usage;            -- 0 rows
--   select * from public.ai_usage;          -- your own row, honestly
