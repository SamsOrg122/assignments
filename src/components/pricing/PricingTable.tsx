"use client";

/**
 * The pricing page's working half: interval, seats, plan cards, and the
 * comparison underneath.
 *
 * One piece of state drives all of it. The card, the seat stepper and the
 * checkout page cannot disagree about what someone is buying, because there is
 * only one place that knows — and the same `quote()` computes the number shown
 * here and the number charged.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/landing/primitives";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { quote, YEARLY_MONTHS_CHARGED, type Interval } from "@/lib/billing";
import {
  IMPACT,
  METER,
  PLANS,
  euro,
  percent,
  type PlanId,
} from "@/lib/impact/config";

/**
 * What each plan does about the things people actually compare. Written as
 * text rather than ticks where a tick would be a lie by omission — "3 projects"
 * says more than a green check next to "Projects".
 */
const COMPARISON: Array<{
  group: string;
  rows: Array<{ label: string; values: Record<PlanId, string> }>;
}> = [
  {
    group: "The workspace",
    rows: [
      {
        label: "Projects",
        values: { free: "3", pro: "Unlimited", team: "Unlimited" },
      },
      {
        label: "Documents, decks, tables, boards, code",
        values: { free: "All of them", pro: "All of them", team: "All of them" },
      },
      {
        label: "Version history",
        values: { free: "Last 10 changes", pro: "Full", team: "Full" },
      },
      {
        label: "Import from Word and PowerPoint",
        values: { free: "—", pro: "Yes", team: "Yes" },
      },
    ],
  },
  {
    group: "AI",
    rows: [
      {
        label: "Included credits each month",
        values: { free: "200", pro: "3,000", team: "6,000 a seat, pooled" },
      },
      {
        label: "When they run out",
        values: {
          free: "AI stops until next month",
          pro: `${euro(METER.pricePerThousand.value)} per 1,000`,
          team: `${euro(METER.pricePerThousand.value)} per 1,000`,
        },
      },
      {
        label: "Speak-to-prose and voice",
        values: { free: "—", pro: "Yes", team: "Yes" },
      },
      {
        label: "Reads your whole project for context",
        values: { free: "Yes", pro: "Yes", team: "Yes" },
      },
      {
        label: "Reads the team's files and conventions",
        values: { free: "—", pro: "—", team: "Yes" },
      },
    ],
  },
  {
    group: "People",
    rows: [
      {
        label: "Roles and invites",
        values: { free: "—", pro: "—", team: "Yes" },
      },
      {
        label: "Channels and direct messages",
        values: { free: "—", pro: "—", team: "Yes" },
      },
      {
        label: "Closed groups with a passcode",
        values: { free: "—", pro: "—", team: "Yes" },
      },
    ],
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is a credit, exactly?",
    a: "One AI action: a rewrite, a summary, a page of speak-to-prose, a document turned into a deck. Not a token count — you shouldn't have to think in tokens to know what you spent.",
  },
  {
    q: "Can the free plan charge me by accident?",
    a: "No. It has no payment method attached and AI simply stops when the month's credits are gone. A free plan that can quietly produce an invoice isn't free.",
  },
  {
    q: "Does my work disappear if I don't pay?",
    a: "No. Everything stays where it is and stays exportable — PDF, Word and Markdown, whatever plan you're on. Holding your documents hostage is not a pricing strategy.",
  },
  {
    q: "Why is AI metered instead of unlimited?",
    a: "Because it costs us by the action. Unlimited means either a price that assumes you'll use it heavily, or a limit that isn't written down. Metering is the version where light users pay less.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No. They reset monthly, which is why the allowances are set high enough that most months you won't reach them.",
  },
];

export function PricingTable() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>("month");
  const [seats, setSeats] = useState(3);

  return (
    <>
      <Section className="pb-4">
        {/* Interval. Two buttons rather than a switch: a switch makes you work
            out which side is on. */}
        <div className="inline-flex items-center rounded-full border border-line p-0.5">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors duration-150",
                interval === value
                  ? "bg-fg text-canvas"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {value === "month" ? "Monthly" : "Yearly"}
              {value === "year" && (
                <span
                  className={cn(
                    "ml-1.5 text-[11px]",
                    interval === "year" ? "text-canvas/70" : "text-leaf",
                  )}
                >
                  −{12 - YEARLY_MONTHS_CHARGED} months
                </span>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section className="pb-14">
        <div className="grid gap-3 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const q = quote({ planId: plan.id, seats, interval });
            const featured = plan.featured;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-lg border p-5",
                  featured
                    ? "border-accent/50 bg-surface"
                    : "border-line bg-surface/60",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="display text-[19px] text-fg">{plan.name}</h2>
                  {featured && (
                    <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent">
                      most people
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-fg-muted">
                  {plan.blurb}
                </p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="display text-[34px] leading-none text-fg">
                    {plan.price === 0 ? "Free" : euro(q.perMonth)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-[12.5px] text-fg-subtle">
                      / month{plan.perSeat ? `, ${seats} seats` : ""}
                    </span>
                  )}
                </p>
                {plan.price > 0 && (
                  <p className="mt-1.5 font-mono text-[10.5px] text-fg-subtle">
                    {interval === "year"
                      ? `${euro(q.total)} a year · saves ${euro(q.savedPerYear)}`
                      : `${euro(q.total)} a month`}
                  </p>
                )}

                {plan.perSeat && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-[12px] text-fg-muted">Seats</span>
                    <div className="ml-auto flex items-center gap-1 rounded-sm border border-line">
                      <button
                        type="button"
                        aria-label="Fewer seats"
                        onClick={() => setSeats((n) => Math.max(1, n - 1))}
                        className="px-2 py-1 text-fg-subtle transition-colors hover:text-fg"
                      >
                        <Icon name="minus" size={11} />
                      </button>
                      <span className="min-w-[26px] text-center font-mono text-[12px] tabular-nums text-fg">
                        {seats}
                      </span>
                      <button
                        type="button"
                        aria-label="More seats"
                        onClick={() => setSeats((n) => Math.min(500, n + 1))}
                        className="px-2 py-1 text-fg-subtle transition-colors hover:text-fg"
                      >
                        <Icon name="plus" size={11} />
                      </button>
                    </div>
                  </div>
                )}

                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2 text-[13px] leading-snug text-fg-muted"
                    >
                      <Icon
                        name="check"
                        size={11}
                        className="mt-1 shrink-0 text-fg-subtle"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() =>
                    plan.price === 0
                      ? router.push("/library")
                      : router.push(
                          `/checkout?plan=${plan.id}&interval=${interval}` +
                            (plan.perSeat ? `&seats=${seats}` : ""),
                        )
                  }
                  className={cn(
                    "mt-6 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-[filter,background-color] duration-150",
                    featured
                      ? "bg-accent text-on-accent hover:brightness-110"
                      : "border border-line-strong text-fg hover:bg-surface-2",
                  )}
                >
                  {plan.cta}
                  <Icon name="arrow-right" size={12} />
                </button>

                {plan.price > 0 && (
                  <p className="mt-2.5 text-center text-[11px] text-fg-subtle">
                    {euro(q.setAside)} of that is set aside
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-[12.5px] leading-relaxed text-fg-subtle">
          {percent(IMPACT.shareOfRevenue.value)} of every euro — subscription
          and metered AI alike — is set aside before anything else is paid out.
          Prices exclude VAT, which is added at checkout based on where you are.
        </p>
      </Section>

      {/* ── Comparison ───────────────────────────────────── */}

      <Section className="pb-14">
        <h2 className="display mb-5 text-[clamp(21px,2.6vw,27px)] text-fg">
          Line by line
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="w-[42%] pb-2.5 text-[12px] font-normal text-fg-subtle">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    className="pb-2.5 text-[12.5px] font-medium text-fg"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <>
                  <tr key={group.group}>
                    <td
                      colSpan={4}
                      className="pt-6 pb-1.5 text-[11.5px] text-fg-subtle"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-t border-line">
                      <td className="py-2.5 pr-4 text-[13px] text-fg-muted">
                        {row.label}
                      </td>
                      {PLANS.map((p) => (
                        <td
                          key={p.id}
                          className={cn(
                            "py-2.5 pr-4 text-[13px]",
                            row.values[p.id] === "—"
                              ? "text-fg-subtle"
                              : "text-fg",
                          )}
                        >
                          {row.values[p.id]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Questions ────────────────────────────────────── */}

      <Section className="pb-20">
        <h2 className="display mb-5 text-[clamp(21px,2.6vw,27px)] text-fg">
          The questions worth answering
        </h2>
        <div className="max-w-[70ch] divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-3.5">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-[14px] text-fg marker:content-none">
                {item.q}
                <Icon
                  name="chevron-down"
                  size={12}
                  className="ml-auto shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="mt-2.5 max-w-[66ch] text-[13.5px] leading-relaxed text-fg-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
