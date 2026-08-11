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
import { resendConfirmation, signOut } from "@/lib/auth";
import { useAuth } from "@/lib/auth/store";
import { useAccountSession } from "@/lib/auth/session";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { handOver } from "@/lib/db/sync";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { AccountForm, type AccountMode } from "./AccountForm";

type Mode = "choose" | AccountMode;

export function AccountPanel() {
  const identity = useAuth((s) => s.identity);
  const setName = useAuth((s) => s.setName);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const signedOut = useAuth((s) => s.signedOut);
  const notify = useUI((s) => s.notify);
  // Settings is where somebody goes to find out whether they are actually
  // signed in, so this is the one screen where the answer has to come from the
  // server rather than from what the browser last wrote down.
  useAccountSession();

  const [mode, setMode] = useState<Mode>("choose");

  const available = useRemoteConfigured();
  const hasAccount = identity.kept === "account";

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
            !hasAccount
              ? "border-line text-fg-subtle"
              : identity.pending
                ? "border-warn/40 bg-warn/[0.08] text-warn"
                : "border-leaf/40 bg-leaf-soft text-leaf",
          )}
        >
          {hasAccount ? identity.email : "this device"}
        </span>
      </div>

      {hasAccount && identity.pending && (
        // Not a warning about something being broken: the account works, in
        // this browser, right now. It is a warning about what it can't do yet.
        <div className="rounded-md border border-warn/35 bg-warn/[0.07] p-3 text-[12.5px] leading-relaxed text-fg-muted">
          <p>
            {identity.email} hasn&apos;t been confirmed yet. Everything works
            here and your work is syncing — but you can&apos;t sign in with it
            on another machine until the link in that email is clicked.
          </p>
          <button
            type="button"
            onClick={async () => {
              const again = await resendConfirmation(identity.email ?? "");
              notify(again.ok ? (again.note ?? "Sent again.") : again.reason);
            }}
            className="mt-1.5 text-[12px] text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg"
          >
            Send it again
          </button>
        </div>
      )}

      {hasAccount ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                signedOut();
                // Hands this browser's work to whatever identity comes next —
                // otherwise sync sees an account mismatch and stops, and the
                // promise below would quietly stop being true.
                handOver();
                setMode("choose");
                notify("Signed out — your work stays in this browser");
              }}
              className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() =>
                setMode(mode === "new-password" ? "choose" : "new-password")
              }
              className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Change password
            </button>
            <p className="text-[12px] text-fg-subtle">
              Signing out leaves everything on this device. Nothing is deleted.
            </p>
          </div>
          {mode === "new-password" && (
            <AccountForm
              mode="new-password"
              onMode={() => setMode("choose")}
              onDone={() => setMode("choose")}
            />
          )}
        </>
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
                  onClick={() => setMode("sign-up")}
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
                    Not switched on. Connection, below, says which of the three
                    steps is missing.
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
              onClick={() => setMode("sign-in")}
              className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
            >
              I already have an account
            </button>
          </p>
        </>
      ) : (
        <AccountForm
          mode={mode}
          onMode={setMode}
          onDone={() => setMode("choose")}
        />
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
