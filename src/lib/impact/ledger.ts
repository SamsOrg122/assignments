/**
 * The impact ledger — what has actually been funded.
 *
 * This is a seam, not a number. It ships reporting *nothing*, because on the
 * day this page goes live nothing has been funded yet, and a counter spinning
 * up to an invented figure is precisely the greenwashing this page is trying
 * not to be. The component renders an honest empty state until real data
 * arrives.
 *
 * FOUNDER: when the first quarter closes, point `setImpactLedger` at whatever
 * you actually reconcile against — a Stripe report, a partner's API, a
 * hand-maintained JSON file. The counter animates from that moment; nothing in
 * the UI changes.
 *
 *   setImpactLedger(async () => ({
 *     status: "live",
 *     units: 1_284,
 *     causeId: "trees",
 *     euros: 1_612.40,
 *     since: "2026-01-01",
 *     updatedAt: Date.now(),
 *     reportUrl: "https://…/impact/2026-q1.pdf",
 *   }));
 */

import type { CauseId } from "./config";

export interface LedgerLive {
  status: "live";
  /** Units of the cause delivered — trees planted, kilograms recovered. */
  units: number;
  causeId: CauseId;
  /** Euros transferred to partners over the same period. */
  euros: number;
  /** ISO date the ledger starts from. */
  since: string;
  updatedAt: number;
  /** Where a reader can check the figure themselves. */
  reportUrl?: string;
}

export interface LedgerPending {
  status: "pending";
  /** Why there is no figure yet, in one sentence, shown verbatim. */
  reason: string;
}

export type Ledger = LedgerLive | LedgerPending;

export type LedgerSource = () => Promise<Ledger>;

const PENDING: LedgerPending = {
  status: "pending",
  reason:
    "No money has moved yet, so there is nothing to report. This figure stays empty until the first quarter closes.",
};

let source: LedgerSource = async () => PENDING;

export function setImpactLedger(next: LedgerSource) {
  source = next;
}

export function getImpactLedger(): Promise<Ledger> {
  return source();
}
