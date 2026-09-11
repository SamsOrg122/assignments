import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { GlassHero } from "@/components/landing/GlassHero";
import { Landscape } from "@/components/landing/Landscape";
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
      {/*
        * The landscape, full bleed, with nothing over it but the wordmark.
        *
        * It replaces `HeroBanner`, which was a photograph with the headline
        * and the first paragraph on top of it. That had to carry the arrival
        * and the argument at the same time, and a photograph with four
        * hundred words on it does neither well. Here the picture does one job
        * — this is a place, and it is calm — and the sheet below does the
        * other.
        */}
      <GlassHero>
        <Landscape />
      </GlassHero>

      {/*
        * Everything else, on one frosted panel.
        *
        * `.sheet` has a negative top margin, so this starts 64 pixels above
        * where the hero ends and the landscape runs under its rounded corners.
        * That overlap is the whole effect: two objects, one sliding over the
        * other, rather than two sections stacked.
        */}
      <main className="sheet">
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
        <Footer />
      </main>
    </>
  );
}
