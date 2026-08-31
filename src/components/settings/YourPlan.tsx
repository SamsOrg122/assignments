"use client";

/**
 * "What plan am I on, and did my payment land?"
 *
 * There was no answer to that anywhere inside the app. The webhook writes
 * `subscriptions` and nothing read it, so the one person who most deserves a
 * straight answer — somebody who has paid — got the same silence as everybody
 * else.
 *
 * Built like the two panels either side of it: report the live state, name the
 * state that is not the happy one, and never let "we could not ask" render as
 * an answer. The plan you are on and the plan you could be on are different
 * questions, and this one only answers the first; the price list answers the
 * second, and gets a single link rather than a button that pretends to be a
 * checkout.
 *
 * The price is quoted through `quote()`, the same function the pricing table
 * runs, so a yearly subscriber reads the same figure in both places. Taking
 * `planById(...).price` straight would have printed the monthly list rate —
 * €24 a seat for Team — beside a link to a page quoting €20 for exactly that
 * subscription, because two of the twelve months are free on annual. Note what
 * is *not* shown: no invoice list, no cancel button, no trial offer. There is no
 * payment provider switched on, and a cancel button that quietly does nothing
 * would be worse than sending somebody to a page that says so.
 */

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { usePlan, type Subscription } from "@/lib/billing/plan";
import { paymentsLive, quote } from "@/lib/billing";
import { euro, planById, type PlanId } from "@/lib/impact/config";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Said out loud only when it isn't 'active', because "active" is what the word
 * "Pro" already implies and repeating it is noise. The other three change what
 * somebody should do next, which is the whole reason to surface them.
 */
const STATUS_NOTE: Partial<Record<Subscription["status"], string>> = {
  past_due: "The last payment didn't go through. Until it does, this can stop.",
  canceled: "Cancelled. It doesn't renew.",
  trialing: "On trial — this hasn't become a paid period yet.",
};

/**
 * The one link out, labelled for where you already are. "Upgrade" said to
 * somebody on Team is the product not knowing who it is talking to, and a
 * cancelled subscriber is not being sold the next tier up either — they are
 * being shown the list.
 */
const PRICE_LIST = "The whole price list";

const LINK_LABEL: Record<PlanId, string> = {
  free: "What Pro and Team add",
  pro: "What Team adds",
  team: PRICE_LIST,
};

function priceLine(plan: PlanId, sub: Subscription | null): string {
  const { price, perSeat } = planById(plan);
  if (price === 0) return "No charge.";

  const interval = sub?.interval ?? "month";
  const seats = perSeat ? Math.max(1, sub?.seats ?? 1) : 1;
  // Through `quote()` rather than off the plan, because annual bills ten
  // months for twelve and the list price is the monthly one. The division by
  // seats is what turns the whole bill back into the per-seat rate the price
  // list quotes.
  const each = quote({ planId: plan, seats, interval }).perMonth / seats;

  const rate = perSeat ? `${euro(each)} a seat a month` : `${euro(each)} a month`;
  if (!sub) return rate;
  return `${rate}, billed ${interval === "year" ? "yearly" : "monthly"}`;
}

/**
 * When it renews — or when it ran out. A date in the past under an 'active'
 * row is worth saying plainly rather than printing as a renewal: it means the
 * provider has not sent a newer period, and that is the shape "my card expired
 * and nobody told me" arrives in.
 */
function periodLine(sub: Subscription): string {
  if (sub.periodEnd === null)
    return "No renewal date on the record for this subscription.";
  const when = formatDate(sub.periodEnd);
  const gone = sub.periodEnd < Date.now();
  if (sub.status === "canceled") return `${gone ? "Ended" : "Ends"} ${when}.`;
  return gone
    ? `The paid period on record ended ${when}, and no newer one has arrived.`
    : `Renews ${when}.`;
}

/**
 * It goes to the price list and changes nothing here, so it is a word and
 * not a button. Every bordered thing on this page that only navigated was
 * reading as an action somebody had to take.
 */
function PricingLink({ label }: { label: string }) {
  return (
    <Link
      href="/pricing"
      className="flex w-fit items-center gap-1.5 text-body text-fg-muted transition-colors duration-150 hover:text-fg"
    >
      <span className="underline decoration-line-strong underline-offset-2">
        {label}
      </span>
      <Icon name="arrow-right" size={12} />
    </Link>
  );
}

export function YourPlan() {
  const { settled, outcome, busy, reload } = usePlan();

  /* Nothing known yet. Both "no database" and "Free" would be a guess. */
  if (!settled || !outcome)
    return (
      <p className="flex items-center gap-(--space-2) text-body text-fg">
        <span className="size-1.5 rounded-full bg-fg-subtle" />
        Checking…
      </p>
    );

  /* No database. Not a fault, and not Free either — there is no account. */
  if (!outcome.ok && outcome.setup)
    return (
      <div className="flex flex-col gap-(--space-3)">
        <div>
          <p className="flex items-center gap-(--space-2) text-body text-fg">
            <span className="size-1.5 rounded-full bg-fg-subtle" />
            No plan to show
          </p>
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            {outcome.reason}
          </p>
        </div>
        <PricingLink label="What the plans cost" />
      </div>
    );

  /*
   * Could not ask. This must not read as Free: somebody who pays us and sees
   * "Free" here would reasonably conclude their money went nowhere.
   */
  if (!outcome.ok)
    return (
      <div className="flex flex-col gap-(--space-3)">
        <div className="flex items-start gap-(--space-2)">
          <Icon name="minus" size={13} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg">
              Your plan couldn&apos;t be read.
            </p>
            <p className="mt-(--space-1) max-w-[68ch] text-body text-fg-muted">
              {outcome.reason}
            </p>
            <p className="mt-(--space-2) max-w-[68ch] text-body text-warn">
              This is not the same as being on Free. Nothing about what you pay
              is known right now, including whether you pay at all.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-(--space-3)">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={busy}
            className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-45"
          >
            {busy ? "Asking again…" : "Ask again"}
          </button>
          <PricingLink label="What the plans cost" />
        </div>
      </div>
    );

  const state = outcome.value;

  /*
   * Signed out. Emphatically NOT Free: the Sign out button is in the section
   * directly above this one, so the likeliest reader of this box is somebody
   * who pays and has just pressed it. Saying "nothing has been charged" here
   * would be telling a customer they are not one.
   */
  if (state.kind === "signed-out")
    return (
      <div className="flex flex-col gap-(--space-3)">
        <div>
          <p className="flex items-center gap-(--space-2) text-body text-fg">
            <span className="size-1.5 rounded-full bg-fg-subtle" />
            Not signed in
          </p>
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            A plan belongs to an account, and this browser isn&rsquo;t signed
            into one — so there is nothing to look up. If you pay for this,
            sign in above and it will show here.
          </p>
        </div>
        <PricingLink label="What the plans cost" />
      </div>
    );

  const sub = state.kind === "on" ? state.subscription : null;
  const planId: PlanId = sub ? sub.plan : "free";
  const plan = planById(planId);
  const note = sub ? STATUS_NOTE[sub.status] : undefined;
  const wrong = note !== undefined;
  // A row can say plan='free' — the check constraint allows it and the webhook
  // writes whatever the provider sends on a downgrade. Such a row is a real
  // subscription costing nothing, so it must not carry the "you can't cancel
  // this here" chrome that a paid one does.
  const paying = plan.price > 0;

  return (
    <div className="flex flex-col gap-(--space-3)">
      <div>
        {/* The plan's name is the answer somebody opened this for, so it is
            the one thing here in full ink and weight. The dot still changes
            colour when something is wrong, and the sentence under it still
            says what — which is two carriers, where the warn-tinted box was
            a third that could not carry anything at 1.1:1. */}
        <p className="flex flex-wrap items-center gap-(--space-2) text-body">
          <span
            className={cn(
              "size-1.5 rounded-full",
              wrong ? "bg-warn" : "bg-accent",
            )}
          />
          <span className="font-medium text-fg">{plan.name}</span>
          {/* A price is a fact, not a config string: sans. */}
          <span className="ml-auto text-meta text-fg-subtle">
            {priceLine(planId, sub)}
          </span>
        </p>

        {/*
          The status only when it isn't 'active'. Shown as a sentence rather
          than a coloured word, because "past_due" needs to say what happens
          next, not just look alarming.
        */}
        {note && (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-warn">
            {note}
          </p>
        )}

        {sub ? (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            {plan.perSeat && (
              <>
                {formatNumber(sub.seats)}{" "}
                {sub.seats === 1 ? "seat" : "seats"} on this plan.{" "}
              </>
            )}
            {periodLine(sub)}
          </p>
        ) : (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            Your account has no subscription, which is the free plan — not a
            trial of anything, and nothing has been charged.
          </p>
        )}

        {/*
          Derived from `paymentsLive()` rather than written down, so the day
          Stripe is switched on this sentence disappears on its own instead of
          becoming a lie somebody has to remember to delete.
        */}
        {!paying && !paymentsLive() && (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
            There is nothing to change it to yet, either: checkout walks the
            whole flow and charges nothing until a payment provider is switched
            on.
          </p>
        )}

        {paying && (
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-subtle">
            This screen can&apos;t change or cancel it — there is no billing
            portal on this deployment. The price list is where a plan gets
            picked.
          </p>
        )}
      </div>

      <PricingLink
        label={sub?.status === "canceled" ? PRICE_LIST : LINK_LABEL[planId]}
      />
    </div>
  );
}
