"use client";

/**
 * "Remember me", meant literally.
 *
 * The tickbox on the sign-in screen is the kind of control that is usually
 * decoration — drawn because people expect it, wired to nothing. Here it
 * decides which browser store the session token lives in, which is the only
 * thing that could make the answer true: `localStorage` survives the browser
 * closing, `sessionStorage` does not.
 *
 * Supabase takes the store as an object at client construction, not per
 * sign-in, so the switch cannot be "build a different client" — that would
 * mean two auth listeners and two refresh timers, which `db/client.ts`
 * exists to prevent. Instead the adapter below is handed over once and asks
 * this module, at every call, where the token belongs.
 *
 * Reading falls back to the other store on purpose. A session written while
 * the box was ticked must still be found the moment somebody unticks it,
 * otherwise flipping a preference silently signs them out.
 *
 * One deliberate asymmetry: forgetting is only ever chosen by somebody
 * signing in with an email and a password — an account they can always get
 * back into. It is never applied to the anonymous sessions the free plan
 * runs on, because those have nothing to sign back in with, and letting one
 * of those expire with the browser would strand the work it owns. Signing
 * out puts the default back for the same reason.
 */

const KEY = "assignments:remember:v1";

/** The default, and the only setting an anonymous session ever runs under. */
let remember = true;

function local(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Storage disabled entirely (a locked-down browser, a sandboxed frame).
    return null;
  }
}

function session(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

// Restored on load, so a browser reopened after "don't remember me" is still
// forgetting rather than quietly reverting to the default.
try {
  if (local()?.getItem(KEY) === "no") remember = false;
} catch {
  /* Same as above: no storage, keep the default. */
}

export const remembering = (): boolean => remember;

/**
 * Change where the session is kept, moving whatever is already there.
 *
 * The move is the part that matters: setting the flag alone would leave a
 * live token in the store nobody is going to read any more, which reads to
 * the user as being signed out at random.
 */
export function setRemembering(next: boolean): void {
  if (next === remember) return;
  remember = next;

  const from = next ? session() : local();
  const to = next ? local() : session();
  if (from && to) {
    const moving: Array<[string, string]> = [];
    for (let i = 0; i < from.length; i++) {
      const key = from.key(i);
      // Supabase namespaces its token as `sb-<project-ref>-auth-token`.
      if (!key || !key.startsWith("sb-")) continue;
      const value = from.getItem(key);
      if (value !== null) moving.push([key, value]);
    }
    for (const [key, value] of moving) {
      to.setItem(key, value);
      from.removeItem(key);
    }
  }

  try {
    if (next) local()?.removeItem(KEY);
    else local()?.setItem(KEY, "no");
  } catch {
    /* The flag is a convenience; the move above is the actual behaviour. */
  }
}

/**
 * The store Supabase writes its session into: whichever one the answer above
 * currently names, with reads falling back to the other.
 */
export const sessionStore = {
  getItem(key: string): string | null {
    const first = remember ? local() : session();
    const second = remember ? session() : local();
    return first?.getItem(key) ?? second?.getItem(key) ?? null;
  },
  setItem(key: string, value: string): void {
    const target = remember ? local() : session();
    const other = remember ? session() : local();
    target?.setItem(key, value);
    // Never two copies: the stale one would win the next fallback read.
    other?.removeItem(key);
  },
  removeItem(key: string): void {
    local()?.removeItem(key);
    session()?.removeItem(key);
  },
};
