"use client";

/**
 * Where the Supabase keys come from.
 *
 * Two sources, tried in order:
 *
 *   1. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which
 *      Next compiles into the browser bundle at build time.
 *   2. `/api/config`, which reads the same names — plus the unprefixed
 *      `SUPABASE_URL` and `SUPABASE_ANON_KEY` — on the server, per request.
 *
 * The second exists because of a trap that costs people an afternoon. A
 * `NEXT_PUBLIC_` variable is *compiled in*: setting one in a host's dashboard
 * changes nothing at all until the next deploy, and the app goes on insisting
 * accounts aren't switched on while the dashboard plainly shows the keys. With
 * the runtime lookup, keys work the moment they are set.
 *
 * Only the anonymous key is ever served. It is public by design — it is in the
 * browser bundle in the normal case — and every table it can reach is behind
 * row level security. The service role key is never read here.
 */

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface RemoteConfig {
  url: string;
  anonKey: string;
  /** Which of the two sources answered. Shown by the diagnostics panel. */
  from: "build" | "server";
}

const built: RemoteConfig | null =
  PUBLIC_URL && PUBLIC_KEY
    ? { url: PUBLIC_URL, anonKey: PUBLIC_KEY, from: "build" }
    : null;

/**
 * How somebody may sign in, beyond an email and a password.
 *
 * Empty until `/api/config` answers, and empty is the normal answer: these
 * only appear when the deployment names them, because a provider button that
 * nobody enabled in Supabase is a button that ends on an error page.
 */
export interface AuthOptions {
  providers: string[];
  ssoDomains: string[];
}

const NO_AUTH_OPTIONS: AuthOptions = { providers: [], ssoDomains: [] };

let current: RemoteConfig | null = built;
let authOptions: AuthOptions = NO_AUTH_OPTIONS;
/**
 * Whether the runtime lookup has finished. Distinct from "there is no config":
 * the UI has to be able to say "checking" rather than announcing that accounts
 * are off and then contradicting itself half a second later.
 */
let settled = built !== null;
/**
 * Whether the server has been asked *at all*, which is not the same question.
 *
 * With the keys compiled in, `settled` is true before the page loads and the
 * lookup used to be skipped entirely — so a deployment that named its sign-in
 * providers never found out about them, because the only thing that reads them
 * is this same call. The keys still short-circuit nothing else: `current` is
 * left alone if it is already set.
 */
let asked = false;
let inFlight: Promise<RemoteConfig | null> | null = null;

const watchers = new Set<() => void>();

export const remoteConfig = (): RemoteConfig | null => current;
export const remoteConfigSettled = (): boolean => settled;
export const authOptionsFor = (): AuthOptions => authOptions;

export function subscribeConfig(fn: () => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

const announce = () => watchers.forEach((fn) => fn());

/**
 * Ask the server, once per page load.
 *
 * Resolves to whatever is configured — including null, which is a real answer
 * and the normal one for someone running this without a database.
 */
export function ensureRemoteConfig(): Promise<RemoteConfig | null> {
  if (asked) return Promise.resolve(current);
  if (inFlight) return inFlight;

  inFlight = fetch("/api/config", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then(
      (
        body: {
          supabase?: { url?: string; anonKey?: string };
          auth?: { providers?: string[]; ssoDomains?: string[] };
        } | null,
      ) => {
        const url = body?.supabase?.url;
        const anonKey = body?.supabase?.anonKey;
        if (url && anonKey && !current) current = { url, anonKey, from: "server" };
        authOptions = {
          providers: body?.auth?.providers ?? [],
          ssoDomains: body?.auth?.ssoDomains ?? [],
        };
        return current;
      },
    )
    .catch(() => current)
    .finally(() => {
      settled = true;
      asked = true;
      inFlight = null;
      announce();
    });

  return inFlight;
}

/**
 * For tests and for the diagnostics panel's "try these keys" path. Passing
 * null puts it back to whatever was compiled in.
 */
export function setRemoteConfig(config: RemoteConfig | null) {
  current = config ?? built;
  settled = true;
  announce();
}

/** For tests. The real list only ever comes from `/api/config`. */
export function setAuthOptions(options: AuthOptions | null) {
  authOptions = options ?? NO_AUTH_OPTIONS;
  announce();
}
