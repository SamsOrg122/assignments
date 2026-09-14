/**
 * What the browser does that a browser does not, and why the AI in it is cheap.
 *
 * Two sections, and the second one is the argument. Everything ships an
 * assistant now; almost all of them resell you inference at a markup, because
 * the model call leaves your machine, hits their server and comes back. This
 * one does not make that call at all — it starts the agent you already pay for
 * and stands out of the way.
 *
 * Every claim below names the file that makes it true. That is the same rule
 * `lib/impact/config.ts` applies to numbers, for the same reason: a marketing
 * page is where a product's claims go to drift, and a claim with a filename on
 * it can be checked by the next person who edits this.
 */

import { BROWSER_PILLARS } from "@/lib/browser";
import { Glass, Reveal, Section, SectionHead } from "./primitives";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * One glyph per pillar, from the set the app already has.
 *
 * No new icons were drawn for this. Four more paths in `ui/Icon.tsx` for four
 * cards is how an icon set stops being one, and each of these is already
 * carrying the right meaning somewhere else in the product: the assistant's
 * spark, the lock that means nothing leaves, the sidebar that is literally
 * what a workspace looks like, and the eye for being shown what is happening.
 */
const GLYPHS: Record<string, IconName> = {
  assistant: "sparkle",
  subscription: "lock",
  workspaces: "panel-left",
  permission: "eye",
};

export function BrowserPillars() {
  return (
    <Section id="features" className="pt-4 pb-24 sm:pb-32">
      <SectionHead
        eyebrow="The browser"
        title="Four things it does that yours does not."
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {BROWSER_PILLARS.map((pillar, i) => (
          <Reveal key={pillar.id} delay={i * 70}>
            <Glass lift className="flex h-full flex-col gap-3 p-7">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--kbd)] text-fg">
                <Icon name={GLYPHS[pillar.id] ?? "sparkle"} size={17} />
              </span>
              <h3 className="mt-1 text-[19px] font-normal">{pillar.title}</h3>
              <p className="text-[14.5px] leading-relaxed text-fg-muted">
                {pillar.line}
              </p>
              {/* The receipt. Small, last, and clickable-looking to nobody —
                  it is there so a claim can be checked, not pressed. */}
              <p className="mt-auto pt-2 text-[11.5px] text-fg-subtle">
                {pillar.proof}
              </p>
            </Glass>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/**
 * The cost argument, given its own section and a lot of air.
 *
 * It is the one thing on this page somebody might not believe, so it is
 * written as three plain steps and then the consequence, rather than as a
 * claim with adjectives on it.
 */
export function OnYourPlan() {
  return (
    <Section id="cost" className="pb-24 sm:pb-32">
      <Reveal>
        <Glass className="overflow-hidden rounded-[28px] p-8 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div>
              <p className="text-[13px] text-fg-subtle">What the AI costs</p>
              <h2 className="mt-3 max-w-[14ch] text-[clamp(30px,3.8vw,46px)]">
                Nothing, from us.
              </h2>
              <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-fg-muted">
                Every other browser with an assistant in it buys the model calls
                and sells them back to you, which is why they all arrive with a
                credit meter. We never make the call, so there is nothing to
                meter and nothing to mark up.
              </p>
            </div>

            <ol className="flex flex-col gap-5">
              {[
                [
                  "You already pay somebody for an agent",
                  "Today that is Claude Code, signed in on your machine. It is your plan, your terms and your usage — the same one you use in a terminal.",
                ],
                [
                  "The browser starts it as a child process",
                  "With its own tools switched off, no session written to disk, and only the browser's own tool list allowed. It cannot open a shell, read your files, or reach any other server you have connected.",
                ],
                [
                  "The answer comes back inside the browser",
                  "Every action it wants to take crosses the same guarded border an outside client would, and you see what it says and does in the bar as it happens.",
                ],
              ].map(([title, detail], i) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--kbd)] text-[12px] text-fg-muted">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-fg">{title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">
                      {detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* The consequence, stated once, and the honest half of it too. */}
          <p className="mt-10 max-w-[74ch] border-t border-line pt-6 text-[14px] leading-relaxed text-fg-muted">
            <strong className="font-medium text-fg">
              So the cheapest way to run AI in a browser is to already be paying
              for it once.
            </strong>{" "}
            The other side of that: if you have no agent installed, the
            assistant does not work, and Settings tells you the one command that
            fixes it. There is no key to paste and no account of ours in the way.
          </p>
        </Glass>
      </Reveal>
    </Section>
  );
}
