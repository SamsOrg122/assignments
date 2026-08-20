/**
 * Signing in, from the window's side.
 *
 * Note what is not here: a token. The session lives in Rust and never crosses
 * the bridge, so nothing in this file — and nothing a bug in this file could
 * reach — can read it. What comes back is only a description of where things
 * stand.
 */
import { invoke } from "@tauri-apps/api/core";

export interface Standing {
  signed_in: boolean;
  email: string | null;
  /** Providers this deployment has actually turned on. */
  providers: string[];
  /** Whether the app has managed to read tougather.com's configuration. */
  configured: boolean;
  /** False on a machine with no keychain to remember a sign-in safely. */
  can_remember: boolean;
  problem: string | null;
}

export const standing = () => invoke<Standing>("auth_standing");
export const beginSignIn = (provider: string) =>
  invoke<void>("auth_begin", { provider });
export const signInWithPassword = (email: string, password: string) =>
  invoke<Standing>("auth_with_password", { email, password });
export const signOut = () => invoke<Standing>("auth_sign_out");

/** What to call a provider on a button. */
export function providerName(id: string): string {
  const known: Record<string, string> = {
    google: "Google",
    github: "GitHub",
    azure: "Microsoft",
    apple: "Apple",
    gitlab: "GitLab",
    slack: "Slack",
    discord: "Discord",
    notion: "Notion",
  };
  return known[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/* ── Which deployment ─────────────────────────────────────────────────── */

export interface SiteAddress {
  address: string;
  /** True when it is the one the app shipped with. */
  default: boolean;
}

export const siteAddress = () => invoke<SiteAddress>("site_address");
export const setSite = (address: string) =>
  invoke<Standing>("site_set", { address });
export const resetSite = () => invoke<Standing>("site_reset");
