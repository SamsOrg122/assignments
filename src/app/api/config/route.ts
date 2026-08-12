/**
 * What is configured, read at request time.
 *
 * `NEXT_PUBLIC_` variables are compiled into the browser bundle, so setting
 * one in a host's dashboard has no effect until the next deploy. That is a
 * genuinely confusing failure — the dashboard says the keys are there and the
 * app says accounts aren't switched on — so the client asks here as well, and
 * the answer comes from the environment as it is right now.
 *
 * Only the anonymous key is served. It is public by design: in the normal
 * build-time case it is already sitting in the JavaScript every visitor
 * downloads, and everything it can reach is behind row level security. The
 * service role key is deliberately not read in this file.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth providers this app knows how to send someone to. The list is closed
 * because the value ends up in `signInWithOAuth`, and an unknown name there
 * produces a redirect to a Supabase error page rather than anything useful.
 */
const KNOWN_PROVIDERS = [
  "google",
  "azure",
  "github",
  "apple",
  "gitlab",
  "bitbucket",
  "slack_oidc",
  "keycloak",
  "workos",
] as const;

const list = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

export function GET() {
  // Unprefixed names are accepted too. Someone who sets `SUPABASE_URL` has
  // configured their database by any reasonable reading, and refusing it on a
  // naming technicality helps nobody.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  /*
   * Single sign-on is *declared* here and configured in Supabase.
   *
   * Nothing in this app can make a provider work; the dashboard does that.
   * What this variable decides is whether the buttons are offered at all —
   * and that matters, because a "Continue with Microsoft" button on a
   * deployment where Microsoft was never enabled is a dead end dressed up as
   * a feature. No variable, no buttons, and the password form stands alone.
   */
  const providers = list(
    process.env.AUTH_PROVIDERS ?? process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
  ).filter((name): name is (typeof KNOWN_PROVIDERS)[number] =>
    (KNOWN_PROVIDERS as readonly string[]).includes(name),
  );

  // SAML domains, for organisations whose identity provider is their own.
  // `signInWithSSO` takes the domain; Supabase resolves it to the connection
  // that was registered with the CLI. Requires a plan that includes SAML.
  const ssoDomains = list(
    process.env.AUTH_SSO_DOMAINS ?? process.env.NEXT_PUBLIC_AUTH_SSO_DOMAINS,
  );

  return Response.json(
    {
      supabase: url && anonKey ? { url, anonKey } : null,
      auth: { providers, ssoDomains },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
