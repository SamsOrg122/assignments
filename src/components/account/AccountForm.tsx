"use client";

/**
 * Everything to do with an account, in one form.
 *
 * Used twice — on `/signin` and inside Settings — because there is exactly one
 * set of rules about what happens when someone signs in, and having two
 * screens implement them separately is how they end up disagreeing.
 *
 * The step worth reading is `handover`. Signing in as an id different from the
 * one this browser has been syncing as is a genuine fork in the road, and the
 * sync layer refuses to guess: it stops rather than risk copying one person's
 * documents into another person's account. So the form asks. Neither answer
 * loses anything — one carries the work into the account, the other leaves it
 * in the browser and will not proceed until a backup file has been taken.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MIN_PASSWORD,
  checkCredentials,
  emailLooksValid,
  resendConfirmation,
  resetPassword,
  signIn,
  signUp,
  updatePassword,
  type AuthFailure,
  type Identity,
} from "@/lib/auth";
import { useAuth } from "@/lib/auth/store";
import { remembering, setRemembering } from "@/lib/auth/remember";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { Icon } from "@/components/ui/Icon";
import { ensureSyncMemory, handOver, startFresh, syncOwner } from "@/lib/db/sync";
import { exportWorkspace } from "@/lib/persistence";
import { allBlobs } from "@/lib/kit/blobs";
import { ensureProjects, useHydrated, useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { SingleSignOn } from "./SingleSignOn";

export type AccountMode = "sign-in" | "sign-up" | "reset" | "new-password";

interface Props {
  mode: AccountMode;
  onMode: (mode: AccountMode) => void;
  /** Called once the person is signed in and the work question is settled. */
  onDone?: () => void;
  /** Where to send them afterwards. Settings stays put; /signin goes to work. */
  destination?: string;
  /**
   * Which skin. `panel` is the bordered card Settings shows inline; `stage`
   * is the full-height treatment on `/signin` — underlined fields, a
   * remember-me, and one large circular commit.
   *
   * A skin, not a fork: every rule above about what happens when somebody
   * signs in is shared, which is the entire reason this component is used in
   * both places rather than written twice.
   */
  variant?: "panel" | "stage";
}

/** What the form is showing right now, beyond which credentials it wants. */
type Step =
  | { kind: "form" }
  | { kind: "failed"; failure: AuthFailure; email: string }
  | { kind: "note"; note: string }
  /** Signed in, but this browser is holding work that isn't in that account. */
  | { kind: "handover"; identity: Identity; count: number };

export function AccountForm({
  mode,
  onMode,
  onDone,
  destination,
  variant = "panel",
}: Props) {
  const configured = useRemoteConfigured();
  const identity = useAuth((s) => s.identity);
  const signedIn = useAuth((s) => s.signedIn);
  const notify = useUI((s) => s.notify);
  const router = useRouter();

  const stage = variant === "stage";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [backedUp, setBackedUp] = useState(false);
  const [reveal, setReveal] = useState(false);
  // Ticked by default, and honest either way — see `lib/auth/remember.ts`.
  const [remember, setRemember] = useState(() => remembering());

  // Both of these hydrate on request, and this screen lives outside the app
  // shell that normally asks. Started here so the answers are ready by the time
  // somebody has finished typing a password — and awaited again below, because
  // "there is nothing in this browser" is the one wrong answer that matters.
  useHydrated();
  useEffect(() => {
    void ensureSyncMemory();
    void ensureProjects();
  }, []);

  const reset = () => {
    setStep({ kind: "form" });
    setBackedUp(false);
  };

  /**
   * Record the identity locally, then work out whether anything has to be
   * asked about the work already here.
   */
  const land = async (next: Identity, note?: string) => {
    signedIn({
      // The display name was theirs before the account was, and it is what
      // other people already see next to their comments.
      ...next,
      ...(identity.name && identity.kept === "account"
        ? {}
        : { name: identity.name, initials: identity.initials }),
    });
    setPassword("");

    await Promise.all([ensureSyncMemory(), ensureProjects()]);
    const owner = syncOwner();
    const count = useProjects.getState().projects.length;

    // Same id — the anonymous session was upgraded, so everything here is
    // already this account's and there is nothing to decide.
    if (!owner || owner === next.id || count === 0) {
      handOver();
      if (note) {
        setStep({ kind: "note", note });
        return;
      }
      notify("Signed in");
      finish();
      return;
    }

    setStep({ kind: "handover", identity: next, count });
  };

  const finish = () => {
    onDone?.();
    if (destination) router.push(destination);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (mode === "reset") {
      if (!emailLooksValid(email)) {
        setStep({
          kind: "failed",
          failure: {
            ok: false,
            reason: "That doesn't look like an email address.",
          },
          email,
        });
        return;
      }
      setBusy(true);
      const result = await resetPassword(email);
      setBusy(false);
      setStep(
        result.ok
          ? { kind: "note", note: result.note ?? "Check your email." }
          : { kind: "failed", failure: result, email },
      );
      return;
    }

    if (mode === "new-password") {
      if (password.length < MIN_PASSWORD) {
        setStep({
          kind: "failed",
          failure: { ok: false, reason: `Use at least ${MIN_PASSWORD} characters.` },
          email,
        });
        return;
      }
      setBusy(true);
      const result = await updatePassword(password);
      setBusy(false);
      if (!result.ok) {
        setStep({ kind: "failed", failure: result, email });
        return;
      }
      setPassword("");
      notify("Password changed");
      finish();
      return;
    }

    const problem = checkCredentials(email, password);
    if (problem) {
      setStep({ kind: "failed", failure: { ok: false, reason: problem }, email });
      return;
    }

    // Before the call, not after: this decides which store the session token
    // is written into, and it is written by the call itself.
    setRemembering(remember);

    setBusy(true);
    const result = await (mode === "sign-up"
      ? signUp(email, password)
      : signIn(email, password));
    setBusy(false);

    if (!result.ok) {
      setStep({ kind: "failed", failure: result, email });
      return;
    }
    await land(result.identity, result.note);
  };

  /* ── The work-already-here question ── */

  // The two stop-screens keep one layout and swap their ground, because on
  // the black stage the app's grey surface reads as a smudge rather than a
  // card.
  const sheet = stage
    ? "rounded-md border border-white/15 bg-white/[0.04] p-3.5"
    : "rounded-md border border-line bg-surface p-3.5";

  if (step.kind === "handover")
    return (
      <div className={sheet}>
        <p className="text-body font-medium text-fg">
          Signed in as {step.identity.email}
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-fg-muted">
          This browser is holding {step.count}{" "}
          {step.count === 1 ? "project" : "projects"} that {step.count === 1 ? "isn't" : "aren't"}{" "}
          in that account yet — made before you signed in. Whose {step.count === 1 ? "is it" : "are they"}?
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              handOver();
              notify(`Bringing your work into ${step.identity.email}`);
              finish();
            }}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            Mine — bring {step.count === 1 ? "it" : "them"} into this account
          </button>

          <div className="rounded-sm border border-line p-2.5">
            <p className="text-body text-fg-muted">
              Not mine — leave {step.count === 1 ? "it" : "them"} out of the account.
            </p>
            <p className="mt-1 text-body leading-relaxed text-fg-subtle">
              {step.count === 1 ? "It is" : "They are"} removed from this browser, so take the
              backup file first. Nothing is deleted from anyone&apos;s account.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void allBlobs()
                    .catch(() => ({}))
                    .then((blobs) =>
                      exportWorkspace(
                        {
                          "assignments:projects:v1": JSON.stringify({
                            state: { projects: useProjects.getState().projects },
                            version: 0,
                          }),
                        },
                        blobs,
                      ),
                    )
                    .then(({ filename }) => {
                      setBackedUp(true);
                      notify(`Saved ${filename}`);
                    });
                }}
                className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                {backedUp ? "Backup saved ✓" : "Save a backup file"}
              </button>
              <button
                type="button"
                disabled={!backedUp}
                onClick={() => {
                  startFresh();
                  notify(`Signed in as ${step.identity.email}`);
                  finish();
                }}
                className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear this browser and continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  /* ── Sent-you-an-email, and other things worth stopping on ── */

  if (step.kind === "note")
    return (
      <div className={sheet}>
        <p className="rounded-sm border border-accent/35 bg-accent-soft p-2.5 text-body leading-relaxed text-fg-muted">
          {step.note}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              finish();
            }}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            Carry on working
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            Back
          </button>
        </div>
      </div>
    );

  const failure = step.kind === "failed" ? step.failure : null;
  const wantsEmail = mode !== "new-password";
  const wantsPassword = mode !== "reset";

  const commit = busy
    ? "One moment…"
    : mode === "sign-up"
      ? "Create it"
      : mode === "reset"
        ? "Send the link"
        : mode === "new-password"
          ? "Save it"
          : "Sign in";

  /* ── The stage: the door, rather than a panel inside a page ── */

  if (stage)
    return (
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
        {/* Above the fields, not below them. One click beats eight
            characters, and burying it under the typing is how a sign-in
            screen ends up with people resetting passwords they need not
            have had. */}
        {(mode === "sign-in" || mode === "sign-up") && (
          <div className="mb-8">
            <SingleSignOn
              variant="stage"
              email={email}
              destination={destination ?? "/library"}
            />
          </div>
        )}

        {/* Stacked, not side by side. Email beside password is the shape of a
            search bar with a filter, not of a sign-in — and on the phone it
            stacked anyway, so the two-column version only ever existed to
            look like something. */}
        <div className="grid gap-4">
          {wantsEmail && (
            <label className="block">
              <span
                className="mb-1.5 block text-meta font-medium"
                style={{ color: "var(--pad-ink-2)" }}
              >
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pad-field w-full px-3.5 py-2.5 text-[13.5px]"
              />
            </label>
          )}
          {wantsPassword && (
            <label className="relative block">
              <span
                className="mb-1.5 block text-meta font-medium"
                style={{ color: "var(--pad-ink-2)" }}
              >
                {mode === "new-password" ? "New password" : "Password"}
              </span>
              <input
                type={reveal ? "text" : "password"}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder={mode === "sign-in" ? "••••••••" : `At least ${MIN_PASSWORD} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pad-field w-full py-2.5 pr-10 pl-3.5 text-[13.5px]"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide password" : "Show password"}
                title={reveal ? "Hide password" : "Show password"}
                className="pad-ghost absolute right-1.5 bottom-[7px] p-1.5"
              >
                <Icon name={reveal ? "eye-off" : "eye"} size={14} />
              </button>
            </label>
          )}
        </div>

        {mode === "sign-in" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label
              className="flex cursor-pointer items-center gap-2 text-body"
              style={{ color: "var(--pad-ink-2)" }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="signin-tick grid size-[16px] place-items-center rounded-[5px] text-[9px] leading-none text-transparent"
              >
                ✓
              </span>
              Remember me
            </label>
            <button
              type="button"
              onClick={() => {
                onMode("reset");
                reset();
              }}
              className="text-body underline underline-offset-2 transition-opacity hover:opacity-75"
              style={{ color: "var(--pad-ink-3)" }}
            >
              Forgot?
            </button>
          </div>
        )}

        {mode === "reset" && (
          <p className="mt-4 max-w-[46ch] text-body leading-relaxed text-white/50">
            We&apos;ll email a link that signs you in and lets you set a new one.
          </p>
        )}

        {failure && (
          <div
            className={cn(
              "mt-5 max-w-[56ch] rounded-sm border p-3 text-body leading-relaxed",
              failure.setup
                ? "border-warn/40 bg-warn/[0.08] text-white/75"
                : "border-danger/45 bg-danger/[0.09] text-danger",
            )}
            role="alert"
          >
            {failure.reason}
            {failure.fix && <span className="mt-1 block text-white/50">{failure.fix}</span>}
            {failure.unconfirmed && (
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  const again = await resendConfirmation(
                    step.kind === "failed" ? step.email : email,
                  );
                  setBusy(false);
                  setStep(
                    again.ok
                      ? { kind: "note", note: again.note ?? "Sent." }
                      : { kind: "failed", failure: again, email },
                  );
                }}
                className="mt-1.5 block text-body text-white/70 underline underline-offset-2 hover:text-white"
              >
                Send the confirmation email again
              </button>
            )}
          </div>
        )}

        {!configured && (
          <p className="mt-5 max-w-[56ch] rounded-sm border border-warn/40 bg-warn/[0.08] p-3 text-body leading-relaxed text-white/75">
            No database is configured, so there is nothing to sign in to yet.
            Your work is safe in this browser meanwhile —{" "}
            <Link
              href="/settings#connection"
              className="underline underline-offset-2 hover:text-white"
            >
              Settings → Connection
            </Link>{" "}
            says exactly what is missing.
          </p>
        )}

        {/*
          * The button, directly under the thing it submits.
          *
          * It used to be a 76-pixel white circle pinned to the floor of the
          * panel with `mt-auto`, which on a tall screen left four hundred
          * pixels of nothing between the password field and the way in. A
          * circle also cannot say what it does — "SIGN IN" had to be set in
          * 10px capitals to fit, so the most important control on the page
          * carried the smallest text on it.
          */}
        <button
          type="submit"
          disabled={busy}
          className="pad-primary mt-6 w-full px-4 py-3 text-[13.5px]"
        >
          {busy ? "One moment…" : commit}
        </button>

        {/* The reassurance goes to the floor. It is worth saying and it is
            not worth putting between somebody and the button. */}
        <p
          className="mt-auto max-w-[46ch] pt-8 text-meta leading-relaxed"
          style={{ color: "var(--pad-ink-3)" }}
        >
          {mode === "sign-up"
            ? "An account carries your work between machines. Everything works without one."
            : "No account? The tool still works — everything stays in this browser."}
        </p>
      </form>
    );

  return (
    <form
      onSubmit={submit}
      // The browser's own validation on type="email" silently refuses to
      // submit and shows a bubble, so `checkCredentials` never runs and the
      // user gets two different validation systems depending on which field
      // they got wrong. One source of messages; type="email" stays for the
      // mobile keyboard.
      noValidate
      className="rounded-md border border-line bg-surface p-3.5"
    >
      <p className="text-body font-medium text-fg">
        {mode === "sign-up"
          ? "Create an account"
          : mode === "reset"
            ? "Reset your password"
            : mode === "new-password"
              ? "Choose a new password"
              : "Sign in"}
      </p>

      {mode === "reset" && (
        <p className="mt-1.5 text-body leading-relaxed text-fg-subtle">
          We&apos;ll email a link that signs you in and lets you set a new one.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {wantsEmail && (
          <label className="flex flex-col gap-1">
            <span className="text-meta text-fg-subtle">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
            />
          </label>
        )}
        {wantsPassword && (
          <label className="flex flex-col gap-1">
            <span className="text-meta text-fg-subtle">
              {mode === "new-password" ? "New password" : "Password"}
              {mode !== "sign-in" && (
                <span className="ml-1 text-fg-subtle">
                  — at least {MIN_PASSWORD} characters
                </span>
              )}
            </span>
            <input
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
            />
          </label>
        )}
      </div>

      {failure && (
        <div
          className={cn(
            "mt-3 rounded-sm border p-2.5 text-body leading-relaxed",
            failure.setup
              ? "border-warn/35 bg-warn/[0.07] text-fg-muted"
              : "border-danger/35 bg-danger/[0.07] text-danger",
          )}
          role="alert"
        >
          {failure.reason}
          {failure.fix && (
            <span className="mt-1 block text-fg-subtle">{failure.fix}</span>
          )}
          {failure.unconfirmed && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                const again = await resendConfirmation(step.kind === "failed" ? step.email : email);
                setBusy(false);
                setStep(
                  again.ok
                    ? { kind: "note", note: again.note ?? "Sent." }
                    : { kind: "failed", failure: again, email },
                );
              }}
              className="mt-1.5 block text-body text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg"
            >
              Send the confirmation email again
            </button>
          )}
        </div>
      )}

      {!configured && (
        <p className="mt-3 rounded-sm border border-warn/35 bg-warn/[0.07] p-2.5 text-body leading-relaxed text-fg-muted">
          No database is configured, so there is nothing to sign in to yet. Your
          work is safe in this browser meanwhile —{" "}
          <Link
            href="/settings#connection"
            className="underline decoration-line-strong underline-offset-2 hover:text-fg"
          >
            Settings → Connection
          </Link>{" "}
          says exactly what is missing.
        </p>
      )}

      {(mode === "sign-in" || mode === "sign-up") && (
        <SingleSignOn email={email} destination={destination ?? "/library"} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
        >
          {commit}
        </button>

        {mode !== "new-password" && (
          <button
            type="button"
            onClick={() => {
              onMode(mode === "sign-up" ? "sign-in" : "sign-up");
              reset();
            }}
            className="text-body text-fg-subtle underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
          >
            {mode === "sign-up" ? "I have one already" : "Create one instead"}
          </button>
        )}

        {mode === "sign-in" && (
          <button
            type="button"
            onClick={() => {
              onMode("reset");
              reset();
            }}
            className="ml-auto text-body text-fg-subtle underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
          >
            Forgotten your password?
          </button>
        )}

        {mode === "reset" && (
          <button
            type="button"
            onClick={() => {
              onMode("sign-in");
              reset();
            }}
            className="ml-auto text-body text-fg-subtle underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
          >
            Back to signing in
          </button>
        )}
      </div>
    </form>
  );
}
