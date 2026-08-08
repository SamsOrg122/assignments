"use client";

/**
 * The one Supabase client.
 *
 * A single instance per browser, created lazily. Two clients on one page means
 * two auth listeners and two token refresh timers racing each other, and the
 * symptom — a session that randomly reverts to signed-out — is miserable to
 * track down.
 *
 * Null when the environment variables aren't set, which is the normal case
 * today: the app runs entirely in the browser and everything that would use
 * this checks first.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let attempted = false;

export function supabase(): SupabaseClient | null {
  if (attempted) return client;
  attempted = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: {
      // The free plan has no sign-up, so a session has to survive a reload on
      // its own — there is nothing to log back in with.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
