import type { Metadata } from "next";
import {
  H2,
  List,
  NotYet,
  P,
  PageShell,
} from "@/components/landing/PageShell";
import { Provisional } from "@/components/landing/primitives";
import {
  CAUSES,
  IMPACT,
  PLANS,
  PRIMARY_CAUSE,
  REVENUE_SPLIT,
  euro,
  percent,
} from "@/lib/impact/config";

const SHARE = percent(IMPACT.shareOfRevenue.value);

export const metadata: Metadata = {
  title: `Better for the future — ${SHARE} of revenue`,
  // Its own URL, said out loud. The sitemap advertises this page, and a
  // page in a sitemap with no canonical leaves the choice of URL to a crawler.
  alternates: { canonical: "/impact" },
  description:
    `Where ${SHARE} of every euro goes, what the other ${percent(1 - IMPACT.shareOfRevenue.value)} pays for, ` +
    `and which of these numbers are confirmed rather than intended.`,
};

export default function ImpactPage() {
  return (
    <PageShell
      eyebrow="Better for the future"
      title={`${SHARE} of revenue, set aside before anything else is paid out.`}
      lead={
        <>
          Not of profit — profit is a number we control and you can&apos;t
          check. Revenue is the one both of us can see on your invoice. This
          page is the whole arrangement, including the parts that aren&apos;t
          settled yet.
        </>
      }
    >
      <H2>Why ten and not five</H2>
      <P>
        Five percent is the number a company picks when it wants the sentence
        without the cost. It reads as a rounding error, and it usually is one —
        small enough to come out of the marketing budget and be quietly dropped
        in a bad quarter.
      </P>
      <P>
        Ten has to be planned for. It comes out of the line below marked
        building the product, which means it is a real trade against how fast
        this gets built and who gets paid to build it. That is the only version
        of this promise worth making, and it is the reason we would rather show
        you the whole split than a leaf icon.
      </P>

      <H2>What the share applies to</H2>
      <P>
        Everything you pay: the subscription and the metered AI alike. There is
        no carve-out for the expensive part. When you spend {euro(10)} on AI
        credits in a month, {euro(10 * IMPACT.shareOfRevenue.value)} of it is
        set aside the same way your subscription is.
      </P>
      <P>
        That matters because AI usage is the part of this business that grows,
        and a commitment that quietly excludes the growing part is a commitment
        that shrinks every year.
      </P>

      <H2 id="split">Where every euro goes</H2>
      <P>
        Rough shares, and labelled as rough. They are here so this page never
        implies your whole invoice becomes a forest.
      </P>
      <div className="mt-5 overflow-hidden rounded-md border border-line">
        {REVENUE_SPLIT.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline gap-4 border-b border-line px-4 py-3 last:border-b-0"
          >
            <span className="w-[52px] shrink-0 font-mono text-[13px] tabular-nums text-fg">
              {percent(row.share)}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] text-fg">{row.label}</span>
              <span className="block text-[13px] leading-snug text-fg-subtle">
                {row.note}
              </span>
            </span>
          </div>
        ))}
      </div>

      <H2>What it funds</H2>
      <P>
        Trees are the headline and they are not the whole of it. Planting alone
        is the easiest thing to measure and the easiest thing to get wrong —
        a seedling in the ground is not a forest, and a forest that nobody
        tends for a decade is a plantation that burns.
      </P>
      <div className="mt-5 space-y-4">
        {CAUSES.map((cause) => (
          <div key={cause.id} className="rounded-md border border-line p-4">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[14px] text-fg">
              {cause.name}
              {cause.primary && (
                <span className="rounded-xs border border-leaf/35 bg-leaf-soft px-1.5 py-0.5 text-[10px] text-leaf">
                  where it starts
                </span>
              )}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">
              {cause.blurb}
            </p>
            <p className="mt-2 font-mono text-[11.5px] text-fg-subtle">
              {euro(cause.costPerUnit.value.low)}–
              {euro(cause.costPerUnit.value.high)} per {cause.unit.one}
              {cause.costPerUnit.status === "placeholder" && (
                <Provisional note={cause.costPerUnit.note} />
              )}
            </p>
          </div>
        ))}
      </div>

      <H2>What we will not say</H2>
      <List
        items={[
          <>
            That we have planted anything. We have not.{" "}
            {PRIMARY_CAUSE.name} is where the money is earmarked to go, not a
            record of where it has gone.
          </>,
          <>
            A number of trees per subscription. The cost of a surviving tree
            varies by an order of magnitude between projects, and any tidy
            per-user figure is a marketing decision dressed as arithmetic.
          </>,
          <>
            That we are carbon neutral, offset, or net anything. Running models
            costs energy. Setting money aside does not undo that; it funds
            something else that is worth doing.
          </>,
          <>
            The name of a partner we have not signed with. See below.
          </>,
        ]}
      />

      <H2 id="partner">The partner</H2>
      <P>
        Not chosen yet, and we would rather leave this blank than borrow a
        well-known name for credibility we have not earned. What we are looking
        for, in order:
      </P>
      <List
        items={[
          "Published survival rates, not planting counts — after three years and after ten.",
          "Native mixed species, on land with a legal protection that outlives the project.",
          "Local ownership: the people living with the forest are the ones paid to tend it.",
          "Accounts we can link to directly, rather than a summary they wrote about themselves.",
        ]}
      />
      <NotYet
        what="No planting partner is chosen."
        needs={
          <>
            When one is, their name, the contract terms and the reason they were
            chosen over the others go here — including the ones we turned down.
          </>
        }
      />

      <H2 id="verification">Verification</H2>
      <P>
        A commitment nobody checks is a slogan. The intention is an annual
        figure published here, reviewed by someone with no stake in this
        company, showing revenue, the amount set aside, and what was actually
        transferred.
      </P>
      {IMPACT.verification.value === null && (
        <NotYet
          what="Nobody independent has reviewed these figures."
          needs={
            <>
              No report exists yet, because no money has been collected yet.
              When there is a first year to report on, the reviewer&apos;s name
              and their report land here — whatever it says.
            </>
          }
        />
      )}

      <H2>What is settled and what is not</H2>
      <P>
        Everything on this page marked{" "}
        <Provisional note="An intention, not yet a fact." /> is an intention. It
        becomes a fact when it is written into the terms you agree to when you
        pay, and not before. Right now that includes the {SHARE} itself.
      </P>
      <P>
        The free plan is free, and free of this too: {PLANS[0].name} users cost
        us money rather than making us any, so there is nothing to set aside.
        The commitment starts with the first euro anyone pays.
      </P>
    </PageShell>
  );
}
