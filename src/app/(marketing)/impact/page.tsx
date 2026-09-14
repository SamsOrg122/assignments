import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/storefront/Chrome";
import { Footer } from "@/components/storefront/Footer";
import {
  PageHead,
  PSection,
  Panel,
  Provisional,
} from "@/components/storefront/page";
import {
  CAUSES,
  IMPACT,
  PRIMARY_CAUSE,
  REVENUE_SPLIT,
  euro,
  percent,
} from "@/lib/impact/config";

const SHARE = percent(IMPACT.shareOfRevenue.value);

export const metadata: Metadata = {
  title: `Better for the world — ${SHARE} of revenue`,
  alternates: { canonical: "/impact" },
  description:
    `Where ${SHARE} of every euro goes, what the other ${percent(1 - IMPACT.shareOfRevenue.value)} pays for, ` +
    "and which of these numbers are confirmed rather than intended.",
};

/**
 * Where every euro goes, drawn.
 *
 * The colours are the palette in the order the page uses them, and the widths
 * are the shares themselves — so the bar cannot disagree with the list under
 * it without somebody editing `REVENUE_SPLIT`, which is the only place either
 * of them reads from.
 */
const SPLIT_COLOURS = [
  "linear-gradient(160deg, #3f8082, #163a3d)",
  "linear-gradient(160deg, #cdbcff, #a6c6ff)",
  "linear-gradient(160deg, #ffd0ec, #ff9a6c)",
  "linear-gradient(160deg, #eef07c, #bdeed6)",
];

/** The impact line is last and is the one that gets ink, not a tint. */
const IMPACT_INDEX = REVENUE_SPLIT.findIndex((r) => r.label === "Impact");

function ShareBar() {
  return (
    <>
      <div className="sharebar" aria-hidden="true">
        {REVENUE_SPLIT.map((row, i) => (
          <span
            key={row.label}
            style={{
              flex: `${row.share} 0 0`,
              background: i === IMPACT_INDEX ? "#121215" : SPLIT_COLOURS[i],
              color: i === IMPACT_INDEX || i === 0 ? "#fff" : "var(--ink)",
            }}
          >
            {percent(row.share)}
          </span>
        ))}
      </div>
      <div className="sharelist">
        {REVENUE_SPLIT.map((row) => (
          <div className="shareline" key={row.label}>
            <b>{percent(row.share)}</b>
            <div>
              <h4>{row.label}</h4>
              <p>{row.note}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The four things the share could fund, each with what a euro buys.
 *
 * Every one of these prices is marked provisional, because every one of them
 * is a figure from a partner we have not signed with. A range with a badge on
 * it is a plan; the same range without the badge is a claim.
 */
function Causes() {
  return (
    <div className="cardgrid cardgrid--2">
      {CAUSES.map((cause) => {
        const { low, high } = cause.costPerUnit.value;
        const unit = high === low ? cause.unit.one : cause.unit.many;
        return (
          <Panel key={cause.name}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="panelcard__head">{cause.name}</p>
              {cause.primary ? (
                <span className="text-[13px] text-[var(--coral)]">where it starts</span>
              ) : null}
            </div>
            <p className="mt-2 text-[15.5px] leading-[1.55] text-fg-muted">
              {cause.blurb}
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-3 text-[15px] text-fg">
              <span>
                {euro(low, { cents: true })}–{euro(high, { cents: true })}{" "}
                <span className="text-fg-subtle">per {unit}</span>
              </span>
              {cause.costPerUnit.status !== "confirmed" ? <Provisional /> : null}
            </p>
          </Panel>
        );
      })}
    </div>
  );
}

/**
 * The list of things this page refuses to say.
 *
 * It gets the one ink panel on the page, because it is the part that makes
 * the rest of it worth reading. Every company's impact page says what it
 * does; almost none of them say what they have not done, and the four
 * sentences below are the reason to believe the four above.
 */
const REFUSALS: Array<[string, string]> = [
  [
    "That we have planted anything.",
    "We have not. Reforestation is where the money is earmarked to go, not a record of where it has gone.",
  ],
  [
    "A number of trees per subscription.",
    "The cost of a surviving tree varies by an order of magnitude between projects, and any tidy per-user figure is a marketing decision dressed as arithmetic.",
  ],
  [
    "That we are carbon neutral, offset, or net anything.",
    "Running models costs energy. Setting money aside does not undo that; it funds something else that is worth doing.",
  ],
  [
    "The name of a partner we have not signed with.",
    "When there is one, their name, the contract terms and the reason they were chosen over the others go on this page — including the ones we turned down.",
  ],
];

export default function ImpactPage() {
  return (
    <>
      <Nav />
      <main>
        <PageHead
          eyebrow="Better for the world"
          title={
            <>
              {SHARE} of revenue, set aside before anything else is paid out.
            </>
          }
          glow={["var(--mint)", "var(--sky)"]}
          figure={
            <>
              {SHARE}
              <small>of revenue</small>
            </>
          }
          lead={
            <>
              Not of profit — profit is a number we control and you cannot
              check. Revenue is the one both of us can see on your invoice.
              This page is the whole arrangement, including the parts that are
              not settled yet.
            </>
          }
        />

        <PSection
          title="Why ten and not five."
          lead={
            <>
              Five percent is the number a company picks when it wants the
              sentence without the cost. It reads as a rounding error, and it
              usually is one — small enough to come out of the marketing budget
              and be quietly dropped in a bad quarter.
            </>
          }
        >
          <div className="cardgrid cardgrid--2">
            <Panel>
              <p className="panelcard__head">Ten has to be planned for.</p>
              <p className="mt-2 text-[15.5px] leading-[1.55] text-fg-muted">
                It comes out of the line below marked <b>building the product</b>,
                which means it is a real trade against how fast this gets built
                and who gets paid to build it. That is the only version of this
                promise worth making.
              </p>
            </Panel>
            <Panel>
              <p className="panelcard__head">
                It applies to everything you pay.
              </p>
              <p className="mt-2 text-[15.5px] leading-[1.55] text-fg-muted">
                The subscription and the metered AI alike. There is no carve-out
                for the expensive part: spend €10 on AI credits in a month and
                €1 of it is set aside the same way your subscription is. AI
                usage is the part of this business that grows, and a commitment
                that quietly excludes the growing part is one that shrinks every
                year.
              </p>
            </Panel>
          </div>
        </PSection>

        <PSection
          id="split"
          title="Where every euro goes."
          lead={
            <>
              Rough shares, and labelled as rough. They are here so this page
              never implies your whole invoice becomes a forest.
            </>
          }
        >
          <ShareBar />
        </PSection>

        <PSection
          id="partner"
          title="What it funds."
          lead={
            <>
              Trees are the headline and they are not the whole of it. Planting
              alone is the easiest thing to measure and the easiest thing to get
              wrong — a seedling in the ground is not a forest, and a forest
              nobody tends for a decade is a plantation that burns.
            </>
          }
        >
          <Causes />

          <Panel className="mt-6">
            <p className="panelcard__head">No planting partner is chosen yet.</p>
            <p className="mt-2.5 max-w-[70ch] text-[15.5px] leading-[1.55] text-fg-muted">
              We would rather leave this blank than borrow a well-known name for
              credibility we have not earned. What we are looking for, in order:
              published survival rates rather than planting counts, after three
              years and after ten; native mixed species on land with a legal
              protection that outlives the project; local ownership, so the
              people living with the forest are the ones paid to tend it; and
              accounts we can link to directly rather than a summary they wrote
              about themselves.
            </p>
          </Panel>
        </PSection>

        <PSection title="What we will not say.">
          <Panel ink>
            <div className="refusal">
              {REFUSALS.map(([claim, why]) => (
                <div key={claim}>
                  <i aria-hidden="true" />
                  <p>
                    <b>{claim}</b> {why}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </PSection>

        <PSection
          id="verification"
          title="What is settled, and what is not."
          lead={
            <>
              A commitment nobody checks is a slogan. Everything on this page
              marked provisional is an intention; it becomes a fact when it is
              written into the terms you agree to when you pay, and not before.
              Right now that includes the {SHARE} itself.
            </>
          }
        >
          <div className="cardgrid cardgrid--2">
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <p className="panelcard__head">Independent review</p>
                <Provisional>none yet</Provisional>
              </div>
              <p className="mt-2.5 text-[15.5px] leading-[1.55] text-fg-muted">
                {IMPACT.verification.note} The intention is an annual figure
                published here and reviewed by someone with no stake in this
                company, showing revenue, the amount set aside, and what was
                actually transferred.
              </p>
            </Panel>
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <p className="panelcard__head">The first report</p>
                <Provisional>not scheduled</Provisional>
              </div>
              <p className="mt-2.5 text-[15.5px] leading-[1.55] text-fg-muted">
                No report exists yet, because no money has been collected yet.
                The free plan is free, and free of this too: free users cost us
                money rather than making us any, so there is nothing to set
                aside. The commitment starts with the first euro anyone pays.
              </p>
            </Panel>
          </div>

          <p className="mt-10 text-[15px] text-fg-muted">
            The cause the money starts with is {PRIMARY_CAUSE.name.toLowerCase()}.{" "}
            <Link
              href="/pricing"
              className="text-fg underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
            >
              What a subscription costs
            </Link>{" "}
            is on one page with nothing hidden under it.
          </p>
        </PSection>

        <div className="pb-24" />
      </main>
      <Footer />
    </>
  );
}
