/**
 * Whether you can actually pay us, said in one place.
 *
 * Three surfaces quote prices — the landing section, the pricing page and the
 * front page's argument — and until now only the checkout button admitted that
 * nothing is charged at the end of it. Three pages agreeing and a fourth
 * disagreeing is how a product ends up arguing with itself in public.
 *
 * Derived, not written. `paymentsLive()` is false while Stripe has no
 * publishable key and no price ids; the moment those are set this component
 * renders nothing at all and every page stops making the claim on its own.
 * A hard-coded "you cannot pay us yet" would have been true on the day it was
 * written and quietly wrong ever after — which is the exact failure this whole
 * storefront is built to avoid.
 */

import { paymentsLive } from "@/lib/billing";
import { Icon } from "@/components/ui/Icon";

export function PaymentStatus({
  variant = "panel",
}: {
  /** `inline` is a sentence inside somebody else's paragraph. */
  variant?: "panel" | "inline";
}) {
  if (paymentsLive()) return null;

  if (variant === "inline") {
    return (
      <>
        {" "}
        And the part most pages leave out: you cannot pay us yet. Checkout walks
        the whole flow and charges nothing, so what runs today is the free plan.
      </>
    );
  }

  return (
    <p className="mt-6 flex max-w-[62ch] items-start gap-2 rounded-md border border-warn/35 bg-warn/[0.07] p-3.5 text-[12.5px] leading-relaxed text-fg-muted">
      <Icon name="minus" size={12} className="mt-0.5 shrink-0 text-warn" />
      <span>
        <strong className="font-medium text-warn">
          Payments aren&apos;t switched on yet.
        </strong>{" "}
        These are the prices, and checkout walks the whole flow — but the last
        step charges nothing until Stripe is configured. The free plan is what
        runs today, and it is not a trial.
      </span>
    </p>
  );
}
