import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { GlassHero } from "@/components/landing/GlassHero";
import { Landscape } from "@/components/landing/Landscape";
import { Hero } from "@/components/landing/Hero";
import { BrowserPillars, OnYourPlan } from "@/components/landing/BrowserStory";
import { WorkspaceIncluded } from "@/components/landing/WorkspaceIncluded";
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
  title: { absolute: "Tougather — a browser that works while you do" },
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/" },
  description:
    `A desktop browser with assistants in it. Give one a job and it works in its own tab while you keep going in yours — ` +
    `thinking on your own subscription, so nothing is metered and nothing passes our servers. ` +
    `${percent(IMPACT.shareOfRevenue.value)} of every euro is set aside for reforestation.`,
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
        {/*
          * The order is the argument, in the order somebody decides.
          *
          *   Hero              what it is, and a button that gets it
          *   BrowserPillars    the four things it does that a browser does not
          *   OnYourPlan        why the AI in it costs nothing — the one claim
          *                     a reader might not believe, so it comes early
          *                     and gets a whole section
          *   WorkspaceIncluded what the subscription is for
          *   Product           that workspace, running, because no amount of
          *                     copy explains it faster
          *   Switch            and where you should stay put. Straight after
          *                     "what it is", because it is meaningless before
          *                     that and forgotten after the fold.
          */}
        <Hero />
        <BrowserPillars />
        <OnYourPlan />
        <WorkspaceIncluded />
        <Product />
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
