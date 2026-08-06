import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { Section } from "@/components/landing/primitives";
import { Checkout } from "@/components/pricing/Checkout";

export const metadata: Metadata = {
  title: "Checkout — Assignments",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <>
      <Nav />
      <main>
        <Section className="pt-14 pb-20 sm:pt-20">
          {/* Search params are read on the client, so the shell can still be
              prerendered — the order summary is the only dynamic part. */}
          <Suspense
            fallback={
              <p className="text-[13px] text-fg-subtle">Loading your order…</p>
            }
          >
            <Checkout />
          </Suspense>
        </Section>
      </main>
      <Footer />
    </>
  );
}
