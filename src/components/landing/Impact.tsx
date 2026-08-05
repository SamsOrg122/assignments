/**
 * The impact section.
 *
 * Written to be checkable rather than moving. Every number carries its
 * provenance, the share we keep is stated as plainly as the share we give,
 * and the things we can't yet prove get their own panel instead of being
 * quietly omitted. If this section reads as modest, it is working.
 */

import { Glass, Provisional, Reveal, Section, SectionHead } from "./primitives";
import { Visual } from "./Visual";
import { SaplingFallback } from "./mocks";
import { ImpactLedger } from "./ImpactLedger";
import {
  CAUSES,
  IMPACT,
  PRIMARY_CAUSE,
  REVENUE_SPLIT,
  euro,
  percent,
} from "@/lib/impact/config";
import { Icon } from "@/components/ui/Icon";

export function Impact() {
  const share = IMPACT.shareOfRevenue;

  return (
    <Section id="impact" className="py-20 sm:py-28">
      <Reveal>
        <SectionHead
          eyebrow="Impact"
          title="Running AI costs something. Part of that cost becomes trees."
          lead={
            <>
              Every AI action you take costs us money to run. Rather than
              pretending otherwise, we price it openly — and set aside a fixed{" "}
              {percent(share.value)} of everything you pay, subscription and AI
              usage alike, to fund {PRIMARY_CAUSE.name.toLowerCase()}. The other{" "}
              {percent(1 - share.value)} runs the company. We would rather tell
              you that than imply your whole invoice becomes a forest.
            </>
          }
        />
      </Reveal>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* How it works */}
        <Reveal delay={40}>
          <Glass className="h-full p-5 sm:p-6">
            <h3 className="text-[15px] font-medium text-fg">How it works</h3>
            <ol className="mt-4 space-y-4">
              {[
                {
                  n: "1",
                  t: "You pay for the plan and the AI you use.",
                  b: "Two lines on one invoice. Nothing is bundled or estimated on your behalf.",
                },
                {
                  n: "2",
                  t: `We set aside ${percent(share.value)} of that, before anything else is paid out.`,
                  b: "Of revenue, not profit. Profit is a number we control and you can't check; revenue is the one on your receipt.",
                },
                {
                  n: "3",
                  t: "It goes to a planting partner, and we publish what moved.",
                  b: "Amount transferred, trees funded, and who received it — so the claim on this page can be checked against something.",
                },
              ].map((step) => (
                <li key={step.n} className="flex gap-3.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line font-mono text-[11px] text-fg-subtle"
                  >
                    {step.n}
                  </span>
                  <span>
                    <span className="block text-[13.5px] text-fg">{step.t}</span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-fg-muted text-pretty">
                      {step.b}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-baseline justify-between">
                <h4 className="text-[13px] text-fg">Where the rest goes</h4>
                <span className="text-[11px] text-fg-subtle">
                  approximate
                  <Provisional note="Indicative split of a euro of revenue. Replaced with audited figures once we have a full year of accounts." />
                </span>
              </div>
              <SplitBar />
            </div>
          </Glass>
        </Reveal>

        {/* Trees, the hero cause */}
        <Reveal delay={100}>
          <Glass className="flex h-full flex-col overflow-hidden">
            <Visual
              id="impact-canopy"
              className="relative h-[168px] shrink-0 border-b border-line"
              fallback={
                <div className="grid size-full place-items-center bg-leaf-soft/25">
                  <SaplingFallback className="h-full" />
                </div>
              }
              sizes="(max-width: 1024px) 100vw, 480px"
            />

            <div className="flex min-h-0 flex-1 flex-col p-5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-xs border border-leaf/30 bg-leaf-soft px-2 py-0.5 text-[10.5px] text-leaf">
                Default cause
              </span>
              <h3 className="mt-3 text-[15px] font-medium text-fg">
                {PRIMARY_CAUSE.name}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted text-pretty">
                {PRIMARY_CAUSE.blurb} We count a tree as funded when the money
                has moved, not when a page view happens.
              </p>

              <div className="mt-4">
                <ImpactLedger />
              </div>
            </div>
          </Glass>
        </Reveal>
      </div>

      {/* The uncomfortable panel — and the most important one. */}
      <Reveal delay={60}>
        <Glass className="mt-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Icon
              name="focus"
              size={14}
              className="mt-1 shrink-0 text-warn"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium text-fg">
                What we can&apos;t tell you yet
              </h3>
              <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-fg-muted text-pretty">
                Vague environmental claims are easy to make and hard to check,
                so here is the state of ours, in full.
              </p>

              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                <Gap
                  title="No partner named yet"
                  body={
                    PRIMARY_CAUSE.partner.note ??
                    "We will name the organisation and link their reporting before taking money for it."
                  }
                />
                <Gap
                  title="Per-tree cost is an estimate"
                  body={`We plan on ${euro(PRIMARY_CAUSE.costPerUnit.value.low)}–${euro(
                    PRIMARY_CAUSE.costPerUnit.value.high,
                  )} per tree including survival monitoring. Real planting costs vary by site, so every figure on this page is shown as a range.`}
                />
                <Gap
                  title="Nobody has audited us"
                  body={
                    IMPACT.verification.note ??
                    "No third party has reviewed these figures."
                  }
                />
              </ul>

              <p className="mt-4 text-[12.5px] text-fg-subtle">
                Anything on this page marked{" "}
                <Provisional className="ml-0" note="Like this." /> is a working
                assumption, not a fact. The markers disappear when the numbers
                are real.
              </p>
            </div>
          </div>
        </Glass>
      </Reveal>

      {/* Other causes — present, secondary. */}
      <Reveal delay={80}>
        <div className="mt-10">
          <h3 className="text-[14px] font-medium text-fg">
            Or point your share somewhere else
          </h3>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-fg-muted">
            Trees are the default because they&apos;re the easiest to verify and
            the hardest to fake. If another cause matters more to you, the same{" "}
            {percent(share.value)} follows your choice.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAUSES.filter((c) => !c.primary).map((c) => (
              <li
                key={c.id}
                className="glass-soft rounded-md p-3.5 text-[12.5px]"
              >
                <span className="block font-medium text-fg">{c.name}</span>
                <span className="mt-1 block leading-relaxed text-fg-muted text-pretty">
                  {c.blurb}
                </span>
                <span className="mt-2 block font-mono text-[10.5px] text-fg-subtle">
                  {euro(c.costPerUnit.value.low)}–
                  {euro(c.costPerUnit.value.high)} per {c.unit.one}
                  {c.costPerUnit.status === "placeholder" && (
                    <Provisional note={c.costPerUnit.note} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}

function Gap({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-md border border-line bg-white/[0.02] p-3.5">
      <span className="block text-[12.5px] font-medium text-fg">{title}</span>
      <span className="mt-1 block text-[12px] leading-relaxed text-fg-muted text-pretty">
        {body}
      </span>
    </li>
  );
}

/** A euro of revenue, to scale. Impact last so it reads as a slice, not a claim. */
function SplitBar() {
  return (
    <div className="mt-3">
      <div className="flex h-2.5 overflow-hidden rounded-full border border-line">
        {REVENUE_SPLIT.map((part) => (
          <span
            key={part.label}
            title={`${part.label} — ${percent(part.share)}. ${part.note}`}
            style={{ width: `${part.share * 100}%` }}
            className={
              part.label === "Impact"
                ? "bg-leaf"
                : part.label === "AI compute and hosting"
                  ? "bg-accent/70"
                  : part.label === "Building the product"
                    ? "bg-white/22"
                    : "bg-white/10"
            }
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {REVENUE_SPLIT.map((part) => (
          <li
            key={part.label}
            className="flex items-baseline gap-2 text-[12px] text-fg-muted"
          >
            <span
              aria-hidden="true"
              className={`mt-1 size-1.5 shrink-0 rounded-full ${
                part.label === "Impact"
                  ? "bg-leaf"
                  : part.label === "AI compute and hosting"
                    ? "bg-accent/70"
                    : part.label === "Building the product"
                      ? "bg-white/22"
                      : "bg-white/10"
              }`}
            />
            <span className="min-w-0 flex-1">{part.label}</span>
            <span className="font-mono text-[11px] text-fg-subtle tabular-nums">
              {percent(part.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
