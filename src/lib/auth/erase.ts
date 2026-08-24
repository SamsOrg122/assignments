"use client";

/**
 * Erasing an account, for real.
 *
 * There was an export and no delete. On a tool used by people at school that
 * is the right to erasure missing, and "email us" is not that right when the
 * person who would answer the email is one teenager.
 *
 * Two halves, and both have to happen or the promise is only half kept:
 *
 *   1. The account. One RPC — see migration 0011. Supabase's client SDK
 *      cannot delete the account it is signed in as, and the usual answer is
 *      a service-role key, which this project deliberately does not have. So
 *      the deletion is a security-definer function that can only ever reach
 *      `auth.uid()`. It takes no argument naming whose account to remove,
 *      because an argument is something an attacker gets to choose.
 *
 *   2. This browser. Everything in the tool works without an account, so the
 *      projects, the kit and the appearance are *also* sitting in
 *      localStorage and IndexedDB right here. Deleting the server copy and
 *      leaving those would show somebody their own work on the next reload,
 *      after being told it was gone — which is worse than not offering the
 *      button.
 */

import { supabase } from "../db/client";

export type Erased =
  | { ok: true }
  | { ok: false; reason: string; fix?: string };

/**
 * Every store this app writes on the machine it is running on.
 *
 * By prefix, not by the list in `persistence`. That list is the *backup*
 * manifest — what is worth saving — and it names six keys while the app
 * writes sixteen. Erasing through it left the agenda, the scope, the shared
 * documents and the stored identity sitting in the browser after somebody
 * had been told their account was gone. A test caught it; the difference
 * between "what to keep" and "what to destroy" is not a difference a list
 * should have to remember on its own.
 */
async function forgetThisBrowser(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("assignments:")) localStorage.removeItem(key);
  } catch {
    /* a browser with storage switched off has nothing to remove */
  }

  // The kit's fonts and pictures are far too big for localStorage and live in
  // IndexedDB, so they are not in STORAGE_KEYS and would otherwise survive.
  try {
    const names = await indexedDB.databases?.();
    for (const { name } of names ?? []) if (name) indexedDB.deleteDatabase(name);
  } catch {
    /* Firefox has no databases(); the sign-out below still ends the session */
  }

  // Anything Supabase kept about the session, in either store — see
  // `lib/auth/remember.ts` for why there are two.
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(store))
        if (key.startsWith("sb-")) store.removeItem(key);
    } catch {
      /* as above */
    }
  }
}

/**
 * Delete the account and everything under it, then this browser's copy.
 *
 * The order matters. The server first: if that fails there is still an
 * account to try again from, whereas wiping locally first and then failing
 * would leave somebody signed in to an account whose work had vanished from
 * in front of them with no explanation.
 */
export async function eraseAccount(): Promise<Erased> {
  const client = supabase();
  if (!client)
    return {
      ok: false,
      reason: "This deployment has no account database, so there is no account to delete.",
      fix: "Everything is in this browser. Settings → Keeping your work clears it.",
    };

  const { data } = await client.auth.getSession();
  if (!data.session)
    return {
      ok: false,
      reason: "You are not signed in, so there is no account to delete.",
    };

  const { error } = await client.rpc("delete_my_account");
  if (error)
    return {
      ok: false,
      reason: error.message,
      // The one failure worth naming, because it is the one a deployment
      // hits rather than a person: the migration has not been run.
      fix: /function .* does not exist/i.test(error.message)
        ? "Run supabase/migrations/0011-a-way-out.sql in the SQL editor."
        : undefined,
    };

  await forgetThisBrowser();
  // The session's user no longer exists, so this cannot fail in a way that
  // matters — but it clears the client's own memory of it.
  await client.auth.signOut().catch(() => {});

  return { ok: true };
}
