"use client";

/**
 * The one thing that must never fail quietly.
 *
 * Sync had a status all along, and it was honest — but it lived as a small
 * word in the sidebar, and "this device" reads like a description rather than
 * a warning. Somebody who signed up, believed their work was in an account and
 * then redeployed had every piece of information they needed and no reason to
 * look at any of it.
 *
 * So the failure comes to where the work is. Three states, and nothing else,
 * because a banner that appears for ordinary conditions is a banner people
 * learn to scroll past:
 *
 *  - **Stuck.** Sync errored or paused. Always shown; this is work not being
 *    saved, right now.
 *  - **Behind.** Something has been unsaved for longer than a push should
 *    ever take. Not shown for the two seconds after a keystroke, which is the
 *    normal state of every document being typed into.
 *  - **Nowhere but here.** No database configured at all, and there is work to
 *    lose. Dismissible, because for somebody deliberately running it local-only
 *    this is a fact rather than a fault — but shown once, unprompted, because
 *    the alternative is finding out by losing a thesis.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCoverage, subscribeSync, syncStatus } from "@/lib/db/sync";
import { useAuth } from "@/lib/auth/store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { formatNumber } from "@/lib/format";

/** Longer than the 2s settle plus a slow round trip. Below this, nothing is wrong. */
const LATE_MS = 30_000;

export function SaveWarning() {
  const configured = useRemoteConfigured();
  /*
   * `KeepPrompt` makes the same point to somebody who has not yet decided
   * about an account, as part of arriving. Two banners saying one thing is one
   * banner people stop reading, so this takes over only once that decision has
   * been made and the nudge has gone.
   */
  const choiceMade = useAuth((s) => s.choiceMade);
  const { total, onlyHere } = useCoverage();
  const status = useSyncExternalStore(
    subscribeSync,
    syncStatus,
    () => ({ state: "off" }) as ReturnType<typeof syncStatus>,
  );
  const [dismissed, setDismissed] = useState(false);
  /*
   * "Behind" becomes true with the passage of time rather than with an event,
   * so the clock is state that something advances — reading `Date.now()` while
   * rendering would be a different answer on every re-render for reasons
   * unrelated to the data. Starting at 0 also means the banner cannot flash on
   * first paint, before the first sync has had any chance to run.
   */
  const [now, setNow] = useState(0);
  useEffect(() => {
    // Only from the timer, never straight away: a clock is an external system
    // this subscribes to, and the first reading arriving ten seconds in costs
    // nothing against a thirty-second threshold.
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  if (total === 0) return null;

  const stuck = status.state === "error" || status.state === "paused";
  const late = now === 0 ? [] : onlyHere.filter((p) => now - p.updatedAt > LATE_MS);

  if (!configured) {
    if (dismissed || !choiceMade) return null;
    return (
      <Banner
        tone="warn"
        onDismiss={() => setDismissed(true)}
        title={`Your work is in this browser only.`}
        body={
          <>
            {formatNumber(total)} {total === 1 ? "project" : "projects"}, and no
            account is holding {total === 1 ? "it" : "them"} — this deployment
            has no database configured. Clearing site data or opening another
            browser means starting empty.
          </>
        }
      />
    );
  }

  if (stuck)
    return (
      <Banner
        tone="warn"
        title="Your work is not reaching your account."
        body={
          <>
            {status.problem ?? "Sync stopped."}{" "}
            {onlyHere.length > 0 && (
              <>
                {formatNumber(onlyHere.length)}{" "}
                {onlyHere.length === 1 ? "project is" : "projects are"} in this
                browser only.
              </>
            )}
          </>
        }
      />
    );

  if (late.length)
    return (
      <Banner
        tone="warn"
        title={`${formatNumber(late.length)} ${late.length === 1 ? "project has" : "projects have"} not reached your account.`}
        body={
          <>
            Everything else is saved. {late.length === 1 ? "This one is" : "These are"}{" "}
            in this browser only, and have been for a while.
          </>
        }
      />
    );

  return null;
}

function Banner({
  tone,
  title,
  body,
  onDismiss,
}: {
  tone: "warn";
  title: string;
  body: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      data-save-warning
      className="anim-slide-up mb-4 flex items-start gap-2.5 rounded-md border border-warn/40 bg-warn/[0.07] p-3"
    >
      <Icon name="minus" size={12} className={`mt-0.5 shrink-0 text-${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-warn">{title}</p>
        <p className="mt-1 text-body leading-relaxed text-fg-muted">
          {body}{" "}
          <Link
            href="/settings#safe"
            className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
          >
            See exactly what is where
          </Link>
          .
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded-sm p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}
