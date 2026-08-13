import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { HeroBanner } from "@/components/landing/HeroBanner";
import { Hero } from "@/components/landing/Hero";
import { Product } from "@/components/landing/Product";
import { Switch } from "@/components/landing/Switch";
import { Signature } from "@/components/landing/Signature";
import { Mission } from "@/components/landing/Mission";
import { ForestBand } from "@/components/landing/ForestBand";
import { Impact } from "@/components/landing/Impact";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  // Absolute, so the root template doesn't append the brand to a line that
  // already opens with it — "Tougather … · Tougather" is what a search result
  // would otherwise show.
  title: { absolute: "Tougather — everything you make, in one place" },
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/" },
  description:
    `An AI-native workspace for entrepreneurs and students: write, present, draw and organise in one place. ` +
    `${percent(IMPACT.shareOfRevenue.value)} of every euro — subscription and AI usage alike — is set aside for reforestation.`,
};

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <HeroBanner />
        <Hero />
        <Product />
        {/* The argument comes straight after "what it is", because it is
            meaningless before that and forgotten after the fold. */}
        <Switch />
        <Signature />
        <Mission />
        <ForestBand />
        <Impact />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
