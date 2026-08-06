/**
 * The payment seam.
 *
 * Deliberately *not* a client module. The API route that creates a real
 * checkout session imports the price ids from here, and a `"use client"`
 * directive at the top of this file makes that import throw at request time —
 * which is how a 501 "payments aren't switched on" turns into a 500.
 *
 * Checkout is the one flow where a stub pretending to be real would be
 * genuinely harmful, so the local provider does not pretend: it walks the
 * whole flow, shows the exact amount, and then says plainly that no card was
 * charged and no account exists. Everything up to the charge is real, which is
 * what makes it worth building now.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FOUNDER, to switch on Stripe:
 *   1. `npm install stripe @stripe/stripe-js`
 *   2. Create the products and prices in Stripe, and put the price ids in
 *      `STRIPE_PRICE_IDS` below.
 *   3. Set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
 *   4. Fill in `app/api/checkout/route.ts` — it already receives everything a
 *      session needs and returns a 501 until it does.
 *   5. Point the webhook at `app/api/stripe/webhook/route.ts`, which writes
 *      `subscriptions` and one `impact_ledger` row per payment.
 * Nothing in a component changes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { IMPACT, planById, type PlanId } from "../impact/config";

export type Interval = "month" | "year";

/** Two months free on annual. Stated as a discount so the maths is checkable. */
export const YEARLY_MONTHS_CHARGED = 10;

export interface CheckoutIntent {
  planId: PlanId;
  seats: number;
  interval: Interval;
}

export interface Quote {
  /** What is charged now, in euros. */
  total: number;
  /** Equivalent monthly cost, for comparison against the monthly price. */
  perMonth: number;
  /** Of that total, what the impact commitment sets aside. */
  setAside: number;
  /** How much annual billing saves against paying monthly, in euros a year. */
  savedPerYear: number;
}

export function quote(intent: CheckoutIntent): Quote {
  const plan = planById(intent.planId);
  const seats = plan.perSeat ? Math.max(1, intent.seats) : 1;
  const monthly = plan.price * seats;
  const total =
    intent.interval === "year" ? monthly * YEARLY_MONTHS_CHARGED : monthly;
  const perMonth = intent.interval === "year" ? total / 12 : total;

  return {
    total,
    perMonth,
    setAside: total * IMPACT.shareOfRevenue.value,
    savedPerYear:
      intent.interval === "year" ? monthly * (12 - YEARLY_MONTHS_CHARGED) : 0,
  };
}

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  /** The local provider's outcome: everything happened except the charge. */
  | { kind: "simulated"; quote: Quote; intent: CheckoutIntent }
  | { kind: "unavailable"; reason: string };

export interface PaymentProvider {
  readonly name: string;
  isAvailable(): boolean;
  checkout(intent: CheckoutIntent): Promise<CheckoutResult>;
}

/* ── The local provider ─────────────────────────────────── */

const localProvider: PaymentProvider = {
  name: "none",
  isAvailable: () => true,
  async checkout(intent) {
    // A beat, so the button's pending state is visible rather than a flicker.
    await new Promise((r) => setTimeout(r, 550));
    return { kind: "simulated", quote: quote(intent), intent };
  },
};

/* ── The Stripe provider ────────────────────────────────── */

/**
 * FOUNDER: the price ids from your Stripe dashboard. Left empty deliberately —
 * an invented `price_1234` would look configured and fail at the counter.
 */
export const STRIPE_PRICE_IDS: Record<PlanId, Record<Interval, string | null>> =
  {
    free: { month: null, year: null },
    pro: { month: null, year: null },
    team: { month: null, year: null },
  };

const stripeProvider: PaymentProvider = {
  name: "stripe",

  isAvailable: () =>
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) &&
    Object.values(STRIPE_PRICE_IDS.pro).some(Boolean),

  async checkout(intent) {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        kind: "unavailable",
        reason: body.error ?? `Checkout failed (${res.status}).`,
      };
    }
    const { url } = await res.json();
    return { kind: "redirect", url };
  },
};

/* ── Selection ──────────────────────────────────────────── */

let override: PaymentProvider | null = null;

export function setPaymentProvider(provider: PaymentProvider | null) {
  override = provider;
}

function pick(): PaymentProvider {
  if (override) return override;
  return stripeProvider.isAvailable() ? stripeProvider : localProvider;
}

export const paymentProviderName = (): string => pick().name;
export const paymentsLive = (): boolean => pick().name !== "none";

export function beginCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
  return pick().checkout(intent);
}
