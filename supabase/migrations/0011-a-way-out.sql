-- A way out.
--
-- There was an export and no delete. For a tool used by people at school
-- that is not a missing convenience, it is the right to erasure missing —
-- and "email us and we'll do it" is not that right either when the person
-- who has to answer the email is one teenager.
--
-- ── WHY A FUNCTION ───────────────────────────────────────────────────────
-- Supabase's client SDK cannot delete the account it is signed in as. That
-- normally means reaching for the service-role key, and this project
-- deliberately does not have one: nothing anywhere holds a credential that
-- can read or destroy every row. So the deletion runs as a `security
-- definer` function that can only ever reach one person — `auth.uid()`, the
-- caller. There is no parameter naming whose account to remove, because a
-- parameter is something an attacker gets to choose.
--
-- ── WHAT IT ACTUALLY REMOVES ─────────────────────────────────────────────
-- One row, in `auth.users`. Everything else follows: `profiles` cascades
-- from it, and eighteen tables cascade from `profiles` — projects, notes,
-- events, tasks, files, community posts and hearts, subscriptions, the AI
-- counter. That is the whole point of having built the schema that way, and
-- it means this function cannot fall out of step with a table added later.
--
-- Five columns are `on delete set null` rather than cascade, and stay that
-- way on purpose: `audit_log.actor_id`, `workspace_templates.created_by` and
-- `usage_events.user_id`. Those rows belong to a workspace rather than to a
-- person — an audit log that deletes itself when the person audited leaves
-- is not an audit log — and once the id is null they name nobody. The
-- account screen says this in words rather than leaving somebody to find it.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
-- Pinned for the same reason `ai_spend` is: a security-definer function that
-- resolves names through the caller's search_path is a way to hand out the
-- owner's rights by accident. This one deletes people, so it matters more.
set search_path = public, auth, pg_temp
as $$
declare
  who uuid := auth.uid();
begin
  if who is null then
    raise exception 'delete_my_account requires a signed-in caller';
  end if;

  -- One statement, no parameter, no loop over tables. Everything owned
  -- cascades from here; see the header.
  delete from auth.users where id = who;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;

-- ── Proof ─────────────────────────────────────────────────────────────────
--
-- Signed in as somebody with work in the account:
--
--   select count(*) from public.projects;      -- some
--   select public.delete_my_account();
--   select count(*) from public.projects;      -- 0 — and the session is dead
--
-- And the shape that must never work, from any caller:
--
--   select public.delete_my_account('someone-else');   -- no such function
