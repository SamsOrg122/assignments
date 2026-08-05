/**
 * The hero.
 *
 * One sentence about the product, one understated line about impact, and a
 * real look at the thing itself — Library and Board overlapping, because that
 * pairing *is* the product and no amount of copy explains it faster.
 */

import { CTA, Leaf, Section } from "./primitives";
import { Visual } from "./Visual";
import { AmbientFallback } from "./mocks";
import { LiveDemo } from "./LiveDemo";
import { IMPACT, PRIMARY_CAUSE, percent } from "@/lib/impact/config";
import { Icon } from "@/components/ui/Icon";

export function Hero() {
  return (
    <div className="relative overflow-hidden pt-10 pb-20 sm:pt-16 sm:pb-28">
      {/* Ambient layer. Falls back to crafted light until the slot is filled. */}
      <Visual
        id="hero-ambient"
        // Masked at the bottom so the ambient dissolves into the canvas
        // instead of ending on a hard clip edge where `overflow-hidden` cuts.
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] [mask-image:linear-gradient(to_bottom,#000_50%,transparent_100%)]"
        imageClassName="opacity-40"
        priority
        fallback={<AmbientFallback className="absolute inset-0" />}
      />

      <Section className="relative">
        {/* The measure lives on the h1, not a wrapper: `ch` resolves against
            the element's own font-size, and on a wrapper that's the 16px body
            text rather than the 74px headline. */}
        <h1 className="headline max-w-[13ch] text-[clamp(38px,7vw,74px)] font-medium sm:max-w-[15ch]">
          Everything you make, in one place.
        </h1>

        <p className="mt-6 max-w-[54ch] text-[clamp(16px,2vw,19px)] leading-relaxed text-fg-muted text-pretty">
          Assignments is an AI-native workspace for entrepreneurs and students.
          Write a thesis, build a deck, sketch on an infinite board, keep your
          team&apos;s files and memory in one place — without four subscriptions and
          six tabs.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <CTA href="/library">Start writing</CTA>
          <CTA href="#pricing" variant="ghost">
            See pricing
          </CTA>
        </div>

        {/* The impact line: present, quiet, and specific. */}
        {/* Not a flex row: on a narrow screen that strands the leaf alone on
            its own line above the sentence it belongs to. */}
        <p className="mt-6 max-w-[78ch] text-[13px] leading-relaxed text-fg-subtle">
          <span
            aria-hidden="true"
            className="mr-2 inline-flex size-4 translate-y-[3px] items-center justify-center rounded-full bg-leaf-soft text-leaf"
          >
            <Leaf size={10} />
          </span>
          <span>
            {percent(IMPACT.shareOfRevenue.value)} of every euro — subscription
            and AI usage alike — is set aside for{" "}
            {PRIMARY_CAUSE.name.toLowerCase()}.{" "}
          </span>
          <a
            href="#impact"
            className="inline-flex items-center gap-0.5 text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
          >
            How that works
            <Icon name="chevron-right" size={10} />
          </a>
        </p>
      </Section>

      {/* The product itself, running. Given the widest frame on the page. */}
      <Section wide className="relative mt-14 sm:mt-20">
        <LiveDemo />
      </Section>
    </div>
  );
}
