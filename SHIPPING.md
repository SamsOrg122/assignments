# Before it goes live

Everything in here is a thing **only you can do** — it needs a password, a
card, or a dashboard I have no access to. The code side is done and on
`claude/assignments-web-app-udolko`.

Work down the list. It is in order of what hurts most if you skip it.

---

## 1. Put a spend limit on the OpenRouter key — do this first

Five minutes, and it is the difference between a bad night and an impossible
one. Everything else on this list can wait a day; this cannot.

1. openrouter.ai → **Settings → Credits**
2. Set a hard monthly limit you would be willing to lose entirely. Start low.
   You can always raise it.
3. **Keys** → open the key tougather.com uses → give that key its own limit
   too, below the account limit.

There is now a per-account daily ceiling in the app as well (120 questions,
`AI_DAILY_LIMIT` to change it) and both model endpoints require a session.
Neither is proof of personhood: somebody willing to clear their browser gets
a fresh anonymous account and a fresh allowance. The spend limit is the floor
under all of it, and no code in this repository can set it.

## 2. Run the new migrations

Supabase → **SQL Editor** → paste and run, in this order:

- `supabase/migrations/0010-a-ceiling-on-the-model.sql`
- `supabase/migrations/0011-a-way-out.sql`
- `supabase/migrations/0012-money-arrives-from-outside.sql` — only needed if
  you are taking payments; harmless to run either way
- `supabase/migrations/0013-a-thing-with-a-deadline.sql` — the assignments
  table. Without it the board still works, but only on the machine it was
  typed on, and the page says so.

All of them are re-runnable. Each ends with a **Proof** block in comments — run those
lines too, signed in as an ordinary user. 0010's proof should refuse the
fourth request and refuse to let you reset your own counter; 0011's should
empty your account.

If you are not sure the earlier migrations ever ran, `supabase/catch-up.sql`
is 0003–0009 in one re-runnable file. Run that first.

Symptoms of skipping this: the assistant keeps working but nothing is
counted, Delete my account answers *"Could not find the function"*, and
Assignments shows a line naming 0013.

## 3. Deploy the site

Everything above is theory until tougather.com serves this branch. The
download buttons already point at `desktop-v0.1.6`, which is published — so
until you deploy, the site still hands people 0.1.5 and the old blue notepad.

## 4. Environment variables

On the hosting dashboard, for **production**:

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project |
| `OPENROUTER_API_KEY` | without it the assistant answers with a refusal |
| `NEXT_PUBLIC_SITE_URL` | `https://tougather.com` — sign-in redirects are built from it |
| `AI_DAILY_LIMIT` | optional; defaults to 120 |
| `STRIPE_SECRET_KEY` | only if you are taking payments — see 7 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | as above |
| `STRIPE_WEBHOOK_SECRET` | as above |
| `STRIPE_HOOK_DB_SECRET` | as above |

Never add a Supabase **service-role** key. Nothing here needs one and its
presence would undo the reason the two new migrations are shaped the way they
are.

## 5. Google sign-in

1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID**
   (type: Web application).
2. Authorised redirect URI — this is the **Supabase** callback, not yours:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Supabase → **Authentication → Providers → Google** → paste the client id
   and secret, enable.
4. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://tougather.com`
   - Redirect URLs: add `https://tougather.com/**`

The sign-in screen shows a provider only once Supabase reports it enabled, so
the Google button appearing is itself the confirmation that step 3 worked.

## 6. Email — the quiet one that breaks signups

Supabase's built-in mail is rate-limited to a handful an hour and lands in
spam. Sign-up confirmation and password reset are unreliable until you fix
this, and people will read that as "the site is broken".

1. Sign up with Resend or Postmark (both have a free tier).
2. Verify the domain — add the DKIM and SPF records they give you.
3. Supabase → **Project Settings → Authentication → SMTP Settings** → enter
   their host, port, user and password. Set the sender to something at
   tougather.com.
4. Send yourself a password reset and a fresh signup, and check both land in
   an inbox rather than spam.

## 7. Switching payments on

The code is written and tested; it stays 501 until these exist. Nothing
breaks while it is off, and launching free is still a fine choice.

1. **Stripe → Products.** Create a product and a price per plan, monthly and
   yearly. Copy the price ids into `STRIPE_PRICE_IDS` in
   `src/lib/billing/index.ts`.
2. **Keys.** Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   on the deployment.
3. **Run `supabase/migrations/0012-money-arrives-from-outside.sql`**, then set
   the secret the webhook writes with:
   ```sql
   select public.set_billing_secret('<paste 32+ random characters>');
   ```
   Put that same value in the deployment as `STRIPE_HOOK_DB_SECRET`. To
   rotate later, run it again with a new value and update the variable.
4. **Stripe → Developers → Webhooks → Add endpoint**, pointing at
   `https://tougather.com/api/stripe/webhook`. Send these events:
   `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. **Test with a card before telling anyone.** Stripe's `4242 4242 4242 4242`
   in test mode. Then check the database: one row in `subscriptions` for the
   workspace, one in `impact_ledger` for the payment. Stripe's dashboard will
   show whether the webhook returned 200.

Why there is no service-role key in that list: a webhook has no session, and
the usual fix bypasses row-level security on every table. Instead it calls
one function that can do nothing but record a subscription. If
`STRIPE_HOOK_DB_SECRET` leaks, somebody can grant a plan nobody paid for.
They cannot read a document. Rotate it and move on.

**Still yours before you charge:** the twelve `status: "placeholder"` entries
in `src/lib/impact/config.ts` are working assumptions, including the 10%
share of revenue. Claiming them as fact while taking money is the kind of
thing that ends a project — either confirm them or mark them clearly as
intentions on the page.

## 8. Code signing for the desktop app

The biggest drop-off at install: macOS says the app is *damaged*, Windows
SmartScreen warns. Both are what every unsigned app gets, and both scare
people off.

The build is already wired for it — turning it on is adding two secrets, not
rewriting the workflow. See the Signing section in
`.github/workflows/desktop.yml`. You need an Apple Developer account
(€99/yr) and, for Windows, a code-signing certificate.

## 9. Worth doing in the first week

- **Error monitoring.** There is none. Right now you learn about bugs when
  somebody emails you. Sentry's free tier is enough.
- **A rate limiter at the edge.** The in-app one is a counter in memory and
  says so in its own source. Vercel Firewall or Cloudflare gives you one that
  actually holds across instances.
- **Back-ups.** Check Supabase's retention on your plan and know how to
  restore. Untested backups are not backups.

---

## What is already handled

So you do not redo it:

- Both model endpoints require a session and are charged per account per day,
  in Postgres, where the person being counted cannot reset it.
- Delete-my-account works and takes the browser's copy with it.
- Migrations are re-runnable and each carries its own proof.
- The desktop release 0.1.6 is published with all seven installers and
  carries the redesign.
- CI refuses a build where the version disagrees across the four files that
  state it, and refuses two modules whose names differ only in case.
- Checkout and the Stripe webhook are written and tested — signature checks,
  membership checks, and a retry from Stripe that cannot double-count a
  payment. They need the keys in 7 and nothing else.
- `npm audit` reports zero vulnerabilities.
