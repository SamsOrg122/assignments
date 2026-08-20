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
 * It used to be read-only apart from the anonymous sign-in check, and that
 * was the flaw. `projects.id` was a `uuid` while this app has always written
 * ten-character ids, so every save was refused — and this page reported "the
 * projects table is there and readable" for weeks, which was true and useless.
 * Reading was never the problem.
 *
 * So it writes now. It saves a real document, reads it back, and removes it,
 * because that is the only question anybody actually has: *is my work being
 * saved*. Everything it leaves behind is cleaned up, and if it cannot clean
 * up it says so rather than leaving a stray row nobody can explain.
 */

import { supabase } from "./client";
import { remoteConfig } from "./config";
import { explainAuthError } from "../auth/errors";
import { driftIn, migrationFor, type SchemaReport } from "./expected";
import { projectToRow } from "./supabase";
import { toRemote } from "./index";
import { createProject } from "../factories";

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

  /* 6. Does the deployed schema match the one this code was written against */

  const report = await client.rpc("schema_report");
  if (report.error) {
    // An older deployment simply does not have the function. That is not a
    // failure — it is a missing pair of glasses, and the write test below
    // still answers the real question.
    checks.push({
      label: "Schema drift",
      state: "warn",
      detail: "This database can't be asked what shape it is.",
      fix: "Run supabase/migrations/0004-let-the-app-check-its-own-database.sql to turn this check on.",
    });
  } else {
    const drift = driftIn((report.data ?? {}) as SchemaReport);
    if (drift.length === 0) {
      checks.push(ok("Schema drift", "The database matches what this version of the app expects."));
    } else {
      const first = drift[0]!;
      checks.push({
        label: "Schema drift",
        state: "bad",
        detail:
          `${first.where} is ${first.found}, and this app writes ${first.expected}` +
          (drift.length > 1 ? ` (and ${drift.length - 1} more).` : "."),
        fix:
          migrationFor(first) ??
          "Run everything in supabase/migrations/ that hasn't been run yet, oldest first.",
      });
    }
  }

  /* 7. The only question anybody is really asking */

  if (session) checks.push(await canItActuallySave(client, session.user.id));
  else
    checks.push({
      label: "Saving",
      state: "skipped",
      detail: "No session to save as.",
    });

  return {
    checks,
    healthy: checks.every((check) => check.state === "ok" || check.state === "warn"),
  };
}

/**
 * Save a document, read it back, remove it.
 *
 * Built with the same row builder and the same id generator the app itself
 * uses, on purpose. A check that constructs its own tidy row proves that a
 * tidy row can be written, which is not the thing in doubt — the bug this
 * exists to catch was the app's own ids being the wrong shape.
 */
async function canItActuallySave(
  client: NonNullable<ReturnType<typeof supabase>>,
  userId: string,
): Promise<Check> {
  const workspace = await client
    .from("workspaces")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (workspace.error || !workspace.data) {
    const { message, fix } = explainAuthError(workspace.error?.message ?? "");
    return {
      label: "Saving",
      state: "bad",
      detail: workspace.data
        ? message
        : "This account has no workspace, so a document has nowhere to land.",
      fix: fix ?? "Run supabase/migrations/0002-work-lands-in-the-account.sql.",
    };
  }

  // The app's own factory and the app's own converters, all the way down.
  // A check that builds its own tidy row proves a tidy row can be written,
  // which was never in doubt — the bug this exists to catch was the shape of
  // the ids the app itself makes.
  const project = createProject("doc", "Settings check — safe to delete");
  const id = project.id;
  const row = projectToRow(toRemote(project), workspace.data.id, userId);

  const written = await client.from("projects").insert({
    ...row,
    // Born deleted. The row exists for about a hundred milliseconds, but a
    // sync pull landing inside that window would put "Settings check — safe
    // to delete" in somebody's Library — and it is the app's own sync, so
    // that is not a rare race, it is a scheduled one. A tombstone is ignored
    // by the pull, and every part of the write being tested still happens.
    deleted_at: new Date().toISOString(),
  });
  if (written.error) {
    const { message, fix } = explainAuthError(written.error.message);
    return { label: "Saving", state: "bad", detail: message, fix };
  }

  // Written is not saved. A policy can allow the insert and then hide the row
  // from the account that made it, which looks like success and is not.
  const back = await client.from("projects").select("id").eq("id", id).maybeSingle();
  const readable = !back.error && back.data?.id === id;

  // Hard delete: this row is litter, not a document, so it gets no tombstone.
  const cleared = await client.from("projects").delete().eq("id", id);

  if (!readable)
    return {
      label: "Saving",
      state: "bad",
      detail: "A document can be written but not read back — a policy is hiding your own rows.",
      fix: "Check the projects_member policy in supabase/migrations/0002-work-lands-in-the-account.sql.",
    };

  if (cleared.error)
    return {
      label: "Saving",
      state: "warn",
      detail:
        'Saving works. The test document could not be removed again — look for "Settings check — safe to delete" in your Library.',
    };

  return ok("Saving", "A document was saved to this account, read back, and removed.");
}
