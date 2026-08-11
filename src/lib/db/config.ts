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

let current: RemoteConfig | null = built;
/**
 * Whether the runtime lookup has finished. Distinct from "there is no config":
 * the UI has to be able to say "checking" rather than announcing that accounts
 * are off and then contradicting itself half a second later.
 */
let settled = built !== null;
let inFlight: Promise<RemoteConfig | null> | null = null;

const watchers = new Set<() => void>();

export const remoteConfig = (): RemoteConfig | null => current;
export const remoteConfigSettled = (): boolean => settled;

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
  if (settled) return Promise.resolve(current);
  if (inFlight) return inFlight;

  inFlight = fetch("/api/config", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { supabase?: { url?: string; anonKey?: string } } | null) => {
      const url = body?.supabase?.url;
      const anonKey = body?.supabase?.anonKey;
      if (url && anonKey) current = { url, anonKey, from: "server" };
      return current;
    })
    .catch(() => current)
    .finally(() => {
      settled = true;
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
