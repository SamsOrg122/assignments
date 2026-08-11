"use client";

/**
 * Why accounts aren't working, answered by asking.
 *
 * Every check here corresponds to one thing somebody has to have done, in the
 * order they have to have done it, and each failure names the page in the
 * Supabase dashboard where it is fixed. This exists because the alternative —
 * a form that submits and quietly does nothing — is how a working app and a
 * misconfigured one look identical from the outside.
 *
 * It is deliberately read-only apart from the anonymous sign-in check, which
 * cannot be answered any other way than by trying. That leaves at most one
 * anonymous user behind per run, which is also what simply opening the app
 * does.
 */

import { supabase } from "./client";
import { remoteConfig } from "./config";
import { explainAuthError } from "../auth/errors";

export type CheckState = "ok" | "bad" | "warn" | "skipped";

export interface Check {
  /** Short label, in the order the steps have to be done. */
  label: string;
  state: CheckState;
  /** What was found. One line, present tense. */
  detail: string;
  /** Where to go and change it. */
  fix?: string;
}

export interface Diagnosis {
  checks: Check[];
  /** True when an account can actually be created and used right now. */
  healthy: boolean;
}

const ok = (label: string, detail: string): Check => ({
  label,
  state: "ok",
  detail,
});

/** Redacted enough to compare against a dashboard without leaking anything. */
const short = (key: string) =>
  key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : "…";

export async function diagnose(): Promise<Diagnosis> {
  const checks: Check[] = [];
  const config = remoteConfig();

  /* 1. Keys */

  if (!config) {
    checks.push({
      label: "Keys",
      state: "bad",
      detail: "No Supabase URL and anonymous key are reaching the app.",
      fix: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your host's environment. They are read per request as well as at build time, so no redeploy is needed.",
    });
    return { checks, healthy: false };
  }

  checks.push(
    ok(
      "Keys",
      `${config.url} · ${short(config.anonKey)} · read ${
        config.from === "build" ? "from the build" : "from the server, per request"
      }`,
    ),
  );

  const client = supabase();
  if (!client) {
    checks.push({
      label: "Client",
      state: "bad",
      detail: "The keys are present but the Supabase client refused to build.",
      fix: "Check the URL is the full https://<project>.supabase.co address.",
    });
    return { checks, healthy: false };
  }

  /* 2. Reachable */

  try {
    const response = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: config.anonKey },
      cache: "no-store",
    });
    if (response.ok) checks.push(ok("Reachable", "The project answered."));
    else if (response.status === 401 || response.status === 403)
      checks.push({
        label: "Reachable",
        state: "bad",
        detail: `The project answered ${response.status} — it rejected the key.`,
        fix: "Copy the anon public key from Project Settings → API. The service role key will not work here, and should never be in a browser.",
      });
    else
      checks.push({
        label: "Reachable",
        state: "warn",
        detail: `The project answered ${response.status}.`,
      });
  } catch {
    checks.push({
      label: "Reachable",
      state: "bad",
      detail: "No answer from that URL.",
      fix: "Check the address, and whether the project is paused — free projects pause after a week without traffic.",
    });
    return { checks, healthy: false };
  }

  /* 3. Schema */

  const table = await client.from("projects").select("id").limit(1);
  if (table.error) {
    const { message, fix } = explainAuthError(table.error.message);
    // "No rows" is not an error, and neither is being refused rows you don't
    // own — both mean the table is there, which is what is being asked.
    checks.push({
      label: "Schema",
      state: "bad",
      detail: message,
      fix: fix ?? "Run supabase/schema.sql in the SQL editor.",
    });
  } else {
    checks.push(ok("Schema", "The projects table is there and readable."));
  }

  /* 4. Anonymous sign-in — what the free plan runs on */

  let session = (await client.auth.getSession()).data.session;
  if (session) {
    checks.push(
      ok(
        "Anonymous sign-in",
        session.user.email
          ? `Signed in as ${session.user.email}.`
          : "On — this browser has an anonymous session.",
      ),
    );
  } else {
    const attempt = await client.auth.signInAnonymously();
    if (attempt.error) {
      const { message, fix } = explainAuthError(attempt.error.message);
      checks.push({
        label: "Anonymous sign-in",
        state: "bad",
        detail: message,
        fix:
          fix ??
          "Turn it on at Authentication → Sign In / Providers → Anonymous Sign-Ins.",
      });
    } else {
      session = attempt.data.session;
      checks.push(ok("Anonymous sign-in", "On — a session was created."));
    }
  }

  /* 5. Writing */

  if (session) {
    const workspace = await client
      .from("workspaces")
      .select("id")
      .eq("owner_id", session.user.id)
      .limit(1)
      .maybeSingle();
    if (workspace.error) {
      const { message, fix } = explainAuthError(workspace.error.message);
      checks.push({ label: "Row level security", state: "bad", detail: message, fix });
    } else {
      checks.push(
        ok(
          "Row level security",
          workspace.data
            ? "This session can read its own workspace."
            : "This session can query its own rows; nothing written yet.",
        ),
      );
    }
  } else {
    checks.push({
      label: "Row level security",
      state: "skipped",
      detail: "No session to test with.",
    });
  }

  return {
    checks,
    healthy: checks.every((check) => check.state === "ok" || check.state === "warn"),
  };
}
