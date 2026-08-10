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
 * Accounts need the Supabase steps in `lib/db/index.ts`. Without those
 * environment variables `signUp` and `signIn` return `unavailable` with a
 * plain reason — a distinct outcome from being rejected — and the UI shows the
 * device option as the only working one.
 */

import { supabase } from "../db/client";
import { isRemoteConfigured } from "../db";

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
}

export type AuthOutcome =
  /**
   * `note` is for the thing that is neither success nor failure: the account
   * exists but the address has to be confirmed by email before it can be
   * signed in with. Saying "Signed in" and leaving them to discover that
   * later is the kind of small lie that costs a user their work.
   */
  | { ok: true; identity: Identity; note?: string }
  /** The flow ran and the backend said no — bad password, taken email. */
  | { ok: false; reason: string }
  /** Accounts aren't switched on. Distinct from a rejection, deliberately. */
  | { ok: false; reason: string; unavailable: true };

export interface AuthProvider {
  readonly name: string;
  /** Whether accounts can be created here at all. */
  isAvailable(): boolean;
  signUp(email: string, password: string): Promise<AuthOutcome>;
  signIn(email: string, password: string): Promise<AuthOutcome>;
  signOut(): Promise<void>;
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

/* ── The device provider ────────────────────────────────── */

const NO_ACCOUNTS =
  "Accounts aren't switched on yet, so there's nowhere to sign in to. " +
  "Your work is safe on this device — Settings has the tools that keep it there.";

const deviceAuth: AuthProvider = {
  name: "device",
  isAvailable: () => false,
  async signUp() {
    return { ok: false, reason: NO_ACCOUNTS, unavailable: true };
  },
  async signIn() {
    return { ok: false, reason: NO_ACCOUNTS, unavailable: true };
  },
  async signOut() {
    // Nothing to sign out of. Not an error — the local identity stays.
  },
};

/* ── The Supabase provider ──────────────────────────────── */

const NOT_CONFIGURED = {
  ok: false as const,
  reason:
    "Accounts need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
    "Your work is safe on this device meanwhile.",
  unavailable: true as const,
};

/** An account identity. The display name is the caller's to keep. */
const identityFor = (id: string, email: string): Identity => {
  const name = email.split("@")[0] ?? "You";
  return { id, name, initials: initialsFor(name), email, kept: "account" };
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
    if (!client) return NOT_CONFIGURED;

    const { data: current } = await client.auth.getSession();
    const anonymous = current.session?.user;

    if (anonymous && !anonymous.email) {
      const { data, error } = await client.auth.updateUser({ email, password });
      if (error) return { ok: false, reason: error.message };
      const user = data.user;
      // With email confirmations on — Supabase's default — the address moves to
      // `new_email` and stays there until the link is clicked. The account is
      // real either way; it just cannot be signed into from another machine
      // yet, and that is the whole point of having made one.
      const pending = !user.email && Boolean(user.new_email);
      return {
        ok: true,
        identity: identityFor(user.id, email),
        ...(pending
          ? {
              note: `Check ${email} and click the link to finish. Until you do, this account only works in this browser.`,
            }
          : {}),
      };
    }

    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { ok: false, reason: error.message };
    if (!data.user) return { ok: false, reason: "No account came back." };
    return {
      ok: true,
      identity: identityFor(data.user.id, email),
      ...(data.session
        ? {}
        : { note: `Check ${email} and click the link to finish signing up.` }),
    };
  },

  async signIn(email, password) {
    const problem = checkCredentials(email, password);
    if (problem) return { ok: false, reason: problem };
    const client = supabase();
    if (!client) return NOT_CONFIGURED;

    // Signing in swaps this browser's identity. Anything made anonymously
    // stays on the server under the anonymous user rather than being deleted,
    // but it will not appear under the account — so this is the path for
    // someone who *has* an account, and `signUp` is the path for someone whose
    // work is here and wants to keep it.
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { ok: false, reason: error.message };
    if (!data.user) return { ok: false, reason: "No account came back." };
    return { ok: true, identity: identityFor(data.user.id, email) };
  },

  async signOut() {
    await supabase()?.auth.signOut();
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
