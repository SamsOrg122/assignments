"use client";

/**
 * The other ways in.
 *
 * Renders nothing at all unless the deployment named a provider. That is the
 * whole design: an organisation that runs Microsoft accounts sets one
 * environment variable and its people stop typing passwords; an organisation
 * that doesn't never sees a button that would have failed.
 *
 * The SAML row appears only once the typed address matches a domain with a
 * connection registered — so "Continue with your organisation" is offered to
 * the people it will actually work for, and to nobody else.
 */

import { useState } from "react";
import { useAuthOptions } from "@/lib/db/use-config";
import {
  availableProviders,
  signInWithProvider,
  signInWithSSO,
} from "@/lib/auth/providers";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/cn";

export function SingleSignOn({
  email,
  destination = "/library",
  variant = "panel",
}: {
  /** What has been typed so far, for the SAML domain match. */
  email: string;
  destination?: string;
  /**
   * `stage` is the sign-in page's dark treatment, where these buttons sit
   * *above* the password fields rather than below them — on a screen whose
   * whole job is getting in, the one-click way in should not be the thing
   * you scroll past the typing to find.
   */
  variant?: "panel" | "stage";
}) {
  const options = useAuthOptions();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const providers = availableProviders();
  const at = email.indexOf("@");
  const domain = at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
  const sso = options.ssoDomains.includes(domain) ? domain : null;

  if (!providers.length && !sso) return null;

  const go = async (label: string, run: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(label);
    setProblem(null);
    const result = await run();
    // On success the browser is already leaving, so there is nothing to reset.
    if (!result.ok) {
      setBusy(null);
      setProblem(result.reason ?? "That didn't work.");
    }
  };

  const stage = variant === "stage";

  /* The rule reads as "or do it the other way", so which side of the buttons
     it belongs on follows from which side the alternative is. On the stage
     the buttons come first and the typing is the alternative; in the panel
     it is the other way round. */
  const rule = (
    <div className="flex items-center gap-2">
      <span className={cn("h-px flex-1", stage ? "bg-white/15" : "bg-line")} />
      <span
        className={cn(
          "font-mono text-[10px]",
          stage ? "text-white/35" : "text-fg-subtle",
        )}
      >
        OR
      </span>
      <span className={cn("h-px flex-1", stage ? "bg-white/15" : "bg-line")} />
    </div>
  );

  return (
    <div className={stage ? "" : "mt-3.5"}>
      {!stage && rule}

      <div className={cn("flex flex-col gap-1.5", stage ? "" : "mt-2.5")}>
        {sso && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => go("sso", () => signInWithSSO(sso, destination))}
            className={cn(
              "flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-60",
              stage
                ? "rounded-full border border-white/25 px-3 py-2.5 text-[13px] text-white hover:border-white/60 hover:bg-white/5"
                : "rounded-sm border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-accent hover:border-accent",
            )}
          >
            <Icon name="lock" size={stage ? 13 : 11} />
            {busy === "sso" ? "Taking you there…" : `Continue with ${sso}`}
          </button>
        )}

        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={busy !== null}
            onClick={() =>
              go(provider.id, () => signInWithProvider(provider.id, destination))
            }
            className={cn(
              "flex items-center justify-center gap-2.5 transition-colors duration-150 disabled:opacity-60",
              stage
                ? "rounded-full border border-white/25 px-3 py-2.5 text-[13px] font-medium text-white hover:border-white/60 hover:bg-white/5"
                : "rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            <BrandMark id={provider.id} size={stage ? 17 : 14} />
            {busy === provider.id
              ? "Taking you there…"
              : `Continue with ${provider.label}`}
          </button>
        ))}
      </div>

      {problem && (
        <p className="mt-2 text-[12px] leading-relaxed text-danger" role="alert">
          {problem}
        </p>
      )}

      {stage && <div className="mt-7">{rule}</div>}
    </div>
  );
}
