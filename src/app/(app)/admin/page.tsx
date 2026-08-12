"use client";

/**
 * The admin console.
 *
 * This page is unusual for this app: it is the one screen that cannot work
 * without a server, and it says so as its first act rather than showing empty
 * tables. Everything else here runs happily in a browser with nothing switched
 * on — but "who did what" kept by the person who did it is not administration,
 * and an audit log that its subject can edit is a diary.
 *
 * So there are exactly two states. With a database: real members, real roles
 * out of the database's own policies, a real log, a retention rule that a
 * scheduled job can enforce. Without one: a paragraph explaining what would be
 * here and what to switch on. There is no third state where it looks
 * administered and isn't.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { useUI } from "@/lib/ui-store";
import { useAuthOptions, useRemoteConfigSettled } from "@/lib/db/use-config";
import { availableProviders } from "@/lib/auth/providers";
import { ROLE_HINTS, ROLE_LABELS } from "@/lib/team/permissions";
import {
  describeAudit,
  fetchAudit,
  fetchMembers,
  myRole,
  previewPurge,
  retentionDays,
  runPurge,
  setRetentionDays,
  type AdminMember,
  type AuditEntry,
  type PurgeCount,
} from "@/lib/admin";
import type { Role } from "@/lib/team/types";

/** Every answer this page is waiting on, so one render decides what to show. */
interface Loaded {
  role: Role | null;
  members: AdminMember[];
  audit: AuditEntry[];
  retention: number | null;
  doomed: PurgeCount | null;
}

export default function AdminPage() {
  const settled = useRemoteConfigSettled();
  const [state, setState] = useState<Loaded | null>(null);
  const [blocked, setBlocked] = useState<{ reason: string; setup?: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const notify = useUI((s) => s.notify);

  const load = useCallback(async () => {
    setBusy(true);
    const [role, members, audit, retention, doomed] = await Promise.all([
      myRole(),
      fetchMembers(),
      fetchAudit(),
      retentionDays(),
      previewPurge(),
    ]);
    setBusy(false);

    // The first refusal wins. Five identical "administration needs a database"
    // panels stacked on top of each other is not five times as informative.
    const refused = [role, members, retention].find((r) => !r.ok);
    if (refused && !refused.ok) {
      setBlocked({ reason: refused.reason, setup: refused.setup });
      setState(null);
      return;
    }
    setBlocked(null);
    setState({
      role: role.ok ? role.value : null,
      members: members.ok ? members.value : [],
      // These two can fail on their own and it is not fatal: a member who is
      // not an admin is *refused* the log by the policy, which is the system
      // working. An empty section beats an error that reads like a fault.
      audit: audit.ok ? audit.value : [],
      retention: retention.ok ? retention.value : null,
      doomed: doomed.ok ? doomed.value : null,
    });
  }, []);

  useEffect(() => {
    if (!settled) return;
    // Off the effect body on purpose: `load` sets state as its first act, and
    // doing that synchronously here is a cascading render the lint rule is
    // right about. A microtask later is the same tick to a person.
    void Promise.resolve().then(load);
  }, [settled, load]);

  const admin = state?.role === "owner" || state?.role === "admin";

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">Administration</span>
        {state?.role && (
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
            You are {ROLE_LABELS[state.role].toLowerCase()}
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-9 sm:px-8">
          <p className="mb-6 max-w-[62ch] text-[12.5px] leading-relaxed text-fg-subtle">
            What this page can see is what reached the server. Work somebody
            keeps in their own browser leaves no trace here, because there is
            nothing to leave one — that is the honest limit of any console like
            this, and it is worth knowing before you rely on it.
          </p>

          {!settled && <Waiting />}

          {settled && blocked && (
            <div
              className={`rounded-md border p-3.5 text-[12.5px] leading-relaxed ${
                blocked.setup
                  ? "border-warn/35 bg-warn/[0.07] text-fg-muted"
                  : "border-danger/35 bg-danger/[0.07] text-danger"
              }`}
            >
              {blocked.reason}
              {blocked.setup && (
                <span className="mt-2 block text-fg-subtle">
                  <Link
                    href="/settings#connection"
                    className="underline decoration-line-strong underline-offset-2 hover:text-fg"
                  >
                    Settings → Connection
                  </Link>{" "}
                  says exactly what is missing, and{" "}
                  <code className="font-mono text-[11.5px]">
                    supabase/schema.sql
                  </code>{" "}
                  is what to run once it is there.
                </span>
              )}
            </div>
          )}

          {settled && state && (
            <>
              <Section
                title="Who is here"
                note="Roles as the database enforces them, not as a screen displays them. Every policy in the schema asks this same table."
              >
                {state.members.length === 0 ? (
                  <Empty>Nobody has joined this workspace yet.</Empty>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {state.members.map((member) => (
                      <li
                        key={member.userId}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2"
                      >
                        <span className="text-[13px] text-fg">
                          {member.displayName ??
                            (member.anonymous ? "Someone without an account" : "Unnamed")}
                        </span>
                        <span className="font-mono text-[10.5px] text-fg-subtle">
                          {member.userId.slice(0, 8)}
                        </span>
                        <span className="ml-auto rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
                          {ROLE_LABELS[member.role] ?? member.role}
                        </span>
                        <span className="w-full text-[11.5px] text-fg-subtle">
                          {ROLE_HINTS[member.role] ?? ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <SignIn />

              <Section
                title="How long things are kept"
                note="Applies to projects already in the bin and to this log. Nothing that is still in use is ever removed by a retention rule — deleting a live document because nobody opened it for ninety days would be a different and much worse feature."
              >
                <Retention
                  days={state.retention}
                  doomed={state.doomed}
                  canEdit={Boolean(admin)}
                  busy={busy}
                  onSave={async (days) => {
                    const result = await setRetentionDays(days);
                    if (!result.ok) {
                      notify(result.reason);
                      return;
                    }
                    notify(
                      days === null
                        ? "Everything is kept from now on"
                        : `Kept for ${days} days`,
                    );
                    await load();
                  }}
                  onPurge={async () => {
                    const result = await runPurge();
                    if (!result.ok) {
                      notify(result.reason);
                      return;
                    }
                    notify(
                      `Removed ${result.value.projects} projects and ${result.value.audit} log entries`,
                    );
                    await load();
                  }}
                />
              </Section>

              <Section
                title="What has been done"
                note="Append-only. There is no policy and no privilege that lets anybody edit or delete an entry through the app — only the retention rule above removes them, and it records itself doing it."
              >
                {state.audit.length === 0 ? (
                  <Empty>
                    {admin
                      ? "Nothing recorded yet. Deleting a project, publishing a template or changing retention writes an entry."
                      : "Only an admin can read the log. That is the policy doing its job rather than a fault."}
                  </Empty>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {state.audit.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                        <span className="font-mono text-[10.5px] text-fg-subtle">
                          {new Date(entry.at).toLocaleString()}
                        </span>
                        <span className="text-[12.5px] text-fg-muted">
                          {describeAudit(entry)}
                        </span>
                        {entry.subject && (
                          <span className="text-[12.5px] text-fg">
                            — {entry.subject}
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                          {entry.actorId?.slice(0, 8) ?? "system"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ── Sign-in ────────────────────────────────────────────── */

/**
 * What this deployment accepts, and how to change it.
 *
 * Read-only on purpose. Single sign-on is configured where the identity lives
 * — in Supabase — and a switch here that appeared to enable Microsoft accounts
 * would be a lie with a checkbox on it.
 */
function SignIn() {
  const options = useAuthOptions();
  const providers = availableProviders();

  return (
    <Section
      title="How people sign in"
      note="Configured in Supabase, declared to the app by environment variables. This page reports what is switched on; it cannot switch anything on, because the identity provider is not ours."
    >
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-baseline gap-2 text-[12.5px]">
          <Icon name="check" size={11} className="text-fg-subtle" />
          <span className="text-fg">Email and password</span>
          <span className="text-fg-subtle">— always available</span>
        </li>
        {providers.map((provider) => (
          <li key={provider.id} className="flex items-baseline gap-2 text-[12.5px]">
            <Icon name="check" size={11} className="text-fg-subtle" />
            <span className="text-fg">{provider.label}</span>
            <span className="font-mono text-[10.5px] text-fg-subtle">
              {provider.id}
            </span>
          </li>
        ))}
        {options.ssoDomains.map((domain) => (
          <li key={domain} className="flex items-baseline gap-2 text-[12.5px]">
            <Icon name="lock" size={11} className="text-fg-subtle" />
            <span className="text-fg">{domain}</span>
            <span className="text-fg-subtle">— single sign-on (SAML)</span>
          </li>
        ))}
      </ul>

      {!providers.length && !options.ssoDomains.length && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-fg-subtle">
          Nothing beyond a password. To add Microsoft or Google accounts: enable
          the provider in Supabase → Authentication → Providers, then set{" "}
          <code className="font-mono text-[11.5px]">AUTH_PROVIDERS=azure,google</code>.
          For SAML, register the connection with the Supabase CLI and set{" "}
          <code className="font-mono text-[11.5px]">AUTH_SSO_DOMAINS=your-domain.com</code>.
          Until then no buttons appear, which is deliberate — a sign-in button
          for a provider nobody enabled is a dead end.
        </p>
      )}
    </Section>
  );
}

/* ── Retention ──────────────────────────────────────────── */

function Retention({
  days,
  doomed,
  canEdit,
  busy,
  onSave,
  onPurge,
}: {
  days: number | null;
  doomed: PurgeCount | null;
  canEdit: boolean;
  busy: boolean;
  onSave: (days: number | null) => void | Promise<void>;
  onPurge: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string>(days === null ? "" : String(days));

  const total = (doomed?.projects ?? 0) + (doomed?.audit ?? 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          Keep for
          <input
            inputMode="numeric"
            value={draft}
            disabled={!canEdit}
            placeholder="everything"
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            aria-label="Days to keep deleted work"
            className="w-[92px] rounded-sm border border-line bg-surface-2 px-2 py-1 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-60"
          />
          days
        </label>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onSave(draft ? Number(draft) : null)}
              className="rounded-sm border border-line px-2.5 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Save
            </button>
            {draft && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  void onSave(null);
                }}
                className="text-[12px] text-fg-subtle underline decoration-line-strong underline-offset-2 hover:text-fg"
              >
                Keep everything instead
              </button>
            )}
          </>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-fg-subtle">
        {days === null
          ? "Nothing is being removed. That is the default, and it stays the default: a column that quietly defaulted to thirty days would delete somebody's work on our schedule rather than theirs."
          : `Deleted projects and log entries older than ${days} days can be removed.`}
      </p>

      {days !== null && doomed && (
        <div className="rounded-sm border border-line bg-surface-2 p-2.5">
          <p className="text-[12.5px] text-fg-muted">
            {total === 0
              ? "Nothing is old enough to remove yet."
              : `${doomed.projects} deleted projects and ${doomed.audit} log entries are past that.`}
          </p>
          {canEdit && total > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPurge()}
              className="mt-2 rounded-sm border border-danger/40 px-2.5 py-1 text-[12px] text-danger transition-colors duration-150 hover:bg-danger/[0.07] disabled:opacity-60"
            >
              Remove them now
            </button>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
            Running it here does it once. To have it happen nightly, schedule{" "}
            <code className="font-mono">purge_expired</code> with pg_cron — the
            exact line is in <code className="font-mono">supabase/schema.sql</code>.
            We do not pretend it is scheduled when it is not.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Furniture ──────────────────────────────────────────── */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="text-[14px] font-medium text-fg">{title}</h2>
      <p className="mt-1 mb-2.5 max-w-[62ch] text-[12px] leading-relaxed text-fg-subtle">
        {note}
      </p>
      <div className="rounded-md border border-line bg-surface p-3.5">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12.5px] leading-relaxed text-fg-subtle">{children}</p>
);

const Waiting = () => (
  <p className="text-[12.5px] text-fg-subtle">Checking what is configured…</p>
);
