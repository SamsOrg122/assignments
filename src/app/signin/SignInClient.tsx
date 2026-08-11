"use client";

/**
 * The way in.
 *
 * It existed only as a panel three levels into Settings, which is a fine place
 * for changing an account and a hopeless one for getting into it. This is the
 * page a link in an email, a bookmark, or somebody typing /signin lands on.
 *
 * It does not gate anything. The tool works without an account and says so
 * here, in the same size type as the form.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AccountForm, type AccountMode } from "@/components/account/AccountForm";
import { useAuth, useAuthHydrated } from "@/lib/auth/store";
import { useAccountSession } from "@/lib/auth/session";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { LogoTile } from "@/components/ui/Logo";

export function SignInClient() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const identity = useAuth((s) => s.identity);
  const configured = useRemoteConfigured();
  useAccountSession();

  const [mode, setMode] = useState<AccountMode>(
    params.get("new") === "1" ? "sign-up" : "sign-in",
  );

  const next = params.get("next") ?? "/library";
  const signedIn = hydrated && identity.kept === "account";

  /**
   * Somebody who was *already* signed in when they asked for this page wanted
   * their work, not a form.
   *
   * Only the first answer counts. Redirecting on any signed-in state would
   * fire the instant the form records a new session — which is precisely when
   * the form has something left to ask, like what to do with the work already
   * in this browser. The form does its own navigating when it is finished.
   */
  const onArrival = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (onArrival.current === null) onArrival.current = signedIn;
    if (onArrival.current) router.replace(next);
  }, [hydrated, signedIn, next, router]);

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-[13px] font-medium text-fg"
        >
          <LogoTile size={20} />
          Tougather
        </Link>

        <h1 className="mb-1.5 text-[22px] leading-tight font-medium tracking-[-0.02em] text-fg">
          {mode === "sign-up" ? "Create an account" : "Welcome back"}
        </h1>
        <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">
          An account carries your work between machines and survives clearing
          this browser. It is not required — everything works without one.
        </p>

        <AccountForm
          mode={mode}
          onMode={setMode}
          destination={next}
          onDone={() => {}}
        />

        <p className="mt-4 text-[12.5px] leading-relaxed text-fg-subtle">
          <Link
            href="/library"
            className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
          >
            Skip this and just start writing
          </Link>{" "}
          — your work stays in this browser, and you can make an account later
          without losing any of it.
          {configured ? null : (
            <>
              {" "}
              <Link
                href="/settings#connection"
                className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
              >
                Why accounts are off
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
