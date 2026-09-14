import type { Metadata } from "next";
import { Nav } from "@/components/storefront/Chrome";
import { Footer } from "@/components/storefront/Footer";
import { PageHead, PSection } from "@/components/storefront/page";
import { PricingTable } from "@/components/pricing/PricingTable";
import { PaymentStatus } from "@/components/pricing/PaymentStatus";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  title: "Pricing",
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/pricing" },
  description:
    `Three plans, metered AI on top, and ${percent(IMPACT.shareOfRevenue.value)} of everything set aside ` +
    `before anything else is paid out.`,
};

export default function PricingPage() {
  return (
    <>
      <Nav />
      {/* Clears the fixed nav pill: 56px tall, 14px from the top. */}
      <main>
        <PageHead
          eyebrow="Pricing"
          title="Pay for what you run, not for what you might."
          glow={["var(--lilac)", "var(--tangerine)"]}
          figure={
            <>
              €0
              <small>to start</small>
            </>
          }
          lead={
            <>
              A subscription for the workspace and metered credits for the AI,
              because the AI is the part that costs us money by the action. The
              free plan never becomes an invoice — it stops instead.
            </>
          }
        />

        <PSection className="pb-2">
          {/* Before the prices, not after them: somebody should know what
              these currently mean before they read them, not once they have
              picked one. */}
          <PaymentStatus />
        </PSection>

        <PricingTable />
      </main>
      <Footer />
    </>
  );
}
