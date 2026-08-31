"use client";

/**
 * "Is my work in my account, or only in this browser?"
 *
 * The question somebody asks after the first time a document does not come
 * back, and the one the interface could not answer. "Synced" in the sidebar is
 * a claim about the last round trip, not about any particular document — a
 * push that has been failing all week looks the same as one that never
 * failed, once the message has scrolled past.
 *
 * So this counts. Every project either has a version the server agreed to or
 * it does not, and the ones that do not are listed by name. A number is
 * checkable in a way that a reassuring adjective is not, and the check button
 * runs the real sync rather than a special test path — a probe that passes
 * while the actual pusher fails would be worse than no probe at all.
 */

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCoverage, syncNow, syncStatus } from "@/lib/db/sync";
import { useAuth } from "@/lib/auth/store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export function WorkIsSafe() {
  const configured = useRemoteConfigured();
  const identity = useAuth((s) => s.identity);
  const { total, inAccount, onlyHere } = useCoverage();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const check = async () => {
    setChecking(true);
    await syncNow();
    setChecking(false);
    setCheckedAt(Date.now());
  };

  /*
   * No database means the answer is not "some of it" — it is "none of it, and
   * that is the configuration, not a fault". Saying anything else here would
   * be the exact reassurance this component exists to replace.
   */
  if (!configured)
    return (
      /*
       * No box. The warning is carried by ink and weight on the sentence
       * that states it, which is the only carrier that survives both themes
       * — a warn tint is 1.1:1 against the canvas and could never have been
       * doing this work on its own.
       */
      <div>
        <p className="text-body font-medium text-warn">
          This deployment has no database, so nothing is in an account.
        </p>
        <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-muted">
          All {formatNumber(total)} of your{" "}
          {total === 1 ? "project lives" : "projects live"} in this browser
          only. Clearing site data, or a different browser, means starting
          empty. Set <code className="font-mono text-fg">SUPABASE_URL</code> and{" "}
          <code className="font-mono text-fg">SUPABASE_ANON_KEY</code> on the
          deployment and this section changes on the next page load — the keys
          are read at runtime, not built in.
        </p>
      </div>
    );

  const status = syncStatus();
  const stuck = status.state === "error" || status.state === "paused";
  const all = onlyHere.length === 0;

  return (
    <div className="flex flex-col gap-(--space-3)">
      {/* The glyph and its colour say which answer this is; the box that
          used to say it as well is gone. cn() stays because the icon still
          changes with the state. */}
      <div className="flex items-start gap-(--space-2)">
        <Icon
          name={all && !stuck ? "check" : "minus"}
          size={13}
          className={cn("mt-0.5 shrink-0", all && !stuck ? "text-accent" : "text-warn")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body text-fg">
            {total === 0
              ? "Nothing to save yet."
              : all
                ? `All ${formatNumber(total)} ${total === 1 ? "project is" : "projects are"} in your account.`
                : `${formatNumber(inAccount)} of ${formatNumber(total)} ${total === 1 ? "project is" : "projects are"} in your account.`}
          </p>

          {!all && (
            <>
              <p className="mt-(--space-1) max-w-[68ch] text-body text-fg-muted">
                {formatNumber(onlyHere.length)}{" "}
                {onlyHere.length === 1 ? "is" : "are"} in this browser only —
                this is the only copy.
              </p>
              {/* A list of rows already has the list to belong to, so the
                  rows lose their hairlines and the list loses its wall —
                  the same reason /due carries twenty-two rows and no row
                  borders. The names are what you came for and keep full
                  ink; the dates are facts and recede. */}
              <ul className="mt-(--space-2) max-h-[160px] overflow-y-auto">
                {onlyHere.slice(0, 25).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-(--space-3) py-(--space-1)"
                  >
                    <span className="min-w-0 truncate text-body text-fg">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-meta text-fg-subtle">
                      {formatDateTime(p.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
              {onlyHere.length > 25 && (
                <p className="mt-(--space-1) text-meta text-fg-subtle">
                  …and {formatNumber(onlyHere.length - 25)} more.
                </p>
              )}
            </>
          )}

              {/*
            The caveat that makes the count above mean what it says. Without an
            email the account is one this browser minted for itself, and the
            only key to it is a token in this origin's storage — so "in your
            account" is true and "safe" is not, and the difference is the whole
            reason somebody is reading this section.
          */}
          {!identity.email && total > 0 && (
            <p className="mt-(--space-2) max-w-[68ch] text-body text-warn">
              You are not signed in, so this is an account this browser made
              for itself. Only this browser, at this address, can reach it —
              clearing site data loses the only way back in.{" "}
              <a
                href="#account"
                className="underline decoration-warn/40 underline-offset-2"
              >
                Sign in with an email
              </a>{" "}
              to make it yours.
            </p>
          )}

          {stuck && status.problem && (
            <p className="mt-(--space-2) max-w-[68ch] text-body text-warn">
              {status.problem}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-(--space-3)">
        {/* It runs the real sync, so it writes: a shape, not a word. */}
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-45"
        >
          {checking ? "Checking…" : "Check my account now"}
        </button>
        {checkedAt && !checking && (
          <span className="text-meta text-fg-subtle">
            Checked {formatDateTime(checkedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
