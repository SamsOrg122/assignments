"use client";

/**
 * Administration, as sections rather than as a page.
 *
 * It was its own console at `/admin`, which put a permanent item in the
 * sidebar for a screen most people open once. The reasoning that kept it
 * out of the nav when there was no database — *"a console that says
 * 'administration needs a database' every time you click it is a permanent
 * piece of furniture teaching people to ignore it"* — applies just as well
 * to the item itself, so the whole thing moved in here.
 *
 * The one line that is not a move: the page used to gate *everything* on
 * having a database, including "How people sign in", which needs no
 * database at all — it reads what the deployment has switched on. That one
 * is hoisted out and always renders.
 *
 * Nothing here is read-write theatre. Roles come out of the database's own
 * policies, the log is append-only with no privilege that edits it, and the
 * retention rule says plainly whether it is scheduled or not.
 */

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Empty, Section } from "./Section";
import { useUI } from "@/lib/ui-store";
import { useAuthOptions } from "@/lib/db/use-config";
import { availableProviders } from "@/lib/auth/providers";
import { ROLE_HINTS, ROLE_LABELS } from "@/lib/team/permissions";
import {
  describeAudit,
  runPurge,
  setRetentionDays,
  type PurgeCount,
} from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import type { AdminData } from "./useAdminData";

/* ── How people sign in ─────────────────────────────────── */

/**
 * What this deployment accepts.
 *
 * Read-only on purpose. Single sign-on is configured where the identity
 * lives — in Supabase — and a switch here that appeared to enable Microsoft
 * accounts would be a lie with a checkbox on it. What changed is that the
 * app now *asks* the project which providers are on rather than waiting to
 * be told by a second environment variable, so this reports the truth
 * instead of a declaration.
 */
export function SignInMethods() {
  const options = useAuthOptions();
  const providers = availableProviders();

  return (
    <Section
      id="signin-methods"
      title="How people sign in"
      hint="Configured in Supabase and read back from the project itself. This reports what is switched on; it cannot switch anything on, because the identity provider is not ours."
      variant="card"
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
          Nothing beyond a password. To add Google or Microsoft accounts,
          enable the provider in Supabase → Authentication → Providers and it
          appears here and on the sign-in screen by itself — there is no
          second variable to remember. For SAML, register the connection with
          the Supabase CLI and set{" "}
          <code className="font-mono text-[11.5px]">
            AUTH_SSO_DOMAINS=your-domain.com
          </code>
          . Until then no buttons appear, which is deliberate: a sign-in
          button for a provider nobody enabled is a dead end.
        </p>
      )}
    </Section>
  );
}

/* ── The gated group ────────────────────────────────────── */

/**
 * Everything that genuinely needs the database, and the one refusal that
 * stands in for all of them when it is not there.
 */
export function Administration({ data }: { data: AdminData }) {
  const { settled, state, blocked, busy, reload } = data;
  const notify = useUI((s) => s.notify);
  const admin = state?.role === "owner" || state?.role === "admin";

  return (
    <>
      <Section
        id="administration"
        title="Administration"
        hint="What this can see is what reached the server. Work somebody keeps in their own browser leaves no trace here, because there is nothing to leave one — the honest limit of any console like this, and worth knowing before you rely on it."
        variant="card"
      >
        {!settled && (
          <p className="text-[12.5px] text-fg-subtle">Checking what is configured…</p>
        )}

        {settled && blocked && (
          <div
            className={`rounded-sm border p-3 text-[12.5px] leading-relaxed ${
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
                  Connection
                </Link>{" "}
                above says exactly what is missing, and{" "}
                <code className="font-mono text-[11.5px]">supabase/schema.sql</code>{" "}
                is what to run once it is there.
              </span>
            )}
          </div>
        )}

        {settled && state && (
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <span className="text-fg-muted">
              {state.members.length === 1
                ? "1 person"
                : `${state.members.length} people`}{" "}
              in this workspace.
            </span>
            {state.role && (
              <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
                You are {ROLE_LABELS[state.role].toLowerCase()}
              </span>
            )}
          </div>
        )}
      </Section>

      {settled && state && (
        <>
          <Section
            id="members"
            title="Who is here"
            hint="Roles as the database enforces them, not as a screen displays them. Every policy in the schema asks this same table."
            variant="card"
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

          <Section
            id="retention"
            title="How long things are kept"
            hint="Applies to projects already in the bin and to the log below. Nothing still in use is ever removed by a retention rule — deleting a live document because nobody opened it for ninety days would be a different and much worse feature."
            variant="card"
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
                await reload();
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
                await reload();
              }}
            />
          </Section>

          <Section
            id="audit"
            title="What has been done"
            hint="Append-only. No policy and no privilege lets anybody edit or delete an entry through the app — only the retention rule above removes them, and it records itself doing it."
            variant="card"
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
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-2 py-2"
                  >
                    <span className="font-mono text-[10.5px] text-fg-subtle">
                      {formatDateTime(entry.at)}
                    </span>
                    <span className="text-[12.5px] text-fg-muted">
                      {describeAudit(entry)}
                    </span>
                    {entry.subject && (
                      <span className="text-[12.5px] text-fg">— {entry.subject}</span>
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
    </>
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
