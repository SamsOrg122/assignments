/**
 * What Stripe tells us happened.
 *
 * This route did not exist. Checkout could have been switched on without it,
 * and the result would have been the worst shape a bug can take in public: a
 * payment that succeeds, a card that is charged, and a plan that is never
 * granted — with nothing in the product saying so.
 *
 * ── THE SIGNATURE IS THE WHOLE SECURITY MODEL ────────────────────────────
 * This endpoint is public and it grants paid plans. Anybody who finds the URL
 * can POST to it. The only thing separating a real event from an invented one
 * is Stripe's signature over the exact bytes of the body, so:
 *
 *   - the raw text is read *before* anything parses it, because
 *     `JSON.parse` followed by `JSON.stringify` produces different bytes and
 *     the signature is over bytes;
 *   - the event is never trusted until `constructEvent` has verified it;
 *   - and the amount always comes from the verified event, never from
 *     metadata, which is a place a browser once wrote.
 *
 * ── WHY IT WRITES THROUGH AN RPC ─────────────────────────────────────────
 * A webhook has no session, so row-level security has nobody to be. The usual
 * answer is a service-role key, which bypasses RLS on every table — one leak
 * and the whole database is readable. Instead this calls
 * `record_subscription` with a shared secret; that function can do exactly
 * one thing. If its secret leaks, somebody can grant a plan nobody paid for.
 * They cannot read a single document. See migration 0012.
 */

import Stripe from "stripe";
import { IMPACT } from "@/lib/impact/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only the events that change what somebody is entitled to. */
const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
]);

/** Stripe's subscription states, in the four this schema knows about. */
function statusOf(stripeStatus: string): string {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "active") return "active";
  return "canceled";
}

interface Recorded {
  workspaceId: string;
  plan: string;
  status: string;
  seats: number;
  interval: string;
  customerId: string | null;
  subscriptionId: string | null;
  periodEnd: string | null;
  amountCents: number | null;
  paymentRef: string | null;
}

/** Hand it to the database, through the one function that may write it. */
async function record(row: Recorded): Promise<{ ok: boolean; why?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const secret = process.env.STRIPE_HOOK_DB_SECRET;

  if (!url || !anonKey) return { ok: false, why: "no Supabase project configured" };
  if (!secret) return { ok: false, why: "STRIPE_HOOK_DB_SECRET is not set" };

  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/rpc/record_subscription`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret,
        p_workspace_id: row.workspaceId,
        p_plan: row.plan,
        p_status: row.status,
        p_seats: row.seats,
        p_interval: row.interval,
        p_customer_id: row.customerId,
        p_subscription_id: row.subscriptionId,
        p_period_end: row.periodEnd,
        p_amount_cents: row.amountCents,
        p_share_bps: shareBps(),
        p_payment_ref: row.paymentRef,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) return { ok: false, why: await response.text().catch(() => "") };
  return { ok: true };
}

/**
 * The share, in basis points, as it stands on the day of the charge.
 *
 * Written into the ledger row rather than looked up when the ledger is read,
 * so changing the commitment later cannot rewrite what was set aside for a
 * payment somebody already made. `shareOfRevenue` is a fraction; basis points
 * keep the arithmetic in integers, which is the whole reason that column
 * exists.
 */
const shareBps = (): number =>
  Math.round((IMPACT.shareOfRevenue.value ?? 0) * 10_000);

const asId = (value: unknown): string | null =>
  typeof value === "string" ? value : (value as { id?: string } | null)?.id ?? null;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !signingSecret)
    // 501 rather than 500: nothing is broken, this deployment simply does not
    // take payments. Stripe shows it as a failing endpoint either way, which
    // is the correct thing for somebody who wired a webhook up by mistake.
    return Response.json(
      { error: "Payments aren't switched on here." },
      { status: 501 },
    );

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Unsigned." }, { status: 400 });

  // Before anything parses it — see the header.
  const raw = await request.text();

  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, signingSecret);
  } catch (error) {
    const why = error instanceof Error ? error.message : "bad signature";
    return Response.json({ error: `Signature check failed: ${why}` }, { status: 400 });
  }

  if (!HANDLED.has(event.type))
    // 200, deliberately. An unhandled event is not a failure, and answering
    // anything else teaches Stripe to retry something that will never be
    // handled and eventually to disable the endpoint.
    return Response.json({ ignored: event.type });

  let row: Recorded | null = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    if (meta.workspaceId && meta.planId)
      row = {
        workspaceId: meta.workspaceId,
        plan: meta.planId,
        status: "active",
        seats: Number(meta.seats ?? 1) || 1,
        interval: meta.interval === "year" ? "year" : "month",
        customerId: asId(session.customer),
        subscriptionId: asId(session.subscription),
        periodEnd: null,
        // What was actually captured, in minor units, as Stripe saw it.
        amountCents: session.amount_total ?? null,
        paymentRef: session.id,
      };
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    const meta = subscription.metadata ?? {};
    const item = subscription.items?.data?.[0];
    if (meta.workspaceId)
      row = {
        workspaceId: meta.workspaceId,
        // A cancellation drops to free rather than leaving a paid plan in a
        // cancelled state — what somebody may do is one column, and reading
        // two to answer it is how entitlement bugs start.
        plan: event.type === "customer.subscription.deleted" ? "free" : (meta.planId ?? "pro"),
        status: event.type === "customer.subscription.deleted"
          ? "canceled"
          : statusOf(subscription.status),
        seats: item?.quantity ?? (Number(meta.seats ?? 1) || 1),
        interval: item?.price?.recurring?.interval === "year" ? "year" : "month",
        customerId: asId(subscription.customer),
        subscriptionId: subscription.id,
        periodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
        // A subscription changing shape is not a payment. Only `invoice.paid`
        // and the first checkout put money in the ledger.
        amountCents: null,
        paymentRef: null,
      };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const meta = invoice.parent?.subscription_details?.metadata ?? {};
    if (meta.workspaceId)
      row = {
        workspaceId: meta.workspaceId,
        plan: meta.planId ?? "pro",
        status: "active",
        seats: Number(meta.seats ?? 1) || 1,
        interval: meta.interval === "year" ? "year" : "month",
        customerId: asId(invoice.customer),
        subscriptionId: null,
        periodEnd: null,
        amountCents: invoice.amount_paid ?? null,
        // The invoice's own id, so Stripe's retries write one ledger row
        // rather than one per delivery.
        paymentRef: invoice.id ?? null,
      };
  }

  if (!row)
    // Verified, understood, and carrying nothing this app can act on —
    // usually a subscription created outside the checkout flow, so with no
    // workspace in its metadata. Saying so beats retrying forever.
    return Response.json({ ignored: "no workspace on the event" });

  const written = await record(row);
  if (!written.ok)
    // 500 on purpose: this is the one case where Stripe retrying is exactly
    // what should happen, because the money moved and the database missed it.
    return Response.json(
      { error: `Could not record it: ${written.why ?? "unknown"}` },
      { status: 500 },
    );

  return Response.json({ recorded: event.type });
}
