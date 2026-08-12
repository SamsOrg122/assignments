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

export function SingleSignOn({
  email,
  destination = "/library",
}: {
  /** What has been typed so far, for the SAML domain match. */
  email: string;
  destination?: string;
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

  return (
    <div className="mt-3.5">
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] text-fg-subtle">OR</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {sso && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => go("sso", () => signInWithSSO(sso, destination))}
            className="flex items-center justify-center gap-2 rounded-sm border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-accent transition-colors duration-150 hover:border-accent disabled:opacity-60"
          >
            <Icon name="lock" size={11} />
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
            className="flex items-center justify-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-60"
          >
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
    </div>
  );
}
