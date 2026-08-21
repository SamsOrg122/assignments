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

/**
 * Which providers the Supabase project *actually* has switched on.
 *
 * This used to be declared by hand in `AUTH_PROVIDERS`, which meant enabling
 * Google was two steps in two places and forgetting the second one looked
 * exactly like the feature not existing. Supabase publishes the answer at
 * `/auth/v1/settings` — unauthenticated, because a browser has to know which
 * buttons to draw before anybody has signed in — so the app can simply ask.
 *
 * The old reasoning still holds and is why this is a *lookup* rather than a
 * default list: a "Continue with Google" button on a project where Google was
 * never enabled is a dead end dressed up as a feature. Reading the truth
 * satisfies that better than declaring it twice.
 */
const TTL_MS = 60_000;
let cached: { at: number; providers: string[] } | null = null;

async function enabledProviders(url: string, anonKey: string): Promise<string[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.providers;

  // A slow or unreachable project must not hold this route open — the rest of
  // the answer (the database keys) is what the app cannot start without.
  const stop = AbortSignal.timeout(4_000);
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: stop,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { external?: Record<string, unknown> };
    const external = body.external ?? {};
    const providers = KNOWN_PROVIDERS.filter((name) => external[name] === true);
    cached = { at: Date.now(), providers: [...providers] };
    return cached.providers;
  } catch {
    // Unreachable is not the same as "none configured", so a previous good
    // answer outlives a blip rather than making the buttons flicker away.
    return cached?.providers ?? [];
  }
}

export async function GET() {
  // Unprefixed names are accepted too. Someone who sets `SUPABASE_URL` has
  // configured their database by any reasonable reading, and refusing it on a
  // naming technicality helps nobody.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  /*
   * Which ways in to offer.
   *
   * Asked of the project itself, so switching Google on in the Supabase
   * dashboard is the whole job. `AUTH_PROVIDERS` survives as a *narrowing*:
   * a deployment that wants only some of what its project has enabled names
   * them, and anything it names that isn't actually on is still dropped —
   * the point has always been that no button is offered which cannot work.
   */
  const wanted = list(
    process.env.AUTH_PROVIDERS ?? process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
  );
  const live = url && anonKey ? await enabledProviders(url, anonKey) : [];
  const providers = wanted.length
    ? live.filter((name) => wanted.includes(name))
    : live;

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
