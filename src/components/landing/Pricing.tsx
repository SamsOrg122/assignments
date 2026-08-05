"use client";

/**
 * The pricing module.
 *
 * Plans and estimator share one piece of state on purpose: choosing a plan
 * moves the estimator, and moving the estimator updates the chosen plan's
 * card. That's what makes "more AI → more cost → more trees" a thing you can
 * feel rather than a sentence you have to believe.
 *
 * Every number here comes from `lib/impact` — there is no arithmetic in this
 * file that isn't layout.
 */

import { useState } from "react";
import Link from "next/link";
import {
  CAUSES,
  IMPACT,
  METER,
  PLANS,
  causeById,
  compact,
  euro,
  percent,
  planById,
  type CauseId,
  type PlanId,
} from "@/lib/impact/config";
import { estimate, rangeLabel } from "@/lib/impact/estimate";
import { Glass, Leaf, Provisional, Reveal, Section, SectionHead } from "./primitives";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const DEFAULT_CREDITS =
  METER.presets.find((p) => p.id === "regular")?.credits ?? 4000;

export function Pricing() {
  const [planId, setPlanId] = useState<PlanId>("pro");
  const [seats, setSeats] = useState(3);
  const [credits, setCredits] = useState<number>(DEFAULT_CREDITS);
  const [causeId, setCauseId] = useState<CauseId>("trees");

  const plan = planById(planId);
  const cause = causeById(causeId);
  const est = estimate({ planId, seats, credits, causeId });

  return (
    <Section id="pricing" className="py-20 sm:py-28">
      <Reveal>
        <SectionHead
          eyebrow="Pricing"
          title="A plan, plus the AI you actually use."
          lead={
            <>
              The subscription pays for the product. AI is metered on top,
              because running a model costs money every time — so we charge for
              it honestly rather than hiding it in a tier you may never reach.
              And {percent(IMPACT.shareOfRevenue.value)} of both goes to your
              chosen cause.
            </>
          }
        />
      </Reveal>

      {/* Plans */}
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 70}>
            <PlanCard
              planId={p.id}
              selected={planId === p.id}
              causeId={causeId}
              credits={credits}
              seats={seats}
              onSelect={() => setPlanId(p.id)}
            />
          </Reveal>
        ))}
      </div>

      {/* Estimator */}
      <Reveal delay={60}>
        <Glass className="mt-6 overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            {/* Controls */}
            <div className="border-b border-line p-5 sm:p-6 lg:border-r lg:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-medium text-fg">
                  Estimate your month
                </h3>
                <span className="text-[11.5px] text-fg-subtle">
                  {plan.name}
                  {plan.perSeat ? ` · ${seats} seats` : ""}
                </span>
              </div>

              <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
                A credit is one AI action — a rewrite, a summary, a page of
                speak-to-prose, a thesis turned into a deck.
              </p>

              {plan.perSeat && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-[12.5px] text-fg-muted">Seats</span>
                  <div className="flex items-center gap-1">
                    <Stepper
                      label="Remove a seat"
                      icon="minus"
                      onClick={() => setSeats((s) => Math.max(1, s - 1))}
                      disabled={seats <= 1}
                    />
                    <span className="w-9 text-center font-mono text-[13px] text-fg tabular-nums">
                      {seats}
                    </span>
                    <Stepper
                      label="Add a seat"
                      icon="plus"
                      onClick={() => setSeats((s) => Math.min(50, s + 1))}
                      disabled={seats >= 50}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label
                    htmlFor="ai-usage"
                    className="text-[12.5px] text-fg-muted"
                  >
                    AI usage
                  </label>
                  <span className="font-mono text-[12px] text-fg tabular-nums">
                    {compact(credits)} {METER.unit}
                  </span>
                </div>

                <input
                  id="ai-usage"
                  type="range"
                  min={METER.min}
                  max={METER.max}
                  step={METER.step}
                  value={credits}
                  onChange={(e) => setCredits(Number(e.target.value))}
                  className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
                />

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {METER.presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.hint}
                      aria-pressed={credits === preset.credits}
                      onClick={() => setCredits(preset.credits)}
                      className={cn(
                        "rounded-sm border px-2.5 py-1 text-[11.5px] transition-colors duration-150",
                        credits === preset.credits
                          ? "border-line-strong bg-white/[0.06] text-fg"
                          : "border-line text-fg-subtle hover:text-fg-muted",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cause — a light touch, not a configurator. */}
              <div className="mt-6 border-t border-line pt-5">
                <span className="text-[12.5px] text-fg-muted">
                  Send my share to
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CAUSES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={causeId === c.id}
                      onClick={() => setCauseId(c.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11.5px] transition-colors duration-150",
                        causeId === c.id
                          ? "border-leaf/40 bg-leaf-soft text-leaf"
                          : "border-line text-fg-subtle hover:text-fg-muted",
                      )}
                    >
                      {c.primary && (
                        <span
                          aria-hidden="true"
                          className="size-1 rounded-full bg-current"
                        />
                      )}
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="p-5 sm:p-6">
              <dl className="space-y-2.5">
                <Line
                  label={`${plan.name}${plan.perSeat ? ` × ${seats}` : ""}`}
                  value={euro(est.subscription)}
                />
                <Line
                  label={
                    est.billableCredits > 0
                      ? `AI · ${compact(est.billableCredits)} over allowance`
                      : `AI · within ${compact(est.includedCredits)} included`
                  }
                  value={euro(est.usage)}
                  muted={est.usage === 0}
                />
                <div className="border-t border-line pt-2.5">
                  <Line
                    label="Per month"
                    value={euro(est.total)}
                    strong
                  />
                </div>
              </dl>

              {!plan.metered && credits > plan.includedCredits && (
                <p className="mt-3 flex items-start gap-2 rounded-sm border border-line bg-white/[0.02] p-2.5 text-[11.5px] leading-relaxed text-fg-muted">
                  <Icon
                    name="focus"
                    size={11}
                    className="mt-0.5 shrink-0 text-warn"
                  />
                  Free stops at its allowance rather than billing you. To use
                  this much AI you&apos;d move to Pro.
                </p>
              )}

              {/* The impact of this exact choice. */}
              <div className="mt-5 rounded-md border border-leaf/25 bg-leaf-soft p-4">
                <div className="flex items-center gap-2">
                  <Leaf size={13} className="text-leaf" />
                  <span className="text-[12px] text-leaf">
                    {percent(IMPACT.shareOfRevenue.value)} set aside ·{" "}
                    {euro(est.impact)}/month
                  </span>
                </div>

                <p className="mt-2 text-[20px] leading-tight font-medium text-fg">
                  {est.total > 0 ? (
                    <>
                      ≈ {rangeLabel(est.unitsPerYear, cause.unit)}
                      <span className="text-fg-muted"> a year</span>
                    </>
                  ) : (
                    <span className="text-fg-muted">
                      Nothing, and that&apos;s honest
                    </span>
                  )}
                </p>

                <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted text-pretty">
                  {est.total > 0 ? (
                    <>
                      An estimate, shown as a range because planting costs vary
                      by site. Assumes {euro(cause.costPerUnit.value.low)}–
                      {euro(cause.costPerUnit.value.high)} per {cause.unit.one}.
                      {cause.costPerUnit.status === "placeholder" && (
                        <Provisional note={cause.costPerUnit.note} />
                      )}
                    </>
                  ) : (
                    <>
                      The Free plan costs you nothing, so it funds nothing. We
                      would rather say that than round it up.
                    </>
                  )}
                </p>
              </div>

              <p className="mt-4 text-[11.5px] leading-relaxed text-fg-subtle">
                Metered AI is {euro(METER.pricePerThousand.value)} per 1,000
                credits beyond your allowance.
                {METER.pricePerThousand.status === "placeholder" && (
                  <Provisional note={METER.pricePerThousand.note} />
                )}{" "}
                No minimum, no annual lock-in, cancel from the app.
              </p>
            </div>
          </div>
        </Glass>
      </Reveal>
    </Section>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

function PlanCard({
  planId,
  selected,
  causeId,
  credits,
  seats,
  onSelect,
}: {
  planId: PlanId;
  selected: boolean;
  causeId: CauseId;
  credits: number;
  seats: number;
  onSelect: () => void;
}) {
  const plan = planById(planId);
  const cause = causeById(causeId);
  // Priced against whatever the estimator is currently set to, so the card and
  // the estimator can never disagree.
  const est = estimate({ planId, seats, credits, causeId });

  return (
    <Glass
      className={cn(
        "flex h-full flex-col p-5 transition-colors duration-150",
        selected ? "border-accent/45" : "",
      )}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-[15px] font-medium text-fg">{plan.name}</h3>
        {plan.featured && (
          <span className="rounded-xs border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
            Most chosen
          </span>
        )}
      </div>

      <p className="mt-1.5 min-h-[36px] text-[12.5px] leading-relaxed text-fg-muted">
        {plan.blurb}
      </p>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[32px] leading-none font-medium tracking-[-0.03em] text-fg">
          {plan.price === 0 ? "Free" : euro(plan.price)}
        </span>
        {plan.price > 0 && (
          <span className="text-[12.5px] text-fg-subtle">
            /month{plan.perSeat ? " a seat" : ""}
          </span>
        )}
      </p>

      <p className="mt-2 text-[11.5px] text-fg-subtle">
        {compact(plan.includedCredits)} AI credits included
        {plan.metered ? ", then metered" : ". No metering."}
      </p>

      <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12.5px] text-fg-muted">
            <Icon
              name="check"
              size={11}
              className="mt-1 shrink-0 text-fg-subtle"
            />
            {f}
          </li>
        ))}
      </ul>

      {/* Impact, at the moment of choosing. */}
      <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-[11.5px] leading-relaxed text-fg-muted">
        <Leaf size={12} className="mt-0.5 shrink-0 text-leaf" />
        <span>
          {est.total > 0 ? (
            <>
              Funds ≈{" "}
              <span className="text-fg">
                {rangeLabel(est.unitsPerYear, cause.unit)}
              </span>{" "}
              a year at this usage — an estimate.
            </>
          ) : (
            <>Costs nothing, so it funds nothing.</>
          )}
        </span>
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <Link
          href="/library"
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-transform duration-150 hover:-translate-y-px",
            plan.featured
              ? "bg-fg text-canvas"
              : "border border-line-strong text-fg hover:bg-white/[0.04]",
          )}
        >
          {plan.cta}
        </Link>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="text-[11.5px] text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          {selected ? "Shown in the estimator" : "Estimate this plan"}
        </button>
      </div>
    </Glass>
  );
}

function Line({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={cn(
          "text-[12.5px]",
          strong ? "text-fg" : muted ? "text-fg-subtle" : "text-fg-muted",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 font-mono tabular-nums",
          strong ? "text-[17px] text-fg" : "text-[12.5px] text-fg-muted",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Stepper({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: "plus" | "minus";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-6 place-items-center rounded-sm border border-line text-fg-muted transition-colors duration-150 enabled:hover:border-line-strong enabled:hover:text-fg disabled:opacity-35"
    >
      <Icon name={icon} size={11} />
    </button>
  );
}
