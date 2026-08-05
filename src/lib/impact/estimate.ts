/**
 * The estimator's arithmetic, as pure functions.
 *
 * Kept apart from the UI on purpose: this is the piece that becomes a call to
 * real billing later, and it should be replaceable without touching a
 * component. Everything it needs comes from `config.ts` — there are no numbers
 * in this file.
 */

import {
  IMPACT,
  METER,
  causeById,
  planById,
  type CauseId,
  type PlanId,
} from "./config";

export interface Estimate {
  /** Base subscription for the month, all seats included. */
  subscription: number;
  /** Metered AI on top. Zero while inside the plan's allowance. */
  usage: number;
  total: number;
  /** Credits beyond the included allowance — what `usage` is charged on. */
  billableCredits: number;
  includedCredits: number;
  /** Euros set aside for impact this month. */
  impact: number;
  /** Units of the chosen cause, as a range. Ranges because costs vary by site. */
  units: { low: number; high: number };
  unitsPerYear: { low: number; high: number };
}

export function estimate({
  planId,
  seats = 1,
  credits,
  causeId,
}: {
  planId: PlanId;
  seats?: number;
  credits: number;
  causeId: CauseId;
}): Estimate {
  const plan = planById(planId);
  const cause = causeById(causeId);

  const headcount = plan.perSeat ? Math.max(1, Math.round(seats)) : 1;
  const subscription = plan.price * headcount;

  // A team's allowance is pooled, which is why it scales with seats.
  const includedCredits = plan.includedCredits * headcount;
  // An unmetered plan stops at its allowance rather than billing past it, so
  // moving the slider on Free must never produce a charge.
  const billableCredits = plan.metered
    ? Math.max(0, Math.round(credits) - includedCredits)
    : 0;
  const usage = (billableCredits / 1000) * METER.pricePerThousand.value;

  const total = subscription + usage;
  const impact = total * IMPACT.shareOfRevenue.value;

  // A cheaper unit means more units for the same money, so the low cost bound
  // produces the high count. Getting this backwards would overstate the range.
  const { low, high } = cause.costPerUnit.value;
  const units = {
    low: high > 0 ? impact / high : 0,
    high: low > 0 ? impact / low : 0,
  };

  return {
    subscription,
    usage,
    total,
    billableCredits,
    includedCredits,
    impact,
    units,
    unitsPerYear: { low: units.low * 12, high: units.high * 12 },
  };
}

/**
 * A range as one honest phrase. Collapses to a single number when the bounds
 * round together, so "6–6 trees" never reaches the page.
 */
export function rangeLabel(
  range: { low: number; high: number },
  unit: { one: string; many: string },
): string {
  const low = Math.floor(range.low);
  const high = Math.ceil(range.high);
  const noun = high === 1 ? unit.one : unit.many;

  if (high === 0) return `under one ${unit.one}`;
  if (low === high || low === 0) return `up to ${high} ${noun}`;
  return `${low}–${high} ${noun}`;
}

/** The plan's own footprint at typical usage — for the plan cards. */
export function typicalEstimate(planId: PlanId, causeId: CauseId): Estimate {
  const preset = METER.presets.find((p) => p.id === "regular") ?? METER.presets[0];
  return estimate({ planId, credits: preset.credits, causeId });
}
