/**
 * What every route does before it does anything else.
 *
 * These routes were open. Not "authenticated with a weak scheme" — open: no
 * identity, no ceiling, no size limit. For most of them that is a design
 * choice worth keeping, because the free plan has no login and a session
 * cannot ask a stranger to sign in before their pointer moves. But open and
 * *unbounded* are different things, and the difference is what somebody with a
 * loop can do to you overnight:
 *
 *   - `/api/ai` spends real money per request. Unmetered, it is a stranger's
 *     budget with a public endpoint in front of it.
 *   - The relay and the note box hold memory per room. Unmetered, a few
 *     thousand requests fill the process and everybody's session stops.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 * A counter in one process's memory. It survives nothing — not a restart, not
 * a second instance — and an attacker with a botnet has as many buckets as
 * they have addresses. It raises the cost of the *casual* version of each of
 * these attacks from "a for-loop" to "infrastructure", which is worth having
 * and is not a substitute for a real limiter at the edge. Say so out loud
 * rather than let the file imply otherwise.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface Bucket {
  count: number;
  resetAt: number;
}

/* Hung off globalThis for the same reason the relay's rooms are: Next replaces
   the module on every hot reload, and a module-level Map would be a new one. */
const buckets: Map<string, Bucket> = ((
  globalThis as { __rateBuckets?: Map<string, Bucket> }
).__rateBuckets ??= new Map());

/** Nothing here is worth remembering for long, and memory is the resource. */
const MAX_BUCKETS = 10_000;

/**
 * Who is asking, as well as this can be known behind a proxy.
 *
 * `x-forwarded-for` is set by the platform in front of this and can be forged
 * when nothing is in front of it — which is exactly when the limiter matters
 * least. The leftmost entry is the client as the first proxy saw it.
 */
function caller(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export interface Limit {
  /** Requests allowed inside the window. */
  limit: number;
  windowMs: number;
  /** Distinguishes one route's budget from another's. */
  name: string;
}

/**
 * Returns a 429 to send back, or null to carry on.
 *
 * A `Retry-After` because a client that is told to wait can wait; one that is
 * told only "no" retries immediately and makes it worse.
 */
export function overLimit(request: Request, limit: Limit): Response | null {
  const now = Date.now();
  const key = `${limit.name}:${caller(request)}`;

  // Cheap sweep, amortised: the alternative is a timer that keeps a serverless
  // instance alive for the sake of tidying.
  if (buckets.size > MAX_BUCKETS)
    for (const [id, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(id);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return null;
  }

  bucket.count++;
  if (bucket.count <= limit.limit) return null;

  const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json(
    {
      error: `That is more requests than this allows for a moment. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

/**
 * The body, refused above a size rather than read into memory and then judged.
 *
 * `Content-Length` is checked first because it is free; the byte count is
 * checked after because the header is a claim, not a fact.
 */
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<{ text: string } | { tooLarge: Response }> {
  const claimed = Number(request.headers.get("content-length") ?? "0");
  const refuse = () => ({
    tooLarge: Response.json(
      { error: "That request is larger than this accepts." },
      { status: 413 },
    ),
  });

  if (Number.isFinite(claimed) && claimed > maxBytes) return refuse();

  const text = await request.text();
  // Bytes, not characters: one emoji is four of the former and one of the
  // latter, and the limit is about memory.
  if (new TextEncoder().encode(text).length > maxBytes) return refuse();
  return { text };
}
