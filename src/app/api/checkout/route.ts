/**
 * Checkout session creation.
 *
 * Returns 501 until Stripe is configured, with a message that says exactly
 * what is missing rather than a generic failure. The validation above that
 * point is real and stays real once the provider is wired in — a malformed
 * intent should be rejected here, not at Stripe.
 *
 * FOUNDER: replace the marked block. Everything it needs is already parsed.
 */

import { NextResponse } from "next/server";
import { PLANS, type PlanId } from "@/lib/impact/config";
import { STRIPE_PRICE_IDS, type Interval } from "@/lib/billing";
import { overLimit } from "@/lib/api/guard";
import { whoIsAsking } from "@/lib/api/who";
import { memberOf } from "@/lib/billing/workspace";
import Stripe from "stripe";

/**
 * Nobody checks out twenty times a minute. Once this route talks to Stripe it
 * will be creating sessions, and a session is a row somebody else pays to
 * store — the ceiling belongs here before that, not after.
 */
const CHECKOUT_LIMIT = { name: "checkout", limit: 20, windowMs: 60_000 };

interface Body {
  planId?: string;
  seats?: number;
  interval?: string;
  /**
   * Which workspace is being upgraded.
   *
   * Checked against the caller before anything is created — see `memberOf`.
   * It travels on into the session's metadata so the webhook knows whose
   * plan to grant without trusting anything the browser says later.
   */
  workspaceId?: string;
}

const PLAN_IDS = new Set(PLANS.map((p) => p.id));

export async function POST(request: Request) {
  const refused = overLimit(request, CHECKOUT_LIMIT);
  if (refused) return refused;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const planId = body.planId as PlanId | undefined;
  if (!planId || !PLAN_IDS.has(planId))
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });

  const plan = PLANS.find((p) => p.id === planId)!;
  if (plan.price === 0)
    return NextResponse.json(
      { error: "The free plan has nothing to check out." },
      { status: 400 },
    );

  const interval = (body.interval ?? "month") as Interval;
  if (interval !== "month" && interval !== "year")
    return NextResponse.json({ error: "Unknown interval." }, { status: 400 });

  // Seats are money, so they are clamped here as well as in the UI. A client
  // that posts 10,000 seats should get a 400, not an invoice.
  const seats = Math.floor(Number(body.seats ?? 1));
  if (!Number.isFinite(seats) || seats < 1 || seats > 500)
    return NextResponse.json(
      { error: "Seats must be between 1 and 500." },
      { status: 400 },
    );
  if (!plan.perSeat && seats !== 1)
    return NextResponse.json(
      { error: "That plan isn't priced per seat." },
      { status: 400 },
    );

  const priceId = STRIPE_PRICE_IDS[planId][interval];
  const secret = process.env.STRIPE_SECRET_KEY;

  if (!secret || !priceId)
    return NextResponse.json(
      {
        error:
          "Payments aren't switched on yet. " +
          (secret
            ? `No Stripe price id is set for ${planId}/${interval}.`
            : "STRIPE_SECRET_KEY is not set."),
      },
      { status: 501 },
    );

  /*
   * Whose workspace, and are they allowed to spend on it.
   *
   * Checked here rather than trusted from the body, and checked *as the
   * caller* so the database's own membership policy is what answers — this
   * project has no service-role key and does not want one. Somebody who
   * posts a stranger's workspace id gets a 403 before a session exists.
   */
  const who = await whoIsAsking(request);
  if (!who.ok) return who.response;

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace named." }, { status: 400 });

  const allowed = await memberOf(who.caller.token, workspaceId);
  if (!allowed)
    return NextResponse.json(
      { error: "That workspace isn't yours to upgrade." },
      { status: 403 },
    );

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
    new URL(request.url).origin;

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: seats }],
      success_url: `${origin}/checkout/done?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      /*
       * Everything the webhook needs, carried by Stripe rather than by the
       * browser. The webhook reads these back off the event, so the plan
       * granted is the plan paid for — a client cannot post one price and
       * claim another afterwards. The *amount* is never taken from here; it
       * comes from what Stripe actually captured.
       */
      metadata: { planId, seats: String(seats), interval, workspaceId },
      subscription_data: { metadata: { workspaceId } },
      // So a repeat customer is one customer rather than a new one per
      // checkout, which is what makes "cancel my subscription" findable.
      client_reference_id: who.caller.userId,
      automatic_tax: { enabled: true },
    });

    if (!session.url)
      return NextResponse.json(
        { error: "Stripe made a session with nowhere to send you." },
        { status: 502 },
      );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    // Stripe's own message is the useful one — a wrong price id, a card
    // rule, a disabled account all say so precisely, and replacing that with
    // "checkout failed" costs whoever has to fix it an afternoon.
    const reason = error instanceof Error ? error.message : "Checkout failed.";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
