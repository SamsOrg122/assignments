/**
 * Who is asking, and what it costs them.
 *
 * Both model endpoints need the same two answers before they spend anything:
 * whose token is this, and have they had their share today. That logic lived
 * inside `/api/assist` and `/api/ai` had none of it at all — it was a public
 * endpoint in front of somebody's budget. One implementation now, so the two
 * cannot drift into disagreeing about who is allowed.
 *
 * The token is verified against the project rather than merely parsed. An
 * unverified JWT is a string anybody can type.
 */

/** Where the project lives, whichever name the deployment used. */
function project(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

export interface Caller {
  userId: string;
  /** The caller's own token, for acting as them. See `chargeOne`. */
  token: string;
}

export type Asking =
  | { ok: true; caller: Caller }
  | { ok: false; response: Response };

/**
 * Verify the bearer token against the project.
 *
 * Anonymous sessions pass, and that is deliberate: the free plan has no
 * login, the app signs every browser in anonymously, and refusing those would
 * turn "no account needed" into a lie. What this rejects is the caller with
 * no session at all — a script pointed straight at the endpoint.
 */
export async function whoIsAsking(request: Request): Promise<Asking> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token)
    return {
      ok: false,
      response: Response.json(
        { error: "Reload the page and try again — this browser has no session yet." },
        { status: 401 },
      ),
    };

  const where = project();
  if (!where)
    return {
      ok: false,
      response: Response.json(
        { error: "This deployment has no account database, so there is nobody to ask as." },
        { status: 501 },
      ),
    };

  try {
    const check = await fetch(`${where.url}/auth/v1/user`, {
      headers: { apikey: where.anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!check.ok)
      return {
        ok: false,
        response: Response.json(
          { error: "That session is no longer valid. Reload the page." },
          { status: 401 },
        ),
      };

    const user = (await check.json()) as { id?: unknown };
    const userId = typeof user.id === "string" ? user.id : "";
    if (!userId)
      return {
        ok: false,
        response: Response.json({ error: "Couldn't identify you." }, { status: 401 }),
      };

    return { ok: true, caller: { userId, token } };
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: "Couldn't check that session just now. Try again in a moment." },
        { status: 503 },
      ),
    };
  }
}

/**
 * How many model requests one account gets per day.
 *
 * A number rather than a plan lookup, because the thing this defends against
 * is a loop, and a loop does not care which plan it is on. Deployments that
 * want a different ceiling set `AI_DAILY_LIMIT`; the default is high enough
 * that ordinary use never meets it and low enough that a runaway costs
 * pennies rather than a weekend.
 */
export function dailyAllowance(): number {
  const raw = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
}

export interface Charge {
  spent: number;
  allowed: boolean;
}

/**
 * Charge this request to the caller's day.
 *
 * Performed *as the caller*, with their token, because this project has no
 * service-role key — nothing here holds a credential that can read every row.
 * The counter is still not theirs to reset: `ai_spend` is a security-definer
 * function and the table underneath has no write policy at all. See
 * migration 0010.
 *
 * A database that cannot be reached does not block the request. That is a
 * deliberate direction to fail in: the ceiling exists to stop a runaway, and
 * an outage in the counter turning into an outage in the assistant would be
 * the counter causing the incident it was added to prevent. The spend limit
 * on the model key is what covers this window, which is exactly why the
 * deployment notes insist on one.
 */
export async function chargeOne(caller: Caller): Promise<Charge> {
  const where = project();
  if (!where) return { spent: 0, allowed: true };

  try {
    const response = await fetch(`${where.url}/rest/v1/rpc/ai_spend`, {
      method: "POST",
      headers: {
        apikey: where.anonKey,
        Authorization: `Bearer ${caller.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ allowance: dailyAllowance() }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });

    if (!response.ok) return { spent: 0, allowed: true };

    // PostgREST returns a one-row table as an array of one object.
    const rows = (await response.json()) as Array<{ spent?: unknown; allowed?: unknown }>;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { spent: 0, allowed: true };

    return {
      spent: typeof row.spent === "number" ? row.spent : 0,
      allowed: row.allowed !== false,
    };
  } catch {
    return { spent: 0, allowed: true };
  }
}

/** What somebody who has had their share for today is told. */
export function overAllowance(): Response {
  return Response.json(
    {
      error: `That is ${dailyAllowance()} questions today, which is where this account's daily limit sits. It resets at midnight UTC. Everything else in the tool keeps working.`,
    },
    { status: 429 },
  );
}
