/**
 * The opening, on the sheet.
 *
 * Not the hero any more — the landscape above is. This is the first thing on
 * the frosted panel that slides over it, and its job changed with its position:
 * it used to have to arrive and explain at once, and now it only has to
 * explain, because arriving has already happened.
 *
 * ── WHY TWO COLUMNS ────────────────────────────────────────────────────
 * The headline and the paragraph were stacked, which on a wide screen put a
 * 78px sentence above a 19px one with the whole page's width under both — the
 * reader's eye travels the full measure twice before reaching a button. Side
 * by side, the headline is a title on the left and everything that answers it
 * is one column on the right, so the second thing you read is already the
 * argument. They stack again below 900px, where two columns would be two
 * narrow ones.
 *
 * Every word here is unchanged, including the comparison links and the impact
 * line. This was a re-layout, not a rewrite.
 */

import Link from "next/link";
import { CTA, Leaf, Section } from "./primitives";
import { LiveDemo } from "./LiveDemo";
import { IMPACT, PRIMARY_CAUSE, percent } from "@/lib/impact/config";
import { Icon } from "@/components/ui/Icon";

export function Hero() {
  return (
    <div className="relative overflow-hidden pt-24 pb-20 sm:pt-28 sm:pb-28">
      <Section className="relative">
        <div className="grid items-end gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div>
            {/* The measure lives on the h1, not a wrapper: `ch` resolves against
                the element's own font-size, and on a wrapper that's the 16px
                body text rather than the 74px headline. */}
            <h1 className="max-w-[11ch] text-[clamp(46px,6.6vw,92px)] leading-[1.02]">
              Everything you make, in one place.
            </h1>
          </div>

          <div>
        <p className="max-w-[54ch] text-[clamp(16px,2vw,19px)] leading-relaxed text-fg-muted text-pretty">
          Tougather is an AI-native workspace for entrepreneurs and students. A
          thesis, a deck, a budget, a board and your team&apos;s memory in one
          project — where Office hands you five files in five apps, each with a
          subscription of its own. Everything except the AI allowance is free.
        </p>

        {/* The comparison, offered rather than hidden. Somebody who has
            already decided to weigh this against Microsoft should not have to
            find a dropdown to do it. */}
        <p className="mt-3 text-[13.5px] text-fg-subtle">
          <Link
            href="/compare/microsoft-365"
            className="inline-flex items-center gap-0.5 text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
          >
            How it compares to Microsoft 365
            <Icon name="chevron-right" size={10} />
          </Link>
          <span className="mx-2 text-line-strong">·</span>
          <Link
            href="#why"
            className="inline-flex items-center gap-0.5 text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
          >
            And where you should stay put
            <Icon name="chevron-right" size={10} />
          </Link>
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <CTA href="/library">Start writing</CTA>
          <CTA href="/pricing" variant="ghost">
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
          </div>
        </div>
      </Section>

      {/* The product itself, running. Given the widest frame on the page. */}
      <Section wide className="relative mt-14 sm:mt-20">
        <LiveDemo />
      </Section>
    </div>
  );
}
