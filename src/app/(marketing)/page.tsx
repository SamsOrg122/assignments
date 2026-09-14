import type { Metadata } from "next";
import { Nav } from "@/components/storefront/Chrome";
import { Hero } from "@/components/storefront/Hero";
import { Argument, Features, Statement, Engine, Close } from "@/components/storefront/Sections";
import { Footer } from "@/components/storefront/Footer";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  // Absolute, so the root template does not append the brand to a line that
  // already opens with it — "Tougather … · Tougather" is what a search result
  // would otherwise show.
  title: { absolute: "Tougather — a browser that works while you do" },
  alternates: { canonical: "/" },
  description:
    "A desktop browser with assistants in it. Give one a job and it works in its own tab while you keep going in yours — thinking on your own subscription, so nothing is metered and nothing passes our servers. " +
    `${percent(IMPACT.shareOfRevenue.value)} of every euro is set aside for reforestation.`,
};

/**
 * The landing page.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ─────────────────────────────────
 * Paper, ink, one coral, and colour that arrives inside objects rather than
 * washed behind everything. What this replaced was eleven thousand pixels of
 * lilac glass with a full screen of empty gradient in the middle and a serif
 * wordmark over a mountain range — pretty, and anonymous enough to be selling
 * anything at all.
 *
 * The order is the order somebody decides in:
 *
 *   Hero       what it is, the product drawn, and a button that gets it
 *   Argument   the one thing a reader will not believe — that the AI costs
 *              nothing — answered early and with the file names attached
 *   Features   the five things, each carrying its proof
 *   Statement  a moment of colour with one sentence in it
 *   Engine     what is honestly still wrong with version 0.1.0
 *   Close      the button again, with the version and the size
 *
 * Six sections instead of eleven, and every number on the page resolves to a
 * file anybody can open.
 */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Argument />
        <Features />
        <Statement />
        <Engine />
        <Close />
      </main>
      <Footer />
    </>
  );
}
