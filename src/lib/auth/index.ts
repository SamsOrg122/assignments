"use client";

/**
 * Identity, and the choice about where work lives.
 *
 * Two states, and the user picks:
 *
 *  - **On this device.** No account, no server, no email. Everything is in the
 *    browser and the `lib/persistence` tools keep it there. This is the
 *    default, and it is a real answer rather than a trial period — someone who
 *    never signs up never loses anything.
 *  - **With an account.** The same work, reachable from another machine, and
 *    recoverable if this browser is wiped.
 *
 * The choice is the feature. Most tools present the account as inevitable and
 * the local option as a demo; here they're two supported answers, and the
 * screen says what each one actually costs you.
 *
 * Accounts need the Supabase steps in `lib/db/index.ts`. Without those keys
 * every call here comes back with `setup: true` and a plain reason — a
 * distinct outcome from being rejected — and the UI offers the device option
 * as the one that works.
 *
 * Nothing in this file invents a happy path. An account that exists but whose
 * address is unconfirmed says exactly that, because "Signed in!" followed by
 * a mysterious failure on the next machine is the kind of small lie that costs
 * somebody their work.
 */

import { supabase } from "../db/client";
import { isRemoteConfigured } from "../db";
import { explainAuthError } from "./errors";

export interface Identity {
  /** Stable id used by comments, presence and mentions. */
  id: string;
  name: string;
  initials: string;
  /** Present only once there is a real account. */
  email?: string;
  /**
   * How this identity is kept. "device" is not a lesser state — it is the
   * chosen one until somebody chooses otherwise.
   */
  kept: "device" | "account";
  /**
   * The address is waiting on a confirmation link.
   *
   * This is an account — the work is already syncing under it, in this
   * browser, right now — and forgetting that until the link is clicked is
   * worse than useless: with Supabase's default settings it is what *every*
   * new sign-up looks like for the first few minutes, and the app would keep
   * offering to create the account they just created.
   */
  pending?: boolean;
}

/** Everything that can go wrong, in the shape the forms render. */
export interface AuthFailure {
  ok: false;
  reason: string;
  /** The switch to flip, where there is one to flip. */
  fix?: string;
  /**
   * A configuration problem rather than a rejection — no keys, no schema,
   * a provider switched off. Rendered in a different colour, because "the
   * server isn't set up" and "your password is wrong" are not the same news.
   */
  setup?: boolean;
  /** The address has to be confirmed before this account can be used. */
  unconfirmed?: boolean;
}

export type AuthOutcome =
  /**
   * `note` is for the thing that is neither success nor failure: the account
   * exists but the address has to be confirmed by email before it can be
   * signed in with from anywhere else.
   */
  | { ok: true; identity: Identity; note?: string }
  | AuthFailure;

/** For the flows that produce no identity — reset, resend, change password. */
export type SimpleOutcome = { ok: true; note?: string } | AuthFailure;

export interface AuthProvider {
  readonly name: string;
  /** Whether accounts can be created here at all. */
  isAvailable(): boolean;
  signUp(email: string, password: string): Promise<AuthOutcome>;
  signIn(email: string, password: string): Promise<AuthOutcome>;
  signOut(): Promise<void>;
  /** Send a "set a new password" link. */
  resetPassword(email: string): Promise<SimpleOutcome>;
  /** Send the confirmation email again. */
  resendConfirmation(email: string): Promise<SimpleOutcome>;
  /** Change the password of whoever is signed in right now. */
  updatePassword(password: string): Promise<SimpleOutcome>;
  /**
   * Who the *server* says is signed in. The browser's stored identity is a
   * cache of this and can be out of date in both directions — an expired
   * session, or a session picked up from a confirmation link in another tab.
   */
  currentAccount(): Promise<Identity | null>;
}

/* ── Validation, shared by every provider ───────────────── */

/** Deliberately loose. An address either delivers or it doesn't, and a clever
 *  regex mostly rejects real addresses belonging to real people. */
export const emailLooksValid = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export const MIN_PASSWORD = 8;

export function checkCredentials(
  email: string,
  password: string,
): string | null {
  if (!emailLooksValid(email)) return "That doesn't look like an email address.";
  if (password.length < MIN_PASSWORD)
    return `Use at least ${MIN_PASSWORD} characters.`;
  return null;
}

/** "Sam Goudbeek" → "SG". Two letters, because three never fits the circle. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "YO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** An explained failure, from anything Supabase threw back. */
const fail = (error: unknown): AuthFailure => {
  const { message, fix, setup, unconfirmed } = explainAuthError(error);
  return { ok: false, reason: message, fix, setup, unconfirmed };
};

/**
 * Where the links in Supabase's emails come back to.
 *
 * Without this the address in the dashboard's "Site URL" wins, which on a
 * preview deploy is somebody else's deployment, and clicking Confirm signs you
 * in somewhere you weren't.
 */
export const callbackUrl = (next?: string): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
};

/* ── The device provider ────────────────────────────────── */

const NO_ACCOUNTS: AuthFailure = {
  ok: false,
  reason:
    "Accounts aren't switched on, so there's nowhere to sign in to. Your work is safe on this device meanwhile.",
  fix: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then check Settings → Connection.",
  setup: true,
};

const deviceAuth: AuthProvider = {
  name: "device",
  isAvailable: () => false,
  async signUp() {
    return NO_ACCOUNTS;
  },
  async signIn() {
    return NO_ACCOUNTS;
  },
  async signOut() {
    // Nothing to sign out of. Not an error — the local identity stays.
  },
  async resetPassword() {
    return NO_ACCOUNTS;
  },
  async resendConfirmation() {
    return NO_ACCOUNTS;
  },
  async updatePassword() {
    return NO_ACCOUNTS;
  },
  async currentAccount() {
    return null;
  },
};

/* ── The Supabase provider ──────────────────────────────── */

/** An account identity. The display name is the caller's to keep. */
const identityFor = (id: string, email: string, pending = false): Identity => {
  const name = email.split("@")[0] ?? "You";
  return {
    id,
    name,
    initials: initialsFor(name),
    email,
    kept: "account",
    ...(pending ? { pending: true } : {}),
  };
};

/**
 * The interesting case is the *upgrade*.
 *
 * Someone who has been working anonymously already has an `auth.users` row, so
 * signing up calls `updateUser({ email, password })` rather than creating a
 * second identity — the user id never changes, which is why every project they
 * made before signing up is already theirs afterwards and nothing has to be
 * migrated. Creating a fresh account instead would strand the anonymous work
 * under an identity nobody can ever sign in as.
 */
const supabaseAuth: AuthProvider = {
  name: "supabase",
  isAvailable: () => isRemoteConfigured(),

  async signUp(email, password) {
    const problem = checkCredentials(email, password);
    if (problem) return { ok: false, reason: problem };
    const client = supabase();
    if (!client) return NO_ACCOUNTS;

    try {
      const { data: current } = await client.auth.getSession();
      const anonymous = current.session?.user;

      if (anonymous && !anonymous.email) {
        const { data, error } = await client.auth.updateUser(
          { email, password },
          { emailRedirectTo: callbackUrl("/library") },
        );
        if (error) return fail(error);
        const user = data.user;
        // With email confirmations on — Supabase's default — the address moves
        // to `new_email` and stays there until the link is clicked. The account
        // is real either way; it just cannot be signed into from another
        // machine yet, and that is the whole point of having made one.
        const pending = !user.email && Boolean(user.new_email);
        return {
          ok: true,
          identity: identityFor(user.id, email, pending),
          ...(pending
            ? {
                note: `Check ${email} and click the link to finish. Until you do, this account only works in this browser.`,
              }
            : {}),
        };
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl("/library") },
      });
      if (error) return fail(error);
      if (!data.user) return { ok: false, reason: "No account came back." };
      return {
        ok: true,
        identity: identityFor(data.user.id, email, !data.session),
        ...(data.session
          ? {}
          : {
              note: `Check ${email} and click the link to finish signing up. You can keep working here meanwhile.`,
            }),
      };
    } catch (error) {
      return fail(error);
    }
  },

  async signIn(email, password) {
    const problem = checkCredentials(email, password);
    if (problem) return { ok: false, reason: problem };
    const client = supabase();
    if (!client) return NO_ACCOUNTS;

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return fail(error);
      if (!data.user) return { ok: false, reason: "No account came back." };
      return { ok: true, identity: identityFor(data.user.id, email) };
    } catch (error) {
      return fail(error);
    }
  },

  async signOut() {
    await supabase()?.auth.signOut();
  },

  async resetPassword(email) {
    if (!emailLooksValid(email))
      return { ok: false, reason: "That doesn't look like an email address." };
    const client = supabase();
    if (!client) return NO_ACCOUNTS;
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: callbackUrl(),
      });
      if (error) return fail(error);
      // Deliberately the same answer whether or not the address has an
      // account. Anything else turns this form into a way of finding out who
      // is registered.
      return {
        ok: true,
        note: `If there's an account for ${email}, a link to set a new password is on its way.`,
      };
    } catch (error) {
      return fail(error);
    }
  },

  async resendConfirmation(email) {
    if (!emailLooksValid(email))
      return { ok: false, reason: "That doesn't look like an email address." };
    const client = supabase();
    if (!client) return NO_ACCOUNTS;
    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl("/library") },
      });
      if (error) return fail(error);
      return { ok: true, note: `Sent again to ${email}.` };
    } catch (error) {
      return fail(error);
    }
  },

  async updatePassword(password) {
    if (password.length < MIN_PASSWORD)
      return { ok: false, reason: `Use at least ${MIN_PASSWORD} characters.` };
    const client = supabase();
    if (!client) return NO_ACCOUNTS;
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) return fail(error);
      return { ok: true, note: "Password changed." };
    } catch (error) {
      return fail(error);
    }
  },

  async currentAccount() {
    const client = supabase();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error) {
      // "No session" is a definite answer and means nobody is signed in.
      // Anything else — the project unreachable, a 500, a paused instance — is
      // not an answer at all, and throwing matters: the caller signs people
      // out on `null`, and doing that because of a network hiccup would be
      // unforgivable.
      if (/session|jwt|not authenticated|missing/i.test(error.message))
        return null;
      throw error;
    }
    const user = data.user;
    if (!user) return null;
    // An address awaiting its confirmation link sits in `new_email`. The
    // account is real and already syncing; only the address is provisional.
    const pending = !user.email && Boolean(user.new_email);
    const address = user.email ?? user.new_email;
    return address ? identityFor(user.id, address, pending) : null;
  },
};

/* ── Selection ──────────────────────────────────────────── */

let override: AuthProvider | null = null;

export function setAuthProvider(provider: AuthProvider | null) {
  override = provider;
}

function pick(): AuthProvider {
  if (override) return override;
  return supabaseAuth.isAvailable() ? supabaseAuth : deviceAuth;
}

export const accountsAvailable = (): boolean => pick().isAvailable();
export const authProviderName = (): string => pick().name;

export const signUp = (email: string, password: string) =>
  pick().signUp(email, password);
export const signIn = (email: string, password: string) =>
  pick().signIn(email, password);
export const signOut = () => pick().signOut();
export const resetPassword = (email: string) => pick().resetPassword(email);
export const resendConfirmation = (email: string) =>
  pick().resendConfirmation(email);
export const updatePassword = (password: string) =>
  pick().updatePassword(password);
export const currentAccount = () => pick().currentAccount();
