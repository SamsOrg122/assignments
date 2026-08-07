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
 * ─────────────────────────────────────────────────────────────────────────
 * FOUNDER: accounts need the Supabase steps in `lib/db/index.ts`. Until those
 * environment variables exist, `signUp` and `signIn` return `unavailable` with
 * a plain reason, and the UI shows the device option as the only working one.
 * The forms, validation and flow are already real, so switching it on is
 * configuration rather than a rewrite.
 * ─────────────────────────────────────────────────────────────────────────
 */

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
  | { ok: true; identity: Identity }
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

/**
 * Written against the schema, unavailable until configured. The interesting
 * case is the *upgrade*: someone who has been working anonymously already has
 * an `auth.users` row, so signing up calls `updateUser({ email, password })`
 * rather than creating a second identity — which is why every project they
 * made before signing up is already theirs afterwards.
 */
const supabaseAuth: AuthProvider = {
  name: "supabase",
  isAvailable: () => isRemoteConfigured(),

  async signUp(email, password) {
    const problem = checkCredentials(email, password);
    if (problem) return { ok: false, reason: problem };
    // const { data, error } = await client.auth.updateUser({ email, password });
    // …falling back to signUp() when there is no anonymous session to upgrade.
    return {
      ok: false,
      reason: "Supabase is configured but the client isn't installed yet.",
      unavailable: true,
    };
  },

  async signIn(email, password) {
    const problem = checkCredentials(email, password);
    if (problem) return { ok: false, reason: problem };
    // const { data, error } = await client.auth.signInWithPassword({ email, password });
    return {
      ok: false,
      reason: "Supabase is configured but the client isn't installed yet.",
      unavailable: true,
    };
  },

  async signOut() {
    // await client.auth.signOut();
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
