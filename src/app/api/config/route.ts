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

export function GET() {
  // Unprefixed names are accepted too. Someone who sets `SUPABASE_URL` has
  // configured their database by any reasonable reading, and refusing it on a
  // naming technicality helps nobody.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  return Response.json(
    { supabase: url && anonKey ? { url, anonKey } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
