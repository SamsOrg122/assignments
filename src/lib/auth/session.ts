"use client";

/**
 * Keeping the stored identity honest.
 *
 * `auth/store.ts` persists who you are so the app knows it before any network
 * call returns. That cache can be wrong in both directions, and both are
 * things people actually hit:
 *
 *  - **It says account, the server says no.** The session expired, or it was
 *    signed out in another tab, or the project was reset. The app would go on
 *    showing an email address next to a workspace that is quietly local-only.
 *  - **It says device, the server says account.** The confirmation link was
 *    clicked in a different tab, or a session was restored from storage. The
 *    app would offer to create an account you already have.
 *
 * So the server is asked, once on load and again whenever Supabase says the
 * session changed. Being unable to ask — offline, project asleep — changes
 * nothing: an unanswered question is not a sign-out.
 */

import { useEffect } from "react";
import { supabase } from "../db/client";
import { useRemoteConfigured } from "../db/use-config";
import { LOCAL_USER } from "../realtime";
import { currentAccount, type Identity } from "./index";
import { useAuth, useAuthHydrated } from "./store";

/**
 * Fold what the server says into the stored identity.
 *
 * The display name is the one thing the account does not get to overwrite: it
 * was yours before the account was, and it is what other people already see
 * next to your comments. The email local-part is only used when no name has
 * been chosen.
 */
function adopt(account: Identity) {
  const { identity, signedIn } = useAuth.getState();
  if (identity.kept === "account" && identity.id === account.id) return;

  const named = identity.name.trim() && identity.name !== LOCAL_USER.name;
  signedIn({
    ...account,
    ...(named ? { name: identity.name, initials: identity.initials } : {}),
  });
}

export function useAccountSession() {
  const configured = useRemoteConfigured();
  const hydrated = useAuthHydrated();

  useEffect(() => {
    // Nothing to reconcile against without a database, and reconciling before
    // the stored identity has loaded would compare against a default.
    if (!configured || !hydrated) return;

    let cancelled = false;

    const check = async () => {
      let account: Identity | null;
      try {
        account = await currentAccount();
      } catch {
        // Couldn't ask. Leave everything exactly as it is — see the note above.
        return;
      }
      if (cancelled) return;

      if (account) adopt(account);
      else if (useAuth.getState().identity.kept === "account")
        useAuth.getState().signedOut();
    };

    void check();

    // Covers the tab that didn't do the signing in: a confirmation link opened
    // in another window, or a sign-out somewhere else in this browser.
    const subscription = supabase()?.auth.onAuthStateChange(() => void check());

    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, [configured, hydrated]);
}
