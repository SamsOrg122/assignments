-- Money arrives from outside, and has to be written down.
--
-- A Stripe webhook is the one caller in this system with no person behind
-- it. There is no session, no `auth.uid()`, nobody whose row-level policies
-- can decide what it may touch — and it still has to grant somebody a plan.
--
-- ── WHY NOT A SERVICE-ROLE KEY ───────────────────────────────────────────
-- Because that is the answer everybody reaches for and it is far too big.
-- A service-role key bypasses row-level security on every table: one leaked
-- environment variable and every note, document and file in the database is
-- readable. This project has gone without one on purpose, and a webhook is a
-- poor reason to introduce the first one.
--
-- So the webhook gets a key that can do exactly one thing: record a
-- subscription. It calls this function with a shared secret, as the ordinary
-- anonymous role. If the secret leaks, what an attacker gains is the ability
-- to give somebody a Pro plan they did not pay for — embarrassing, and
-- recoverable by rotating one row. They cannot read a single document.
--
-- ── ON COMPARING THE SECRET ──────────────────────────────────────────────
-- What is stored is a SHA-256 of the secret, not the secret. `=` on bytea is
-- not constant-time, so a determined attacker could in principle learn
-- something from how long a comparison takes — but what leaks is progress
-- towards a *hash*, and inverting SHA-256 is the part that does not work.
-- Storing the secret in the clear and comparing that would leak progress
-- towards the secret itself, which is the difference that matters.
--
-- ── ON BEING CALLED TWICE ────────────────────────────────────────────────
-- Stripe retries. It promises at-least-once, never exactly-once, so this has
-- to be safe to run again with the same event. The subscription is an upsert
-- keyed on the workspace, and the ledger row is keyed on the payment's own
-- id — a second delivery of the same payment changes nothing rather than
-- doubling the money set aside.

begin;

/*
 * Hashing, without pgcrypto.
 *
 * This used to call `digest(secret, 'sha256')`, and that is exactly right on
 * a plain Postgres and exactly wrong on Supabase. Supabase installs its
 * extensions into a schema called `extensions`, not into `public` — so
 * pgcrypto's `digest` is there and not on the search path a `security
 * definer` function pins. The whole file then failed at the moment this
 * function was created, on the only kind of database it was written for.
 *
 * `sha256(bytea)` needs no extension at all: it has been in `pg_catalog`
 * since Postgres 11, so it is visible whatever the search path says. And it
 * returns the same bytes — `digest(t, 'sha256')` hashes the text's UTF-8
 * encoding, which is what `convert_to(t, 'utf8')` hands over — so a secret
 * set by the earlier version still matches after this runs.
 */

/*
 * The one secret, hashed.
 *
 * A table rather than a database setting so it can be rotated with an update
 * and read back by nobody: row-level security is on and there is no policy,
 * which means no client — anon or authenticated — can select from it. Only
 * the definer function below ever sees it.
 */
create table if not exists public.billing_secret (
  id       boolean primary key default true check (id),
  digest   bytea not null,
  rotated_at timestamptz not null default now()
);

alter table public.billing_secret enable row level security;
revoke all on public.billing_secret from anon, authenticated;

/*
 * Set or rotate the secret. Run by hand, from the SQL editor, as the owner.
 *
 * Takes the secret in the clear because it has to be told it once; nothing
 * stores it afterwards but the digest.
 */
create or replace function public.set_billing_secret(secret text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.billing_secret (id, digest, rotated_at)
  values (true, sha256(convert_to(secret, 'utf8')), now())
  on conflict (id) do update
    set digest = excluded.digest, rotated_at = now();
$$;

revoke all on function public.set_billing_secret(text) from public, anon, authenticated;

/*
 * Record what the payment provider says happened.
 *
 * Every number here comes from Stripe's own view of the charge, never from
 * anything a browser sent: `amount_cents` is what was actually captured. The
 * checkout route puts the workspace in the session's metadata and Stripe
 * hands it back, so the client cannot nominate somebody else's workspace
 * after the fact — and even if it did, the worst case is a plan granted to a
 * workspace whose owner did not ask for one, not a disclosure.
 *
 * `share_bps` is passed in rather than read from a table so the split in
 * force on the day of the charge is the one written into the ledger. A
 * ledger that recomputes history when a rate changes is not a ledger.
 */
create or replace function public.record_subscription(
  secret          text,
  p_workspace_id  uuid,
  p_plan          text,
  p_status        text,
  p_seats         integer,
  p_interval      text,
  p_customer_id   text,
  p_subscription_id text,
  p_period_end    timestamptz,
  p_amount_cents  integer default null,
  p_share_bps     integer default null,
  p_payment_ref   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  known bytea;
begin
  select digest into known from public.billing_secret where id;
  if known is null then
    raise exception 'billing secret is not set; run set_billing_secret() first';
  end if;
  if sha256(convert_to(coalesce(secret, ''), 'utf8')) <> known then
    raise exception 'billing secret does not match';
  end if;

  -- The table's own checks refuse a plan or status that is not real, so a
  -- provider sending something unexpected fails loudly here rather than
  -- writing a row nothing downstream knows how to read.
  insert into public.subscriptions (
    workspace_id, plan, status, seats, interval,
    provider, provider_customer_id, provider_subscription_id,
    current_period_end, updated_at
  )
  values (
    p_workspace_id, p_plan, p_status, greatest(coalesce(p_seats, 1), 1),
    coalesce(p_interval, 'month'), 'stripe', p_customer_id, p_subscription_id,
    p_period_end, now()
  )
  on conflict (workspace_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    seats = excluded.seats,
    interval = excluded.interval,
    provider_customer_id = coalesce(excluded.provider_customer_id, public.subscriptions.provider_customer_id),
    provider_subscription_id = coalesce(excluded.provider_subscription_id, public.subscriptions.provider_subscription_id),
    current_period_end = excluded.current_period_end,
    updated_at = now();

  -- Only when money actually moved. A subscription going from trialing to
  -- active is not a payment, and a ledger that counted it would overstate
  -- what has been set aside — which is the one number on this site that has
  -- to be defensible.
  if p_amount_cents is not null and p_amount_cents > 0 and p_payment_ref is not null then
    insert into public.impact_ledger (workspace_id, revenue_cents, share_bps, transfer_ref)
    select p_workspace_id, p_amount_cents, coalesce(p_share_bps, 0), p_payment_ref
    -- Stripe retries; this is what makes a second delivery cost nothing.
    where not exists (
      select 1 from public.impact_ledger where transfer_ref = p_payment_ref
    );
  end if;
end;
$$;

/*
 * Reachable by the anonymous role, because the webhook has no session — the
 * secret is the credential, not the JWT. That is only safe because this
 * function can do nothing except what is written above it.
 */
revoke all on function public.record_subscription(
  text, uuid, text, text, integer, text, text, text, timestamptz, integer, integer, text
) from public;
grant execute on function public.record_subscription(
  text, uuid, text, text, integer, text, text, text, timestamptz, integer, integer, text
) to anon, authenticated;

commit;

-- ── Setting it up ─────────────────────────────────────────────────────────
--
--   select public.set_billing_secret('<paste 32+ random characters>');
--
-- Put the same value in the deployment as STRIPE_HOOK_DB_SECRET. To rotate,
-- run it again with a new value and update the variable; the old one stops
-- working the moment the update commits.
--
-- ── Proof ─────────────────────────────────────────────────────────────────
--
--   -- as anon, with the wrong secret: refused
--   select public.record_subscription('wrong', '<workspace>', 'pro', 'active',
--     1, 'month', 'cus_x', 'sub_x', now() + interval '1 month', 900, 100, 'pi_1');
--
--   -- with the right one: one subscription row, one ledger row
--   -- running it a second time with the same pi_1 leaves the ledger alone
--
--   -- and the secret itself stays unreadable:
--   select * from public.billing_secret;   -- permission denied
