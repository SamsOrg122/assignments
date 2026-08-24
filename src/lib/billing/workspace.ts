/**
 * Is this caller allowed to spend on that workspace?
 *
 * Asked of the database, as the caller, so the answer comes from the same
 * membership policy that governs everything else they can see. The
 * alternative — a service-role key and a query the server writes itself —
 * would mean the rule lived in two places and could disagree with itself.
 *
 * A workspace they may not see returns no rows under row-level security,
 * which is indistinguishable from one that does not exist. That is the
 * correct answer to give a stranger either way.
 */

function project(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

export async function memberOf(token: string, workspaceId: string): Promise<boolean> {
  const where = project();
  if (!where) return false;

  // A malformed id would reach PostgREST as a filter it cannot parse; refuse
  // it here rather than reading a 400 as "not a member".
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return false;

  try {
    const response = await fetch(
      `${where.url}/rest/v1/workspaces?select=id&id=eq.${workspaceId}&limit=1`,
      {
        headers: { apikey: where.anonKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!response.ok) return false;
    const rows = (await response.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    // Unreachable is not the same as "not a member", but the only safe
    // direction to fail in here is the one that does not take money.
    return false;
  }
}
