/**
 * The opening, on the sheet.
 *
 * Not the hero — the landscape above is. This is the first thing on the
 * frosted panel that slides over it, and it has one job: say what the thing is
 * and let somebody have it.
 *
 * ── WHAT CHANGED, AND IT IS THE WHOLE POSITION ─────────────────────────
 * This used to open "Everything you make, in one place" and describe a
 * workspace. The product is a browser now. The workspace is still here, still
 * built, and it is what the paid plan unlocks — but it is no longer the first
 * sentence, because the first sentence has to name the thing you download.
 *
 * ── WHY TWO COLUMNS ────────────────────────────────────────────────────
 * The headline and the paragraph were stacked, which on a wide screen puts a
 * 90px sentence above a 19px one with the whole page's width under both: the
 * eye travels the full measure twice before reaching a button. Side by side,
 * the headline is a title on the left and everything that answers it — the
 * paragraph, the download, the small print — is one column on the right. They
 * stack again below 1024px, where two columns would be two narrow ones.
 */

import Link from "next/link";
import { Leaf, Section } from "./primitives";
import { DownloadButton, BuildLine, OtherBuilds } from "./Download";
import { IMPACT, PRIMARY_CAUSE, percent } from "@/lib/impact/config";
import { Icon } from "@/components/ui/Icon";

export function Hero() {
  return (
    <div className="relative overflow-hidden pt-24 pb-20 sm:pt-28 sm:pb-28">
      <Section className="relative">
        <div className="grid items-end gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            {/* The measure lives on the h1, not a wrapper: `ch` resolves
                against the element's own font-size, and on a wrapper that is
                the 16px body text rather than the 90px headline. */}
            <h1 className="max-w-[12ch] text-[clamp(44px,6.2vw,88px)] leading-[1.02]">
              A browser that works while you do.
            </h1>
          </div>

          <div>
            <p className="max-w-[52ch] text-[clamp(16px,2vw,19px)] leading-relaxed text-fg-muted text-pretty">
              Tougather is a desktop browser with assistants in it. You give one
              a job, it opens its own tab and gets on with it, and you carry on
              in yours. Tabs live in a sidebar, workspaces keep their sessions
              genuinely separate, and the pages are real Chromium.
            </p>

            {/* The one sentence that makes this cheap, said in the opening
                rather than on the pricing page. It is the difference between
                this and everything else with an assistant in it. */}
            <p className="mt-4 max-w-[52ch] text-[clamp(15px,1.8vw,17px)] leading-relaxed text-fg text-pretty">
              The assistant thinks on{" "}
              <strong className="font-medium">your own subscription</strong> —
              the agent already on your machine, running on your plan. We never
              meter it and your text never touches a server of ours.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DownloadButton />
              <Link
                href="/download"
                className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium text-fg transition-transform duration-200 hover:-translate-y-px"
              >
                What is in it
                <Icon name="chevron-right" size={13} />
              </Link>
            </div>

            <BuildLine className="mt-4" />
            <OtherBuilds className="mt-2.5" />

            {/* The impact line: present, quiet, and specific. Not a flex row —
                on a narrow screen that strands the leaf alone above the
                sentence it belongs to. */}
            <p className="mt-7 max-w-[70ch] text-[13px] leading-relaxed text-fg-subtle">
              <span
                aria-hidden="true"
                className="mr-2 inline-flex size-4 translate-y-[3px] items-center justify-center rounded-full bg-leaf-soft text-leaf"
              >
                <Leaf size={10} />
              </span>
              <span>
                {percent(IMPACT.shareOfRevenue.value)} of every euro we take —
                subscription and AI usage alike — is set aside for{" "}
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
    </div>
  );
}
