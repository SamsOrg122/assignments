"use client";

/**
 * Where the links in Supabase's emails come back to.
 *
 * Without this page they land on the marketing site, which does not create a
 * Supabase client, so the token in the URL is never read and clicking Confirm
 * appears to do nothing whatsoever. That single missing route is enough to
 * make an account system look completely broken.
 *
 * Three shapes arrive here, depending on the project's settings and on which
 * template sent the mail. All three are handled, because which one you get is
 * not the user's decision to have made wrongly:
 *
 *   - `#access_token=…` — the implicit flow. The client picks it up itself
 *     via `detectSessionInUrl`; this page just waits for it.
 *   - `?code=…` — PKCE. Exchanged here.
 *   - `?token_hash=…&type=…` — the newer template format. Verified here.
 *
 * A recovery link is not a sign-in. It hands over a session whose only purpose
 * is to set a new password, so that is what this screen asks for.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AccountForm } from "@/components/account/AccountForm";
import { supabase } from "@/lib/db/client";
import { useRemoteConfigSettled, useRemoteConfigured } from "@/lib/db/use-config";
import { explainAuthError } from "@/lib/auth/errors";
import { useAccountSession } from "@/lib/auth/session";

type State =
  | { kind: "working" }
  | { kind: "recovery" }
  | { kind: "done" }
  | { kind: "failed"; message: string; fix?: string };

export function CallbackClient() {
  const params = useSearchParams();
  const router = useRouter();
  const settled = useRemoteConfigSettled();
  const configured = useRemoteConfigured();
  // Folds whatever session this page establishes into the stored identity.
  useAccountSession();

  const [state, setState] = useState<State>({ kind: "working" });
  const next = params.get("next") ?? "/library";

  const handle = useCallback(async () => {
    const client = supabase();
    if (!client) {
      setState({
        kind: "failed",
        message: "This deployment has no database configured, so there is no account to confirm.",
        fix: "Set the Supabase keys, then use the link again.",
      });
      return;
    }

    // The hash carries both the implicit-flow tokens and, when something went
    // wrong at Supabase's end, the reason.
    const hash = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, ""),
    );

    const refused = params.get("error_description") ?? hash.get("error_description");
    if (refused) {
      const { message, fix } = explainAuthError(refused);
      setState({ kind: "failed", message, fix });
      return;
    }

    const recovery =
      params.get("type") === "recovery" || hash.get("type") === "recovery";

    try {
      const code = params.get("code");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      if (!code && tokenHash && type) {
        const { error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "signup" | "recovery" | "email_change" | "invite" | "magiclink",
        });
        if (error) throw error;
      }

      // The implicit flow needs no call — `detectSessionInUrl` has already run
      // by now — but it does need the session to actually be there before this
      // page claims anything.
      const { data } = await client.auth.getSession();
      if (!data.session) {
        setState({
          kind: "failed",
          message: "That link didn't carry a session.",
          fix: "It may have already been used, or expired. Ask for a new one from the sign-in screen.",
        });
        return;
      }

      if (recovery) {
        setState({ kind: "recovery" });
        return;
      }

      setState({ kind: "done" });
      router.replace(next);
    } catch (error) {
      const { message, fix } = explainAuthError(error);
      setState({ kind: "failed", message, fix });
    }
  }, [next, params, router]);

  useEffect(() => {
    // Nothing can be decided until the runtime lookup has answered — asking
    // Supabase before the keys are known would report "not configured" for
    // every deployment that sets them in a dashboard.
    if (!settled) return;
    // Off the effect body deliberately: `handle` sets state, and doing that
    // synchronously inside an effect cascades renders.
    void Promise.resolve().then(handle);
  }, [settled, configured, handle]);

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-[13px] font-medium text-fg"
        >
          <span className="grid size-5 place-items-center rounded-xs bg-fg font-mono text-[10px] text-canvas">
            T
          </span>
          Tougather
        </Link>

        {state.kind === "working" && (
          <p className="text-[13px] text-fg-muted">Finishing that off…</p>
        )}

        {state.kind === "done" && (
          <p className="text-[13px] text-fg-muted">
            Confirmed. Taking you to your work…
          </p>
        )}

        {state.kind === "recovery" && (
          <>
            <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
              That link checked out. Choose a new password and you&apos;re back in.
            </p>
            <AccountForm
              mode="new-password"
              onMode={() => {}}
              destination={next}
            />
          </>
        )}

        {state.kind === "failed" && (
          <div className="rounded-md border border-danger/35 bg-danger/[0.07] p-3.5">
            <p className="text-[13px] leading-relaxed text-danger">
              {state.message}
            </p>
            {state.fix && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
                {state.fix}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/signin"
                className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
              >
                Back to signing in
              </Link>
              <Link
                href="/library"
                className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                Carry on without it
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
