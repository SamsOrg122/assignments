"use client";

/**
 * Checkout.
 *
 * The whole flow, minus the charge — and it says so, in the place where the
 * charge would happen rather than in a footnote. Everything above that line is
 * real: the plan, the seats, the interval, the total, the VAT note, and the
 * exact amount the impact commitment sets aside from this specific payment.
 *
 * The impact line is here on purpose. A commitment that only appears on a
 * marketing page is a marketing line; one that appears on the invoice is a
 * term. This is the surface where it becomes the second thing.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  beginCheckout,
  paymentsLive,
  quote,
  YEARLY_MONTHS_CHARGED,
  type CheckoutIntent,
  type CheckoutResult,
  type Interval,
} from "@/lib/billing";
import { IMPACT, PLANS, euro, percent, type PlanId } from "@/lib/impact/config";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function Checkout() {
  const params = useSearchParams();
  const router = useRouter();

  const requested = params.get("plan");
  const plan = PLANS.find((p) => p.id === requested && p.price > 0);

  const [seats, setSeats] = useState(() => {
    const n = Number(params.get("seats"));
    return Number.isFinite(n) && n >= 1 ? Math.min(500, Math.floor(n)) : 1;
  });
  const [interval, setInterval] = useState<Interval>(
    params.get("interval") === "year" ? "year" : "month",
  );
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const intent: CheckoutIntent | null = useMemo(
    () => (plan ? { planId: plan.id as PlanId, seats, interval } : null),
    [plan, seats, interval],
  );
  const q = intent ? quote(intent) : null;

  if (!plan)
    return (
      <div className="max-w-[52ch]">
        <h1 className="headline text-[clamp(28px,4vw,40px)]">
          Nothing to check out.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
          That link doesn&apos;t name a paid plan. The free plan needs no
          checkout at all — it just opens.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/pricing"
            className="rounded-md border border-line-strong px-3 py-2 text-[13px] text-fg transition-colors hover:bg-surface-2"
          >
            See the plans
          </Link>
          <Link
            href="/library"
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-on-accent transition-[filter] hover:brightness-110"
          >
            Open Assignments free
          </Link>
        </div>
      </div>
    );

  const pay = async () => {
    if (!intent) return;
    setStatus("working");
    const outcome = await beginCheckout(intent);
    if (outcome.kind === "redirect") {
      window.location.href = outcome.url;
      return;
    }
    setResult(outcome);
    setStatus("idle");
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* ── What you're buying ───────────────────────────── */}
      <div className="max-w-[56ch]">
        <p className="mb-4 text-[12.5px] text-fg-subtle">Checkout</p>
        <h1 className="headline text-[clamp(30px,4.4vw,44px)]">
          {plan.name}, {interval === "year" ? "yearly" : "monthly"}.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
          {plan.blurb}
        </p>

        <div className="mt-8 space-y-5">
          <fieldset>
            <legend className="text-[12.5px] text-fg-subtle">Billing</legend>
            <div className="mt-2 inline-flex items-center rounded-full border border-line p-0.5">
              {(["month", "year"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setInterval(value);
                    setResult(null);
                  }}
                  aria-pressed={interval === value}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors duration-150",
                    interval === value
                      ? "bg-fg text-canvas"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  {value === "month" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
            {interval === "year" && (
              <p className="mt-2 text-[12px] text-leaf">
                {YEARLY_MONTHS_CHARGED} months charged instead of 12.
              </p>
            )}
          </fieldset>

          {plan.perSeat && (
            <fieldset>
              <legend className="text-[12.5px] text-fg-subtle">Seats</legend>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center rounded-sm border border-line">
                  <button
                    type="button"
                    aria-label="Fewer seats"
                    onClick={() => {
                      setSeats((n) => Math.max(1, n - 1));
                      setResult(null);
                    }}
                    className="px-2.5 py-1.5 text-fg-subtle transition-colors hover:text-fg"
                  >
                    <Icon name="minus" size={12} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={seats}
                    aria-label="Number of seats"
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      setSeats(
                        Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 1,
                      );
                      setResult(null);
                    }}
                    className="w-14 bg-transparent py-1.5 text-center font-mono text-[13px] tabular-nums text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="More seats"
                    onClick={() => {
                      setSeats((n) => Math.min(500, n + 1));
                      setResult(null);
                    }}
                    className="px-2.5 py-1.5 text-fg-subtle transition-colors hover:text-fg"
                  >
                    <Icon name="plus" size={12} />
                  </button>
                </div>
                <span className="text-[12.5px] text-fg-subtle">
                  {euro(plan.price)} a seat, a month
                </span>
              </div>
            </fieldset>
          )}
        </div>

        <p className="mt-8 text-[12.5px] leading-relaxed text-fg-subtle">
          Cancel any time from inside the app, in one click. Cancelling stops
          the next payment and leaves everything you&apos;ve written exactly
          where it is — exports keep working on the free plan.
        </p>
      </div>

      {/* ── The order ────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-line-strong bg-surface p-5">
          <h2 className="text-[13px] font-medium text-fg">Your order</h2>

          {/* The rows have to add up to the total on their own. A monthly
              figure followed by an annual discount is arithmetic the reader
              can't finish without knowing to multiply by twelve first. */}
          <dl className="mt-4 space-y-2.5 border-b border-line pb-4">
            <Row
              label={`${plan.name}${plan.perSeat ? ` × ${seats}` : ""}`}
              value={euro(
                plan.price * (plan.perSeat ? seats : 1) * (interval === "year" ? 12 : 1),
              )}
              note={interval === "year" ? "12 months" : "a month"}
            />
            {interval === "year" && q && (
              <Row
                label={`Yearly, ${YEARLY_MONTHS_CHARGED} months charged`}
                value={`−${euro(q.savedPerYear)}`}
                tone="leaf"
              />
            )}
            <Row label="VAT" value="Added at checkout" muted />
          </dl>

          <div className="flex items-baseline gap-3 py-4">
            <span className="text-[13px] text-fg">
              Total {interval === "year" ? "a year" : "a month"}
            </span>
            <span className="display ml-auto text-[26px] leading-none text-fg">
              {q ? euro(q.total) : "—"}
            </span>
          </div>

          {/* The commitment, on the invoice rather than on a poster. */}
          {q && (
            <p className="flex items-start gap-2 rounded-md border border-leaf/25 bg-leaf-soft p-3 text-[12px] leading-relaxed text-fg-muted">
              <span
                aria-hidden="true"
                className="mt-[3px] size-1.5 shrink-0 rounded-full bg-leaf"
              />
              <span>
                <strong className="font-medium text-fg">
                  {euro(q.setAside)}
                </strong>{" "}
                of this is set aside —{" "}
                {percent(IMPACT.shareOfRevenue.value)} of everything you pay.{" "}
                <Link
                  href="/impact"
                  className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
                >
                  How that works
                </Link>
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={() => void pay()}
            disabled={status === "working"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-[13.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            {status === "working" ? "One moment…" : "Continue to payment"}
            <Icon name="arrow-right" size={12} />
          </button>

          {!paymentsLive() && (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-fg-subtle">
              Payments aren&apos;t switched on yet. This button walks the whole
              flow without charging anything.
            </p>
          )}

          {result?.kind === "simulated" && (
            <div className="anim-slide-up mt-4 rounded-md border border-warn/35 bg-warn/[0.07] p-3.5">
              <p className="text-[13px] font-medium text-warn">
                No card was charged.
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
                Payments aren&apos;t connected yet, so there is nothing behind
                this button. The order above is exactly what would have been
                charged: {euro(result.quote.total)}, with{" "}
                {euro(result.quote.setAside)} set aside.
              </p>
              <button
                type="button"
                onClick={() => router.push("/library")}
                className="mt-3 w-full rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Keep using it free instead
              </button>
            </div>
          )}

          {result?.kind === "unavailable" && (
            <p className="mt-4 rounded-md border border-danger/35 bg-danger/[0.07] p-3 text-[12.5px] leading-relaxed text-danger">
              {result.reason}
            </p>
          )}
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-fg-subtle">
          By continuing you agree to the{" "}
          <Link
            href="/legal"
            className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
          >
            terms
          </Link>
          , which are still a draft — worth reading before you would actually
          pay for this.
        </p>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  muted,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
  tone?: "leaf";
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-[13px] text-fg-muted">
        {label}
        {note && <span className="ml-1 text-[11.5px] text-fg-subtle">{note}</span>}
      </dt>
      <dd
        className={cn(
          "ml-auto font-mono text-[13px] tabular-nums",
          tone === "leaf" ? "text-leaf" : muted ? "text-fg-subtle" : "text-fg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
