/**
 * The hero.
 *
 * One sentence about the product, one understated line about impact, and a
 * real look at the thing itself — Library and Board overlapping, because that
 * pairing *is* the product and no amount of copy explains it faster.
 */

import { CTA, Leaf, Section } from "./primitives";
import { Visual } from "./Visual";
import { AmbientFallback, BoardMock, LibraryMock } from "./mocks";
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
        <p className="mt-6 max-w-[62ch] text-[13px] leading-relaxed text-fg-subtle">
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

      {/* The product, shown rather than described. */}
      <Section className="relative mt-14 sm:mt-20">
        <HeroComposition />
      </Section>
    </div>
  );
}

function HeroComposition() {
  return (
    <div className="relative">
      {/* Library — the sorted half. */}
      <div className="glass overflow-hidden rounded-lg sm:rounded-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span
                key={c}
                className="size-2.5 rounded-full opacity-55"
                style={{ background: c }}
              />
            ))}
          </span>
          <span className="ml-2 text-[12px] text-fg-subtle">Library</span>
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <span className="kbd">⌘K</span>
          </span>
        </div>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
          <LibraryMock className="border-b border-line sm:border-r sm:border-b-0" />
          <div className="relative min-h-[220px]">
            <BoardMock className="absolute inset-0" />
            <span className="absolute top-3 left-3 rounded-xs border border-line bg-canvas/70 px-1.5 py-0.5 text-[10px] text-fg-muted backdrop-blur-sm">
              Board
            </span>
          </div>
        </div>
      </div>

      {/* A floating AI moment, overlapping the panel edge for depth. */}
      <div className="glass absolute -bottom-10 left-4 hidden w-[300px] rounded-lg p-3 lg:block">
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={12} className="text-accent" />
          <span className="text-[11.5px] text-fg-muted">
            Turn section 3 into a deck
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full w-2/3 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[9.5px] text-fg-subtle">11 slides</span>
        </div>
      </div>
    </div>
  );
}
