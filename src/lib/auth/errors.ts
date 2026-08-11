/**
 * Supabase's errors, in sentences.
 *
 * Every string on the left is something a real project returns on a real
 * afternoon, and most of them are not the user's fault at all — they are a
 * switch in the Supabase dashboard that has not been flipped. "Anonymous
 * sign-ins are disabled" tells the person sitting in front of the screen
 * nothing about what to do; naming the exact page does.
 *
 * `fix` is set only where there is a concrete thing to go and change. Where
 * the answer really is "your password was wrong", inventing a remedy would be
 * worse than saying nothing.
 */

export interface Explained {
  /** What happened, addressed to whoever is looking at the screen. */
  message: string;
  /** The switch to flip, when there is one. Shown in a quieter voice. */
  fix?: string;
  /**
   * Whether this is a configuration problem rather than a rejection. The forms
   * colour these differently: a missing switch is not a wrong password.
   */
  setup?: boolean;
  /** The address needs confirming before it can be signed in with. */
  unconfirmed?: boolean;
}

/** Substring → explanation. First match wins, so order the specific first. */
const KNOWN: Array<[RegExp, Explained]> = [
  [
    /anonymous sign-ins are disabled/i,
    {
      message:
        "Anonymous sign-ins are switched off in this Supabase project, so work can't be kept without an account.",
      fix: "Supabase → Authentication → Sign In / Providers → Anonymous Sign-Ins.",
      setup: true,
    },
  ],
  [
    /signups not allowed|signup is disabled|email signups are disabled/i,
    {
      message: "This Supabase project isn't accepting new accounts.",
      fix: "Supabase → Authentication → Sign In / Providers → Email → Allow new users to sign up.",
      setup: true,
    },
  ],
  [
    /database error (saving|granting|finding|querying)/i,
    {
      message:
        "The database refused to create the account. That is almost always the schema: supabase/schema.sql hasn't been run on this project, or it failed part way.",
      fix: "Run supabase/schema.sql in the SQL editor, then try again.",
      setup: true,
    },
  ],
  [
    /email not confirmed/i,
    {
      message:
        "This account exists, but the email address hasn't been confirmed yet.",
      fix: "Click the link in the confirmation email — or send yourself a new one below.",
      unconfirmed: true,
    },
  ],
  [
    /invalid login credentials|invalid.*password/i,
    {
      message: "That email and password don't match an account.",
      fix: "If you've never signed up on this project, create an account instead.",
    },
  ],
  [
    /user already registered|already been registered|already exists/i,
    {
      message: "There's already an account with that email address.",
      fix: "Sign in instead — or reset the password if you've forgotten it.",
    },
  ],
  [
    /email address .* is invalid|unable to validate email/i,
    { message: "Supabase rejected that email address as invalid." },
  ],
  [
    /password should be at least (\d+)/i,
    { message: "This project wants a longer password than that." },
  ],
  [
    /weak password|password is too weak|pwned/i,
    {
      message:
        "Supabase rejected that password as too weak or too widely leaked.",
      fix: "Pick something longer, and not one you use elsewhere.",
    },
  ],
  [
    /for security purposes|rate limit|too many requests|over_email_send_rate/i,
    {
      message:
        "Supabase is rate-limiting emails from this project. The built-in mailer allows only a handful an hour.",
      fix: "Wait a minute and try again, or connect your own SMTP in Supabase → Project Settings → Auth.",
      setup: true,
    },
  ],
  [
    /token has expired|expired or is invalid|otp_expired/i,
    {
      message: "That link has expired or has already been used.",
      fix: "Ask for a new one — links are good for an hour by default.",
    },
  ],
  [
    /invalid api key|jwt|apikey/i,
    {
      message: "This project rejected the key the app is using.",
      fix: "Check NEXT_PUBLIC_SUPABASE_ANON_KEY against Supabase → Project Settings → API. It must be the anon public key, not the service role key.",
      setup: true,
    },
  ],
  [
    /relation .* does not exist|schema cache|could not find the table/i,
    {
      message:
        "The database is reachable, but the tables this app needs aren't there.",
      fix: "Run supabase/schema.sql in the Supabase SQL editor.",
      setup: true,
    },
  ],
  [
    /row-level security|violates row level security|permission denied/i,
    {
      message:
        "The database refused the write. The tables are there but the policies aren't the ones this app expects.",
      fix: "Re-run supabase/schema.sql — it recreates the policies and is safe to run twice.",
      setup: true,
    },
  ],
  [
    /failed to fetch|network ?error|load failed|fetch failed/i,
    {
      message: "The Supabase project didn't answer.",
      fix: "Check NEXT_PUBLIC_SUPABASE_URL, and whether the project is paused — free projects pause after a week of inactivity.",
      setup: true,
    },
  ],
  [
    /new email address should be different|same as the old/i,
    { message: "That's already the address on this account." },
  ],
  [
    /same_password|should be different from the old/i,
    { message: "That's the password you already have." },
  ],
];

/**
 * Turn whatever came back into something worth reading. Unrecognised errors
 * are passed through rather than replaced with a shrug: the raw text is at
 * least true, and it is what someone will paste into a search box.
 */
export function explainAuthError(error: unknown): Explained {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String((error as { message?: string })?.message ?? "");

  for (const [pattern, explained] of KNOWN)
    if (pattern.test(raw)) return explained;

  return { message: raw.trim() || "Something went wrong." };
}

/** The same thing as one line, for places with no room for two. */
export function explainAuthErrorLine(error: unknown): string {
  const { message, fix } = explainAuthError(error);
  return fix ? `${message} ${fix}` : message;
}
