"use client";

/**
 * The way out, in the account's own screen.
 *
 * Deliberately not behind a `confirm()`. A browser dialog is the same two
 * buttons people dismiss twenty times a day, and this is the one action in
 * the tool that cannot be undone — there is no tombstone, no bin, no thirty
 * days. So it asks for the word to be typed, which is the only confirmation
 * that cannot be clicked through by muscle memory.
 *
 * And it offers the backup first, in the same block. Somebody deleting an
 * account usually wants to stop having an account, not to stop having their
 * work; putting the export somewhere else and hoping they find it first is
 * how a tool loses somebody's coursework and calls it a user error.
 */

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { eraseAccount } from "@/lib/auth/erase";
import { useAuth } from "@/lib/auth/store";
import { supabase } from "@/lib/db/client";
import { useRemoteConfigured } from "@/lib/db/use-config";

/** Typed exactly, or the button stays off. */
const WORD = "delete";

export function EraseAccount() {
  const configured = useRemoteConfigured();
  const identity = useAuth((s) => s.identity);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ reason: string; fix?: string } | null>(null);
  const [done, setDone] = useState(false);
  /** null while the session is still being read. */
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  /*
   * Whether there is anything to delete is a question about the *session*,
   * not about whether somebody typed an email.
   *
   * This gated on `identity.kept === "account"` and told everybody else
   * "there is nothing here to delete" — which is untrue for the free plan.
   * Working without an account still means an anonymous row in `auth.users`
   * with the projects, notes and files synced under it. Refusing to erase
   * that is refusing erasure to exactly the people who never agreed to
   * anything.
   */
  const readSession = useCallback(async () => {
    const client = supabase();
    if (!client) return setHasSession(false);
    const { data } = await client.auth.getSession();
    setHasSession(Boolean(data.session));
  }, []);

  /*
   * Read it, and then keep listening.
   *
   * Two things arrive after this component first renders, and reading once
   * misses both. The client itself is built only after the runtime config has
   * been fetched — hence `configured`, which flips. And the session is
   * created *later still*: the free plan signs each browser in anonymously,
   * lazily, the first time anything needs the database. Checking once at
   * mount found neither, concluded there was nothing to delete, and offered
   * nobody the button — which was the bug, and it looked exactly like the
   * feature working correctly for somebody signed out.
   *
   * Subscribing rather than polling, and deliberately not calling the app's
   * `session()` helper: that one *creates* an anonymous account when there
   * isn't one, and a settings screen that mints an account in order to offer
   * to delete it would be absurd.
   */
  useEffect(() => {
    void Promise.resolve().then(readSession);

    const client = supabase();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => data.subscription.unsubscribe();
  }, [readSession, configured]);

  const named = identity.kept === "account";

  if (done)
    return (
      <p className="rounded-sm border border-line bg-surface px-3 py-2.5 text-body leading-relaxed text-fg-muted">
        The account is gone, and so is this browser&apos;s copy of everything in
        it. Nothing here is signed in any more. Closing the tab is safe.
      </p>
    );

  if (!configured)
    return (
      <p className="text-body leading-relaxed text-fg-subtle">
        This deployment has no account database, so there is no account to
        delete. Everything is in this browser — “Keeping your work” above
        clears it.
      </p>
    );

  if (hasSession === null)
    return <p className="text-body text-fg-subtle">Looking…</p>;

  if (!hasSession)
    return (
      <p className="text-body leading-relaxed text-fg-subtle">
        This browser has no session, so there is nothing in the database to
        delete. What you have made is in this browser only — “Keeping your
        work” above clears it.
      </p>
    );

  const erase = async () => {
    setBusy(true);
    setProblem(null);
    const result = await eraseAccount();
    setBusy(false);
    if (result.ok) setDone(true);
    else setProblem({ reason: result.reason, fix: result.fix });
  };

  return (
    <div>
      <p className="text-body leading-relaxed text-fg-subtle">
        Deleting removes the account and everything in it — projects, notes,
        the agenda, files, anything posted to the community — from the
        database, and clears this browser at the same time. It cannot be
        undone and there is no thirty-day window.
      </p>

      {!named && (
        // Said out loud, because somebody who never signed up will reasonably
        // assume none of this is about them.
        <p className="mt-2 text-body leading-relaxed text-fg-subtle">
          You have not signed up, but this browser does have an account —
          an anonymous one, made so your work could reach the database at all.
          It holds everything you have made. This deletes that.
        </p>
      )}

      {/*
        The honest footnote. Three columns are `on delete set null` rather
        than cascade, so those rows survive naming nobody. Saying it here is
        cheaper than somebody discovering it and concluding the rest was a
        lie too.
      */}
      <p className="mt-2 text-body leading-relaxed text-fg-subtle">
        Two things outlive it, with your name taken off rather than kept: a
        workspace&apos;s audit log, and any template you made for a team. Both
        belong to the workspace rather than to you, and once the link is cut
        neither one says who you were.
      </p>

      {!open ? (
        <button
          type="button"
            onClick={() => setOpen(true)}
          className="mt-3 rounded-sm border border-danger/45 px-2.5 py-1.5 text-body text-danger transition-colors duration-150 hover:bg-danger/10"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-3 rounded-sm border border-danger/45 bg-danger/[0.06] p-3">
          <p className="text-body leading-relaxed text-fg">
            Take the backup first if you want to keep any of it — “Keeping
            your work” above writes one file with everything in it.
          </p>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-meta text-fg-muted">
              Type <strong className="font-medium text-fg">{WORD}</strong> to
              confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Type ${WORD} to confirm`}
              className="w-full max-w-[240px] rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-body text-fg outline-none focus:border-danger"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={typed.trim().toLowerCase() !== WORD || busy}
              onClick={() => void erase()}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-body font-medium transition-[filter,opacity] duration-150",
                "bg-danger text-white hover:brightness-110",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <Icon name="trash" size={12} />
              {busy ? "Deleting…" : "Delete it for good"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setProblem(null);
              }}
              className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Keep it
            </button>
          </div>

          {problem && (
            <p className="mt-2.5 text-body leading-relaxed text-danger" role="alert">
              {problem.reason}
              {problem.fix && (
                <span className="mt-1 block text-fg-subtle">{problem.fix}</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
