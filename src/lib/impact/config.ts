/**
 * Pricing and impact — the single source of truth.
 *
 * Every euro, percentage and tree on the landing page resolves from this file.
 * Nothing downstream hard-codes a number, so changing a rate here changes the
 * hero, the estimator, the plan cards and the transparency copy together.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FOUNDER: everything marked `status: "placeholder"` is a working assumption,
 * not a fact. The page renders those figures with a visible "provisional"
 * marker and says so in plain words. Fill in the real value and flip the
 * status to "confirmed" and the markers disappear on their own — no copy
 * changes needed. Do not flip a status before the number is real: the marker
 * is the thing that keeps this page honest rather than greenwashed.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Where a figure came from. Drives the "provisional" markers in the UI. */
export type Provenance = "placeholder" | "confirmed";

export interface Figure<T> {
  value: T;
  status: Provenance;
  /** Shown in the marker's tooltip — what would make this confirmed. */
  note?: string;
}

/* ── Money ──────────────────────────────────────────────── */

export const CURRENCY = { code: "EUR", symbol: "€", locale: "en-IE" } as const;

export type PlanId = "free" | "pro" | "team";

export interface Plan {
  id: PlanId;
  name: string;
  /** One line, in the user's terms — not ours. */
  blurb: string;
  /** € per month. Per seat when `perSeat`. */
  price: number;
  perSeat: boolean;
  /** AI credits included each month before metering starts. */
  includedCredits: number;
  /**
   * Whether usage past the allowance is billed. Free stops instead of
   * charging — a free plan that can quietly produce an invoice isn't free.
   */
  metered: boolean;
  features: string[];
  cta: string;
  /** The one plan carrying visual weight. Exactly one, or none. */
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "For one project at a time, with enough AI to feel it.",
    price: 0,
    perSeat: false,
    includedCredits: 200,
    metered: false,
    features: [
      "Three projects",
      "Library, Board and every editor",
      "200 AI credits a month",
      "Export to PDF, Word and Markdown",
    ],
    cta: "Start writing",
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For a thesis, a company, or both at once.",
    price: 14,
    perSeat: false,
    includedCredits: 3000,
    metered: true,
    featured: true,
    features: [
      "Unlimited projects and boards",
      "3,000 AI credits a month, then metered",
      "Speak-to-prose and workspace-aware AI",
      "Sources, citations and version history",
      "PowerPoint and Word import",
    ],
    cta: "Start writing",
  },
  {
    id: "team",
    name: "Team",
    blurb: "For a group that shares files, roles and a memory.",
    price: 24,
    perSeat: true,
    includedCredits: 6000,
    metered: true,
    features: [
      "Everything in Pro, per seat",
      "6,000 AI credits a seat, pooled",
      "Roles, invites and shared workspace memory",
      "Team assistant that reads your files",
      "Channels, DMs and live project cards",
    ],
    cta: "Start with your team",
  },
];

export const planById = (id: PlanId): Plan =>
  PLANS.find((p) => p.id === id) ?? PLANS[0];

/* ── AI, metered on top ─────────────────────────────────── */

/**
 * AI is billed by usage because it costs us by usage. A credit is one AI
 * action — a rewrite, a summary, a page of speak-to-prose, a thesis turned
 * into a deck. Nobody pays for a model they don't run.
 */
export const METER = {
  unit: "AI credits",
  unitSingular: "AI credit",
  /**
   * € per 1,000 credits beyond a plan's included allowance.
   *
   * INVARIANT: for every metered plan, the included allowance must be worth
   * *less* at this rate than the plan costs —
   *
   *   includedCredits / 1000 * pricePerThousand  <  price
   *
   * Otherwise a seat is a cheaper way to buy credits than credits are, and a
   * Team customer can lower their bill by adding seats they don't need. At
   * €3: Pro's 3,000 credits are worth €9 against €14, and a Team seat's 6,000
   * are worth €18 against €24. Re-check this before changing any of the three.
   */
  pricePerThousand: {
    value: 3,
    status: "placeholder",
    note: "Set from real inference cost plus margin once usage data exists. Keep it below the point where a plan's allowance is worth more than the plan.",
  } as Figure<number>,
  /** Presets for the estimator. `credits` is the monthly total, not the extra. */
  presets: [
    {
      id: "light",
      label: "Light",
      credits: 1000,
      hint: "A few drafts and rewrites a week.",
    },
    {
      id: "regular",
      label: "Regular",
      credits: 4000,
      hint: "Daily writing with AI in the loop.",
    },
    {
      id: "heavy",
      label: "Heavy",
      credits: 12000,
      hint: "Dictation, long documents, decks, all week.",
    },
  ],
  /** Slider bounds. */
  min: 0,
  max: 30000,
  step: 250,
} as const;

/* ── Impact ─────────────────────────────────────────────── */

export type CauseId = "trees" | "water" | "ocean" | "access";

export interface Cause {
  id: CauseId;
  name: string;
  /** What one unit of this cause is, for the estimator. */
  unit: { one: string; many: string };
  /** Cost range per unit, in €. A range because real costs vary by site. */
  costPerUnit: Figure<{ low: number; high: number }>;
  /** The delivery partner. Named only when a real agreement exists. */
  partner: Figure<{ name: string; url: string } | null>;
  blurb: string;
  /** Trees lead. Everything else is opt-in. */
  primary?: boolean;
}

export const CAUSES: Cause[] = [
  {
    id: "trees",
    name: "Reforestation",
    primary: true,
    unit: { one: "tree", many: "trees" },
    blurb:
      "Native planting with the survival monitoring that makes a planted tree a living one.",
    costPerUnit: {
      value: { low: 1.0, high: 1.6 },
      status: "placeholder",
      note: "Replace with the partner's published per-tree cost, including multi-year monitoring.",
    },
    partner: {
      value: null,
      status: "placeholder",
      note: "No agreement signed yet. We will name the organisation, link their reporting, and publish the contract terms before taking money for it.",
    },
  },
  {
    id: "water",
    name: "Clean water",
    unit: { one: "month of clean water", many: "months of clean water" },
    blurb: "Well repair and maintenance, costed per person per month.",
    costPerUnit: {
      value: { low: 0.4, high: 0.9 },
      status: "placeholder",
      note: "Awaiting a partner's per-beneficiary figure.",
    },
    partner: { value: null, status: "placeholder" },
  },
  {
    id: "ocean",
    name: "Ocean plastic",
    unit: { one: "kg recovered", many: "kg recovered" },
    blurb: "Collection and processing of plastic waste from coastlines and rivers.",
    costPerUnit: {
      value: { low: 0.7, high: 1.2 },
      status: "placeholder",
      note: "Awaiting a partner's per-kilogram figure.",
    },
    partner: { value: null, status: "placeholder" },
  },
  {
    id: "access",
    name: "Study access",
    unit: { one: "student-month", many: "student-months" },
    blurb: "Tougather, free, for students who cannot pay for their tools.",
    costPerUnit: {
      value: { low: 1.2, high: 1.2 },
      status: "confirmed",
      note: "This one we can price exactly: it is our own Pro plan, given away at cost.",
    },
    partner: { value: null, status: "placeholder" },
  },
];

export const causeById = (id: CauseId): Cause =>
  CAUSES.find((c) => c.id === id) ?? CAUSES[0];

export const PRIMARY_CAUSE = CAUSES.find((c) => c.primary) ?? CAUSES[0];

/**
 * The commitment itself.
 *
 * A share of *revenue*, not of profit — profit is a number we control and you
 * can't check. Revenue is the one both of us can see on your invoice.
 */
export const IMPACT = {
  /**
   * Ten percent of revenue, not five.
   *
   * Five is the number a company picks when it wants the sentence without the
   * cost — it reads as a rounding error and invites exactly that reading. Ten
   * is large enough that it has to be planned for, which is the only version
   * of this promise worth making. It comes out of the product-building line
   * below, so it is a real trade against how fast this gets built.
   */
  shareOfRevenue: {
    value: 0.1,
    status: "placeholder",
    note: "Intended commitment. Becomes confirmed when it is written into our terms.",
  } as Figure<number>,
  /** Applies to subscription and metered AI alike — no carve-outs. */
  appliesTo: "subscription and AI usage",
  /** Independent assurance of the above. Null until someone actually audits us. */
  verification: {
    value: null,
    status: "placeholder",
    note: "No third party has reviewed these figures yet. When one has, their name and report link go here.",
  } as Figure<{ name: string; url: string } | null>,
  /** When the first public report lands. Null until it is scheduled. */
  firstReport: {
    value: null,
    status: "placeholder",
    note: "Set the date of the first published impact report.",
  } as Figure<string | null>,
} as const;

/**
 * Where the other 90% goes. Rough shares, and labelled as rough — this is here
 * so the page never implies every euro plants a tree.
 *
 * The impact line is funded out of product-building, not out of compute or
 * card fees, because those two are what they are. Shares must total 1.
 */
export const REVENUE_SPLIT: Array<{ label: string; share: number; note: string }> = [
  {
    label: "AI compute and hosting",
    share: 0.36,
    note: "What the models and the servers actually cost us.",
  },
  {
    label: "Building the product",
    share: 0.41,
    note: "Salaries, tools, the work of making it good.",
  },
  {
    label: "Payments, tax and admin",
    share: 0.13,
    note: "Card fees, accounting, the unglamorous parts.",
  },
  {
    label: "Impact",
    share: 0.1,
    note: "Set aside before anything else is paid out.",
  },
];

/* ── Formatting ─────────────────────────────────────────── */

export function euro(amount: number, opts?: { cents?: boolean }): string {
  const cents = opts?.cents ?? !Number.isInteger(amount);
  return new Intl.NumberFormat(CURRENCY.locale, {
    style: "currency",
    currency: CURRENCY.code,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export function compact(n: number): string {
  return new Intl.NumberFormat(CURRENCY.locale).format(Math.round(n));
}

export const percent = (share: number): string => `${Math.round(share * 100)}%`;
