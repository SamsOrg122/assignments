"use client";

/**
 * Signing in as your organisation.
 *
 * This file is small on purpose, and what it does *not* do is the important
 * part. There is no imitation of single sign-on here: no fake company login
 * screen, no "SSO enabled" toggle that does nothing. An identity provider is
 * somebody else's server, and an app cannot pretend to have one.
 *
 * What it does instead is hand off. Supabase holds the provider configuration;
 * the deployment names which of them are switched on (`AUTH_PROVIDERS`, and
 * `AUTH_SSO_DOMAINS` for SAML); this file turns that list into buttons and
 * sends the browser to the right place. Name nothing and nothing appears —
 * which is why a deployment without SSO shows a plain password form rather
 * than a promise it cannot keep.
 */

import { supabase } from "../db/client";
import { authOptionsFor } from "../db/config";
import { explainAuthErrorLine } from "./errors";
import { callbackUrl } from "./index";

export interface ProviderChoice {
  /** The value Supabase expects, e.g. "azure". */
  id: string;
  /** What the button says. */
  label: string;
}

/** Names people recognise. Anything unlisted is title-cased and offered anyway. */
const LABELS: Record<string, string> = {
  google: "Google",
  azure: "Microsoft",
  github: "GitHub",
  apple: "Apple",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  slack_oidc: "Slack",
  keycloak: "Keycloak",
  workos: "WorkOS",
};

export function availableProviders(): ProviderChoice[] {
  return authOptionsFor().providers.map((id) => ({
    id,
    label: LABELS[id] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
  }));
}

/** Domains with a SAML connection registered in Supabase. */
export const ssoDomains = (): string[] => authOptionsFor().ssoDomains;

/**
 * Whether this address belongs to an organisation that signs in its own way.
 *
 * Matched on the exact domain rather than a suffix: `notacme.com` must not
 * match `acme.com`, and a suffix test is how that happens.
 */
export function ssoDomainFor(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return ssoDomains().includes(domain) ? domain : null;
}

export type Redirected = { ok: true } | { ok: false; reason: string };

/**
 * Leave for the provider.
 *
 * Nothing comes back through this function: the browser navigates away, and
 * `/auth/callback` is where the story continues. A resolved `ok` only means
 * the redirect was accepted.
 */
export async function signInWithProvider(
  id: string,
  next = "/library",
): Promise<Redirected> {
  const client = supabase();
  if (!client)
    return { ok: false, reason: "Accounts aren't switched on here yet." };
  try {
    const { error } = await client.auth.signInWithOAuth({
      // The union of provider names is wider in the SDK than the list we
      // accept; the narrowing happened in `/api/config`.
      provider: id as Parameters<
        typeof client.auth.signInWithOAuth
      >[0]["provider"],
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) return { ok: false, reason: explainAuthErrorLine(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explainAuthErrorLine(error) };
  }
}

/** The SAML path: Supabase resolves the domain to a registered connection. */
export async function signInWithSSO(
  domain: string,
  next = "/library",
): Promise<Redirected> {
  const client = supabase();
  if (!client)
    return { ok: false, reason: "Accounts aren't switched on here yet." };
  try {
    const { data, error } = await client.auth.signInWithSSO({
      domain,
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) return { ok: false, reason: explainAuthErrorLine(error) };
    // Unlike the OAuth call, this one hands back a URL rather than navigating.
    if (data?.url) window.location.assign(data.url);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explainAuthErrorLine(error) };
  }
}
