import type { Metadata } from "next";
import { Nav } from "@/components/storefront/Chrome";
import { Hero } from "@/components/storefront/Hero";
import { Features, Statement, Engine } from "@/components/storefront/Sections";
import { What, Why } from "@/components/storefront/Why";
import { Better } from "@/components/storefront/Better";
import { Flow } from "@/components/storefront/Flow";
import { Close } from "@/components/storefront/Get";
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
 * washed behind everything.
 *
 * The order is the order somebody decides in, and the first two answer the
 * only two questions a stranger has before they will read anything else:
 *
 *   Hero       what it is in one line, the product drawn, a button
 *   What       the whole product in three nouns, and the one sentence the
 *              reader is meant to leave with
 *   Why        the comparison, done as a comparison — five rows of what an
 *              AI browser that resells model calls has to do, beside what
 *              this one does, each with the file that makes it true
 *   Features   the five things, each carrying its proof
 *   Statement  a moment of colour with one sentence in it
 *   Better     where the money goes, on the page people actually see
 *   Engine     what is honestly still wrong with version 0.1.0
 *   Close      your build, and every other build fanned beside it
 *
 * `Argument` used to sit where `Why` is and made one of those five points —
 * the billing one — with a gauge beside it. It is gone rather than moved: a
 * section that makes a single comparison implicitly is weaker than one that
 * makes five explicitly, and keeping both would have said the same thing
 * twice in the same voice a screen apart.
 *
 * Every number on the page resolves to a file anybody can open, and the one
 * promise that is not yet binding says so where it is made.
 */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <What />
        <Why />
        <Features />
        <Statement />
        <Better />
        <Engine />
        <Close />
      </main>
      <Footer />
      {/* One island for the whole page: it watches `data-flow` and nothing
          else, and the page is complete without it. See Flow.tsx. */}
      <Flow />
    </>
  );
}
