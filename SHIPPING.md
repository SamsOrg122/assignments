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

## 2. Run the two new migrations

Supabase → **SQL Editor** → paste and run, in this order:

- `supabase/migrations/0010-a-ceiling-on-the-model.sql`
- `supabase/migrations/0011-a-way-out.sql`

Both are re-runnable. Each ends with a **Proof** block in comments — run those
lines too, signed in as an ordinary user. 0010's proof should refuse the
fourth request and refuse to let you reset your own counter; 0011's should
empty your account.

If you are not sure the earlier migrations ever ran, `supabase/catch-up.sql`
is 0003–0009 in one re-runnable file. Run that first.

Symptoms of skipping this: the assistant keeps working but nothing is
counted, and Delete my account answers *"Could not find the function"*.

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

## 7. Before you take money

Not needed to launch free, and launching free is a fine choice — but do not
put a Buy button up before all of this is true:

- `src/lib/billing/index.ts` — price ids from your Stripe dashboard
- `src/app/api/checkout/route.ts` — the marked block; it returns 501 today
- The Stripe **webhook** route does not exist yet. Without it a payment
  succeeds and the plan is never granted, which is the worst possible bug to
  have in public.
- The twelve `status: "placeholder"` entries in `src/lib/impact/config.ts`
  are working assumptions. Claiming them as fact while charging for them is
  the kind of thing that ends a project.

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
