/**
 * The why.
 *
 * One short statement, given room and nothing else — no icons, no three-column
 * values grid, no photograph of a team. The restraint is the tone: a mission
 * that needs decoration to land isn't one.
 */

import { Reveal, Section } from "./primitives";
import { Visual } from "./Visual";
import { PRIMARY_CAUSE, percent, IMPACT } from "@/lib/impact/config";

export function Mission() {
  return (
    <div className="relative overflow-hidden py-20 sm:py-28">
      <Visual
        id="mission-texture"
        className="pointer-events-none absolute inset-0"
        imageClassName="opacity-25"
        sizes="100vw"
        fallback={
          <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(61,125,255,0.09),transparent_62%)]" />
        }
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-line-strong to-transparent"
      />

      <Section className="relative">
        <Reveal>
          <div className="mx-auto max-w-[60ch] text-center">
            <p className="display text-[clamp(21px,3.1vw,32px)] leading-[1.32] text-fg text-balance">
              We wanted a beautiful place to make things. Building one on top of
              AI means using a lot of energy and a lot of other people&apos;s
              money, and we didn&apos;t want that to be the whole story.
            </p>
            <p className="mx-auto mt-6 max-w-[54ch] text-[15px] leading-relaxed text-fg-muted text-pretty">
              So {percent(IMPACT.shareOfRevenue.value)} of what you pay is set
              aside before anything else — for{" "}
              {PRIMARY_CAUSE.name.toLowerCase()} first, or whichever cause you
              choose. It is not a large percentage. It is a real one, taken off
              revenue rather than profit, and we will publish what moved. That
              seemed better than a bigger promise we couldn&apos;t keep.
            </p>
          </div>
        </Reveal>
      </Section>
    </div>
  );
}
