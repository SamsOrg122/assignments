"use client";

/**
 * The way in.
 *
 * It existed only as a panel three levels into Settings, which is a fine place
 * for changing an account and a hopeless one for getting into it. This is the
 * page a link in an email, a bookmark, or somebody typing /signin lands on.
 *
 * Two halves. The left is the door's face: the wordmark, the mark on its
 * rules, the copyright — nothing to read, nothing to do. The right is the
 * only thing with controls on it, so there is never a question about where
 * to look. On a phone the left half is a band across the top rather than a
 * column, because a decorative half-screen on a 390-pixel display is a
 * screen you have to scroll past to sign in.
 *
 * It does not gate anything. The tool works without an account, and the line
 * beside the button says so rather than hiding it in small print.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AccountForm, type AccountMode } from "@/components/account/AccountForm";
import { Starburst } from "@/components/account/Starburst";
import { useAuth, useAuthHydrated } from "@/lib/auth/store";
import { useAccountSession } from "@/lib/auth/session";
import { LogoTile } from "@/components/ui/Logo";

/** The heading, and the way back out of whichever mode you are in. */
const HEADINGS: Record<AccountMode, string> = {
  "sign-in": "Login",
  "sign-up": "Sign up",
  reset: "Reset",
  "new-password": "New password",
};

export function SignInClient() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const identity = useAuth((s) => s.identity);
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

  const year = new Date().getFullYear();

  return (
    <main className="signin-stage min-h-dvh p-2.5 sm:p-3.5">
      <div className="grid min-h-[calc(100dvh-20px)] grid-cols-1 gap-2.5 sm:min-h-[calc(100dvh-28px)] sm:gap-3.5 lg:grid-cols-[1fr_minmax(430px,45%)]">
        {/* The face. Decorative on a phone, so it collapses to a band that
            still carries the wordmark rather than disappearing entirely. */}
        <section className="relative min-h-[112px] overflow-hidden rounded-lg lg:min-h-0">
          <Starburst className="hidden lg:block" />

          <Link
            href="/"
            className="absolute top-5 left-5 z-10 flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-white transition-opacity hover:opacity-75 sm:top-7 sm:left-7"
          >
            <LogoTile size={20} className="!bg-white !text-black" />
            Tougather
            <span className="-ml-1 self-start text-[8px] leading-[1.6] text-white/45">
              ®
            </span>
          </Link>

          <p className="absolute bottom-5 left-5 hidden text-[10.5px] text-white/35 sm:bottom-7 sm:left-7 lg:block">
            © Tougather {year}. All rights reserved.
          </p>
        </section>

        {/* The controls, and only the controls. */}
        <section className="signin-panel relative flex flex-col rounded-lg px-6 pt-6 pb-7 sm:px-10 sm:pt-8 sm:pb-9">
          <div className="flex justify-end">
            {mode === "sign-in" ? (
              <button
                type="button"
                onClick={() => setMode("sign-up")}
                className="text-[12px] text-white/55 transition-colors hover:text-white"
              >
                Create an account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("sign-in")}
                className="text-[12px] text-white/55 transition-colors hover:text-white"
              >
                {mode === "sign-up" ? "I have one already" : "Back to login"}
              </button>
            )}
          </div>

          <h1 className="mt-14 mb-9 text-[54px] leading-[0.95] font-light tracking-[-0.035em] text-white sm:mt-20 sm:mb-11 sm:text-[64px]">
            {HEADINGS[mode]}
          </h1>

          <AccountForm
            variant="stage"
            mode={mode}
            onMode={setMode}
            destination={next}
            onDone={() => {}}
          />
        </section>
      </div>
    </main>
  );
}
