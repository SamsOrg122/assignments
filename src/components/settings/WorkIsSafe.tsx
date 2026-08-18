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
import { useRemoteConfigured } from "@/lib/db/use-config";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export function WorkIsSafe() {
  const configured = useRemoteConfigured();
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
      <div className="rounded-md border border-warn/35 bg-warn/[0.07] p-3.5">
        <p className="text-[13px] font-medium text-warn">
          This deployment has no database, so nothing is in an account.
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
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
    <div className="flex flex-col gap-2.5">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md border p-3.5",
          all && !stuck
            ? "border-line bg-surface"
            : "border-warn/35 bg-warn/[0.07]",
        )}
      >
        <Icon
          name={all && !stuck ? "check" : "minus"}
          size={13}
          className={cn("mt-0.5 shrink-0", all && !stuck ? "text-accent" : "text-warn")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg">
            {total === 0
              ? "Nothing to save yet."
              : all
                ? `All ${formatNumber(total)} ${total === 1 ? "project is" : "projects are"} in your account.`
                : `${formatNumber(inAccount)} of ${formatNumber(total)} ${total === 1 ? "project is" : "projects are"} in your account.`}
          </p>

          {!all && (
            <>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                {formatNumber(onlyHere.length)}{" "}
                {onlyHere.length === 1 ? "is" : "are"} in this browser only —
                this is the only copy.
              </p>
              <ul className="mt-2 max-h-[160px] overflow-y-auto rounded-sm border border-line">
                {onlyHere.slice(0, 25).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 border-b border-line px-2.5 py-1.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[12.5px] text-fg">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">
                      {formatDateTime(p.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
              {onlyHere.length > 25 && (
                <p className="mt-1 text-[11.5px] text-fg-subtle">
                  …and {formatNumber(onlyHere.length - 25)} more.
                </p>
              )}
            </>
          )}

          {stuck && status.problem && (
            <p className="mt-2 text-[12px] leading-relaxed text-warn">
              {status.problem}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-45"
        >
          {checking ? "Checking…" : "Check my account now"}
        </button>
        {checkedAt && !checking && (
          <span className="text-[11.5px] text-fg-subtle">
            Checked {formatDateTime(checkedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
