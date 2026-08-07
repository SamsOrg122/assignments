"use client";

/**
 * The account choice.
 *
 * Two options, side by side, with what each one actually costs stated on it.
 * Most products present the account as inevitable and the local option as a
 * trial; here they are two supported answers, and the one that works today is
 * not apologised for.
 *
 * The sign-up form is real — validation, pending state, error handling — and
 * runs through `lib/auth`, which reports "not switched on" as a distinct
 * outcome from "rejected". That distinction is the whole reason the form is
 * worth building before the backend exists: the day it is configured, this
 * screen already works.
 */

import { useState } from "react";
import Link from "next/link";
import {
  accountsAvailable,
  checkCredentials,
  signIn,
  signOut,
  signUp,
  type AuthOutcome,
} from "@/lib/auth";
import { useAuth } from "@/lib/auth/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";

type Mode = "choose" | "sign-up" | "sign-in";

export function AccountPanel() {
  const identity = useAuth((s) => s.identity);
  const setName = useAuth((s) => s.setName);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const signedIn = useAuth((s) => s.signedIn);
  const signedOut = useAuth((s) => s.signedOut);
  const notify = useUI((s) => s.notify);

  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AuthOutcome | null>(null);

  const available = accountsAvailable();
  const hasAccount = identity.kept === "account";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkCredentials(email, password);
    if (problem) {
      setOutcome({ ok: false, reason: problem });
      return;
    }
    setBusy(true);
    const result = await (mode === "sign-up"
      ? signUp(email, password)
      : signIn(email, password));
    setBusy(false);
    setOutcome(result);
    if (result.ok) {
      signedIn(result.identity);
      notify("Signed in");
      setMode("choose");
      setPassword("");
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Who you are right now. Always shown, account or not. */}
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[12px] text-fg">
          {identity.initials}
        </span>
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] text-fg-subtle">
            Your name, as other people see it
          </span>
          <input
            value={identity.name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Your display name"
            className="mt-0.5 w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
            placeholder="You"
          />
        </label>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]",
            hasAccount
              ? "border-leaf/40 bg-leaf-soft text-leaf"
              : "border-line text-fg-subtle",
          )}
        >
          {hasAccount ? identity.email : "this device"}
        </span>
      </div>

      {hasAccount ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              signedOut();
              notify("Signed out — your work stays in this browser");
            }}
            className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            Sign out
          </button>
          <p className="text-[12px] text-fg-subtle">
            Signing out leaves everything on this device. Nothing is deleted.
          </p>
        </div>
      ) : mode === "choose" ? (
        <>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice
              title="Keep it on this device"
              chosen
              points={[
                "Works now, and works offline.",
                "Nobody can read it, including us.",
                "Doesn't follow you to another browser.",
                "Gone if you clear this browser's data.",
              ]}
              action={
                <button
                  type="button"
                  onClick={() => {
                    keepOnDevice();
                    notify("Keeping your work on this device");
                  }}
                  className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  Stay on this device
                </button>
              }
              footer={
                <>
                  Then use{" "}
                  <span className="text-fg-muted">Keeping your work</span> below
                  to stop the browser clearing it, and take a backup file.
                </>
              }
            />

            <Choice
              title="Create an account"
              points={[
                "Same work, from any machine.",
                "Survives clearing this browser.",
                "Needs an email address.",
                "Your documents sit on a server we run.",
              ]}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-up");
                    setOutcome(null);
                  }}
                  className="w-full rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  Create an account
                </button>
              }
              footer={
                available ? (
                  <>
                    Everything you&apos;ve already made here comes with you —
                    signing up claims this workspace rather than starting an
                    empty one.
                  </>
                ) : (
                  <span className="text-warn">
                    Not switched on yet. The form works; there is nothing behind
                    it until the server exists.
                  </span>
                )
              }
            />
          </div>

          <p className="text-[12px] leading-relaxed text-fg-subtle">
            Either way the free plan is the same product.{" "}
            <Link
              href="/legal#privacy"
              className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
            >
              What happens to your data
            </Link>
            {" · "}
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setOutcome(null);
              }}
              className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
            >
              I already have an account
            </button>
          </p>
        </>
      ) : (
        <form
          onSubmit={submit}
          // The browser's own validation on type="email" silently refuses to
          // submit and shows a bubble, so `checkCredentials` never runs and the
          // user gets two different validation systems depending on which
          // field they got wrong. One source of messages; type="email" stays
          // for the mobile keyboard.
          noValidate
          className="rounded-md border border-line bg-surface p-3.5"
        >
          <p className="text-[13px] font-medium text-fg">
            {mode === "sign-up" ? "Create an account" : "Sign in"}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-subtle">
                Password
                {mode === "sign-up" && (
                  <span className="ml-1 text-fg-subtle">
                    — at least 8 characters
                  </span>
                )}
              </span>
              <input
                type="password"
                autoComplete={
                  mode === "sign-up" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
          </div>

          {outcome && !outcome.ok && (
            <p
              className={cn(
                "mt-3 rounded-sm border p-2.5 text-[12.5px] leading-relaxed",
                "unavailable" in outcome
                  ? "border-warn/35 bg-warn/[0.07] text-fg-muted"
                  : "border-danger/35 bg-danger/[0.07] text-danger",
              )}
            >
              {outcome.reason}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
            >
              {busy
                ? "One moment…"
                : mode === "sign-up"
                  ? "Create it"
                  : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("choose");
                setOutcome(null);
              }}
              className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-up" ? "sign-in" : "sign-up");
                setOutcome(null);
              }}
              className="ml-auto text-[12px] text-fg-subtle underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
            >
              {mode === "sign-up" ? "I have one already" : "Create one instead"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * One option. The drawbacks are listed alongside the benefits and in the same
 * type — a list of four upsides and a footnote is an advertisement, not a
 * choice.
 */
function Choice({
  title,
  points,
  action,
  footer,
  chosen,
}: {
  title: string;
  points: string[];
  action: React.ReactNode;
  footer: React.ReactNode;
  chosen?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-md border p-3.5",
        chosen ? "border-line-strong bg-surface" : "border-line bg-surface/60",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        {title}
        {chosen && (
          <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-subtle">
            now
          </span>
        )}
      </p>
      <ul className="mt-2.5 mb-3.5 flex-1 space-y-1.5">
        {points.map((point) => (
          <li
            key={point}
            className="flex gap-2 text-[12.5px] leading-snug text-fg-muted"
          >
            <span
              aria-hidden="true"
              className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-subtle"
            />
            {point}
          </li>
        ))}
      </ul>
      {action}
      <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">{footer}</p>
    </div>
  );
}
