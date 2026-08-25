"use client";

/**
 * What plan is this workspace on?
 *
 * `public.subscriptions` has been written by the payment webhook since before
 * anything in the browser read it, so somebody who paid had no way to see that
 * they had. This is the read side, and it is only a read: the client never
 * writes this table (see the note above it in `schema.sql`), and entitlement
 * checks that matter happen server-side.
 *
 * The answers are five, and collapsing any two of them would be a lie:
 *
 *   no database        `{ ok: false, setup: true }` — there is no account
 *                      anywhere, so there is nothing that could hold a plan.
 *   signed out         `{ kind: "signed-out" }`     — the question was never
 *                      asked. A signed-out reader may well be a customer who
 *                      pressed Sign out one section up this same page, so
 *                      this must not say "nothing has been charged".
 *   no row             `{ kind: "free" }`           — asked, as them, and the
 *                      account has no subscription: that is Free.
 *   a row              `{ kind: "on", … }`          — that plan, that status,
 *                      that renewal date.
 *   anything else      `{ ok: false }`              — the question could not
 *                      be asked. Reading that as Free would tell a paying
 *                      customer they are not one.
 *
 * `Outcome` is the same shape `lib/admin` returns for every question it asks
 * of the database, including the `setup: true` flag that separates "not
 * configured" from "went wrong". A second, identical result type living here
 * would only be a chance for the two to disagree.
 */

import { supabase } from "../db/client";
import { useAuth } from "../auth/store";
import { explainAuthErrorLine } from "../auth/errors";
import { useRemoteConfigSettled } from "../db/use-config";
import { useCallback, useEffect, useState } from "react";
import type { Outcome } from "../admin";
import type { Interval } from "./index";
import type { PlanId } from "../impact/config";

/** The four `subscriptions.status` allows. The check constraint is the contract. */
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export interface Subscription {
  /** Which workspace is paying — your own, or the team you are a seat in. */
  workspaceId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  /** Per workspace, so on a team plan this is the whole team's count. */
  seats: number;
  interval: Interval;
  /** End of the paid period, ms. Null when the provider has not sent one. */
  periodEnd: number | null;
}

/**
 * What the read found — three outcomes that all count as "the read worked".
 *
 * A union rather than `Subscription | null`, because null had to stand for
 * both "asked, and you are on Free" and "never asked, nobody was signed in",
 * and the panel above it could not tell those apart. It rendered the second
 * as the first, which meant telling somebody who had just signed out that
 * nothing had been charged to them.
 */
export type PlanState =
  | { kind: "signed-out" }
  | { kind: "free" }
  | { kind: "on"; subscription: Subscription };

const NO_DATABASE = {
  ok: false as const,
  setup: true,
  reason:
    "This deployment has no database, so there is no account for a plan to belong to — the app is running on this browser alone, and nothing has been charged for it.",
};

const failed = (error: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: explainAuthErrorLine(error),
});

interface SubscriptionRow {
  workspace_id: string;
  plan: PlanId;
  status: SubscriptionStatus;
  seats: number;
  interval: Interval;
  current_period_end: string | null;
}

const rowToSubscription = (row: SubscriptionRow): Subscription => ({
  workspaceId: row.workspace_id,
  plan: row.plan,
  status: row.status,
  seats: row.seats,
  interval: row.interval,
  periodEnd: row.current_period_end
    ? (Date.parse(row.current_period_end) || null)
    : null,
});

const RANK: Record<PlanId, number> = { free: 1, pro: 2, team: 3 };

/** A live row of any plan beats a cancelled one; among equals, the better
 *  plan. The ten-point step is what makes "live" dominate "better". */
const worth = (s: Subscription): number =>
  (s.status === "canceled" ? 0 : 10) + RANK[s.plan];

/**
 * Which visible row answers "what am I on".
 *
 * More than one can come back, because the policy is `is_member(workspace_id)`
 * and most people are a member of two workspaces: their own, and the team's.
 * A Team seat whose personal workspace has no row is emphatically not on Free,
 * so the answer is the best plan you are actually a member of.
 */
const strongest = (rows: Subscription[]): Subscription | null =>
  rows.reduce<Subscription | null>(
    (best, row) => (!best || worth(row) > worth(best) ? row : best),
    null,
  );

export async function readSubscription(): Promise<Outcome<PlanState>> {
  const client = supabase();
  if (!client) return NO_DATABASE;

  try {
    const { data: auth } = await client.auth.getSession();
    /*
     * No session is its own answer, not Free and not an error. Asking anyway
     * would come back as a permission error — the table is granted to
     * `authenticated` only — which reads on screen like a fault. And it is
     * emphatically not Free: the Sign out button is one section up this same
     * page, so the most likely signed-out reader here is a paying customer who
     * has just pressed it.
     */
    if (!auth.session) return { ok: true, value: { kind: "signed-out" } };

    /*
     * No `workspace_id` filter, on purpose. Row-level security already answers
     * precisely the question being asked — every workspace this person is a
     * member of, and nothing else — whereas `currentWorkspaceId()` answers
     * "my personal workspace", which is the wrong one for a Team seat, and
     * creates a workspace as a side effect of being asked.
     */
    const { data, error } = await client
      .from("subscriptions")
      .select("workspace_id, plan, status, seats, interval, current_period_end");
    if (error) return failed(error.message);

    const rows = (data as unknown as SubscriptionRow[]) ?? [];
    const found = strongest(rows.map(rowToSubscription));
    return {
      ok: true,
      value: found ? { kind: "on", subscription: found } : { kind: "free" },
    };
  } catch (error) {
    return failed(error);
  }
}

export interface PlanRead {
  /**
   * False until the runtime config lookup has answered. Until it has, the
   * honest thing to say is "checking", not "this deployment has no database" —
   * the keys are read at request time, so the first render cannot know.
   */
  settled: boolean;
  /** Null while the read is still in flight for the first time. */
  outcome: Outcome<PlanState> | null;
  busy: boolean;
  reload: () => Promise<void>;
}

export function usePlan(): PlanRead {
  const settled = useRemoteConfigSettled();
  const [outcome, setOutcome] = useState<Outcome<PlanState> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    const answer = await readSubscription();
    setOutcome(answer);
    setBusy(false);
  }, []);

  // Who the answer is about. Sign in and sign out both happen in the section
  // directly above this one on the settings page, and without this the card
  // would keep answering for whoever was signed in when it mounted — telling
  // somebody who has just signed into a paid account that they are on Free.
  const who = useAuth((s) => s.identity.id);

  useEffect(() => {
    if (!settled) return;
    // Off the effect body: `reload` sets state as its first act, and doing
    // that synchronously here is the cascading render the lint rule is about.
    void Promise.resolve().then(reload);
  }, [settled, reload, who]);

  return { settled, outcome, busy, reload };
}
