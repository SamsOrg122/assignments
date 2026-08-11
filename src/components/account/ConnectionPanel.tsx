"use client";

/**
 * The answer to "why can't I sign in?".
 *
 * Nothing here is guessed from environment variables. Each line is the result
 * of actually asking the configured project, in the order the setup steps have
 * to be done, and each failure carries the page in the Supabase dashboard
 * where it is fixed. A misconfigured deployment and a working one look
 * identical from a login form; they do not look identical here.
 */

import { useCallback, useEffect, useState } from "react";
import { diagnose, type Check, type Diagnosis } from "@/lib/db/diagnose";
import { useRemoteConfig } from "@/lib/db/use-config";
import { syncNow } from "@/lib/db/sync";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";

const MARK: Record<Check["state"], string> = {
  ok: "✓",
  bad: "✕",
  warn: "!",
  skipped: "–",
};

const TONE: Record<Check["state"], string> = {
  ok: "border-leaf/40 bg-leaf-soft text-leaf",
  bad: "border-danger/40 bg-danger/[0.08] text-danger",
  warn: "border-warn/40 bg-warn/[0.08] text-warn",
  skipped: "border-line text-fg-subtle",
};

export function ConnectionPanel() {
  const config = useRemoteConfig();
  const notify = useUI((s) => s.notify);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setResult(await diagnose());
    } finally {
      setBusy(false);
    }
  }, []);

  // Run once the configuration question has been answered — before that, every
  // check would report "no keys" on a deployment that has them.
  useEffect(() => {
    // Deferred by a microtask: `run` sets state, and an effect body that does
    // that synchronously cascades renders.
    void Promise.resolve().then(run);
  }, [config?.url, config?.anonKey, run]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {result === null ? (
          <p className="p-3.5 text-[12.5px] text-fg-subtle">Checking…</p>
        ) : (
          result.checks.map((check, index) => (
            <div
              key={check.label}
              className={cn(
                "flex gap-3 p-3.5",
                index > 0 && "border-t border-line",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]",
                  TONE[check.state],
                )}
              >
                {MARK[check.state]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-fg">
                  {check.label}
                  <span className="sr-only">
                    {": "}
                    {check.state === "ok"
                      ? "working"
                      : check.state === "bad"
                        ? "failing"
                        : check.state}
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed break-words text-fg-muted">
                  {check.detail}
                </p>
                {check.fix && (
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">
                    {check.fix}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-60"
        >
          {busy ? "Checking…" : "Check again"}
        </button>
        <button
          type="button"
          onClick={() => {
            void syncNow();
            notify("Syncing now");
          }}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          Sync now
        </button>
        {result && (
          <p className="text-[12px] text-fg-subtle">
            {result.healthy
              ? "Accounts work on this deployment."
              : "Fix the ✕ lines above, then check again."}
          </p>
        )}
      </div>
    </div>
  );
}
