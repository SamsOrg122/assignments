import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { Section } from "@/components/landing/primitives";
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
      <main>
        <Section className="pt-16 pb-8 sm:pt-24 sm:pb-10">
          <p className="mb-4 text-[12.5px] text-fg-subtle">Pricing</p>
          <h1 className="headline max-w-[16ch] text-[clamp(34px,5.6vw,60px)]">
            Pay for what you run, not for what you might.
          </h1>
          <p className="mt-5 max-w-[58ch] text-[clamp(15px,1.7vw,18px)] leading-relaxed text-fg-muted text-pretty">
            A subscription for the workspace and metered credits for the AI,
            because the AI is the part that costs us money by the action. The
            free plan never becomes an invoice — it stops instead.
          </p>
          {/* Before the table, not after it: somebody should know what the
              prices currently mean before they read them, not once they have
              picked one. */}
          <PaymentStatus />
        </Section>

        <PricingTable />
      </main>
      <Footer />
    </>
  );
}
