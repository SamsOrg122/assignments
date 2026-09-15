/**
 * For a better world, on the page people actually see.
 *
 * The commitment had a whole page to itself at /impact and no presence at all
 * on the homepage, which is the wrong way round for the one thing here that
 * is not a feature: a reader who never clicks through never learns it exists,
 * and a company that only mentions where its money goes on the page dedicated
 * to mentioning it is doing marketing at itself.
 *
 * ── WHAT IS NOT DONE HERE ───────────────────────────────────────────────
 * No tree count, no photograph of a forest, no partner logo. The share is
 * marked `placeholder` in `lib/impact/config.ts` — it is an intended
 * commitment until it is written into the terms — and no partner has been
 * signed, so there is nothing to name. That marker is printed on this section
 * rather than left on the other page, because a promise is exactly the thing
 * a landing page is tempted to round up.
 *
 * The bar is the real split, read out of `REVENUE_SPLIT`, which is checked to
 * total one. Showing where the other ninety percent goes is what stops "10%
 * for the planet" reading as though the rest went nowhere in particular.
 */

import Link from "next/link";
import { IMPACT, PRIMARY_CAUSE, REVENUE_SPLIT, percent } from "@/lib/impact/config";

/** The four slices, in the order they are declared, with the impact one lit. */
const HUES: Record<string, string> = {
  "AI compute and hosting": "var(--sky)",
  "Building the product": "var(--lilac)",
  "Payments, tax and admin": "var(--orchid)",
  Impact: "var(--color-leaf)",
};

export function Better() {
  const share = percent(IMPACT.shareOfRevenue.value);

  return (
    <section className="section" id="impact">
      <div className="wrap">
        <div className="better">
          <div className="better__say">
            <span className="eyebrow glass" data-flow>
              <i />
              For a better world
            </span>

            <h2 className="h2" data-flow style={{ ["--fi" as string]: 1 }}>
              {share} of revenue, set aside before anything else is paid out.
            </h2>

            <p className="lede" data-flow style={{ ["--fi" as string]: 2 }}>
              Of revenue, not of profit — profit is a number we control and you cannot check.
              Revenue is the one both of us can see on your invoice, and it applies to the
              subscription and the metered AI alike, with no carve-out for the expensive part.
            </p>

            <p className="better__note" data-flow style={{ ["--fi" as string]: 3 }}>
              {IMPACT.shareOfRevenue.status === "placeholder" ? (
                <>
                  <b>Not yet binding.</b> This is the intended commitment; it becomes a promise when
                  it is written into our terms. No partner has been signed and no third party has
                  reviewed these figures, so there is no organisation to name here and no tree
                  count to print. {PRIMARY_CAUSE.name} is where the first euro is meant to go.
                </>
              ) : (
                <>
                  Written into our terms. {PRIMARY_CAUSE.name} is where the first euro goes.
                </>
              )}
            </p>

            <Link className="btn btn--ink" href="/impact" data-flow style={{ ["--fi" as string]: 4 }}>
              The whole arrangement, including the unsettled parts
            </Link>
          </div>

          <div className="better__art" data-flow="lift">
            <div className="better__fig" aria-hidden="true">
              {share}
            </div>

            {/* The split, as one bar. Percentages are the shares themselves,
                so a change in the config moves the bar and the labels
                together and they cannot disagree. */}
            <div className="split-bar" role="img" aria-label={`Where each euro goes: ${REVENUE_SPLIT.map((s) => `${percent(s.share)} ${s.label}`).join(", ")}`}>
              {REVENUE_SPLIT.map((s) => (
                <span
                  key={s.label}
                  style={{ width: `${s.share * 100}%`, background: HUES[s.label] ?? "var(--mist)" }}
                  data-impact={s.label === "Impact" ? "" : undefined}
                />
              ))}
            </div>

            <ul className="split-key">
              {REVENUE_SPLIT.map((s) => (
                <li key={s.label} data-impact={s.label === "Impact" ? "" : undefined}>
                  <i style={{ background: HUES[s.label] ?? "var(--mist)" }} aria-hidden="true" />
                  <b>{percent(s.share)}</b>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>

            <p className="better__rough">
              Rough shares, and labelled as rough. The impact line comes out of building the
              product — a real trade against how fast this gets made — rather than out of compute
              or card fees, which are what they are.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
