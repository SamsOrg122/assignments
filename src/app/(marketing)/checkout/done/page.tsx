import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { Section } from "@/components/landing/primitives";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false },
};

/**
 * Where Stripe sends somebody after they have paid.
 *
 * This route did not exist. `success_url` in `app/api/checkout/route.ts` has
 * always pointed at `/checkout/done`, and `/checkout` is a single page with
 * no `done` beneath it — so the one moment in the whole product where a
 * person has just handed over money ended on a 404. Nothing about that is
 * visible from the code that creates the session, which is exactly why it
 * survived: the failure lives in the gap between a string and a file.
 *
 * Deliberately says the plan is *arriving* rather than that it is active.
 * The plan is granted by the Stripe webhook, which is a separate request on
 * somebody else's schedule — usually a second, occasionally longer. Claiming
 * it is done and having the app disagree a moment later is worse than saying
 * what is actually happening.
 *
 * No session lookup here. It would need the secret key on a page a browser
 * renders, and it would tell somebody nothing they cannot see by opening the
 * app. The receipt is Stripe's job and Stripe has already emailed it.
 */
export default function CheckoutDonePage() {
  return (
    <>
      <Nav />
      <main>
        <Section className="pt-14 pb-24 sm:pt-24">
          <div className="max-w-[560px]">
            <p className="label-mono mb-3 text-fg-subtle">Payment received</p>
            <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg sm:text-[40px]">
              Thank you — that went through.
            </h1>
            <p className="mt-5 text-[14px] leading-relaxed text-fg-muted">
              Your plan is being switched on now. It usually takes a second or
              two; if the app still shows the free plan, give it a moment and
              reload rather than paying again.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
              Stripe has emailed you a receipt. Everything you had made before
              today is exactly where you left it.
            </p>

            {/* One button. There is deliberately no "see your plan" link
                beside it: the app has no billing screen yet, and a second
                button that lands on a page with nothing about the plan on it
                would be worse than no second button. */}
            <div className="mt-8">
              <Link
                href="/library"
                className="inline-block rounded-sm bg-accent px-4 py-2.5 text-[13px] font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                Back to your work
              </Link>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
