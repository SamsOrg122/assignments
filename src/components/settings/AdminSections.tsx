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
      <ul className="flex flex-col gap-(--space-2)">
        <li className="flex items-baseline gap-(--space-2) text-body">
          <Icon name="check" size={11} className="text-fg-subtle" />
          <span className="text-fg">Email and password</span>
          <span className="text-fg-subtle">— always available</span>
        </li>
        {providers.map((provider) => (
          <li
            key={provider.id}
            className="flex items-baseline gap-(--space-2) text-body"
          >
            <Icon name="check" size={11} className="text-fg-subtle" />
            <span className="text-fg">{provider.label}</span>
            {/* `google`, `azure` — the literal provider id you would type
                into Supabase, so this one keeps the mono face. */}
            <span className="font-mono text-meta text-fg-subtle">
              {provider.id}
            </span>
          </li>
        ))}
        {options.ssoDomains.map((domain) => (
          <li key={domain} className="flex items-baseline gap-(--space-2) text-body">
            <Icon name="lock" size={11} className="text-fg-subtle" />
            <span className="text-fg">{domain}</span>
            <span className="text-fg-subtle">— single sign-on (SAML)</span>
          </li>
        ))}
      </ul>

      {!providers.length && !options.ssoDomains.length && (
        <p className="max-w-[68ch] text-body text-fg-muted">
          Nothing beyond a password. To add Google or Microsoft accounts,
          enable the provider in Supabase → Authentication → Providers and it
          appears here and on the sign-in screen by itself — there is no
          second variable to remember. For SAML, register the connection with
          the Supabase CLI and set{" "}
          <code className="font-mono text-meta">
            AUTH_SSO_DOMAINS=your-domain.com
          </code>
          . Until then no buttons appear, which is deliberate: a sign-in
          button for a provider nobody enabled is a dead end.
        </p>
      )}
    </Section>
  );
}

/* ── Who is here ────────────────────────────────────────── */

/**
 * What to call somebody in the members list who has not set a name.
 *
 * Three answers, because there are three facts and the row used to print two
 * of them with one word. `anonymous` is null when the profile could not be
 * read at all — the ordinary state of a database that has not had migration
 * 0015 applied by hand yet — and the old `member.anonymous ? … : …` turned
 * that silence into "Someone without an account", which is an accusation
 * this screen has no evidence for. It told a whole real team they were about
 * to evaporate.
 *
 * The third line says what is actually known: their row is there, their
 * profile is not readable from here, and so whether they signed up is not a
 * question this screen can answer.
 */
function unnamedMember(anonymous: boolean | null): string {
  if (anonymous === null) return "Profile couldn't be read";
  return anonymous ? "Someone without an account" : "Unnamed";
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
          <p className="text-body text-fg-subtle">Checking what is configured…</p>
        )}

        {settled && blocked && (
          /* A refusal is not an object, an input or a floating layer, so it
             does not get a border. Which refusal it is stays visible in the
             ink: a setup step reads as ordinary prose, a real failure reads
             in danger. */
          <div
            className={`max-w-[68ch] text-body ${
              blocked.setup ? "text-fg-muted" : "text-danger"
            }`}
          >
            {blocked.reason}
            {blocked.setup && (
              <span className="mt-(--space-2) block text-fg-subtle">
                <Link
                  href="/settings#connection"
                  className="underline decoration-line-strong underline-offset-2 hover:text-fg"
                >
                  Connection
                </Link>{" "}
                above says exactly what is missing, and{" "}
                <code className="font-mono text-meta">supabase/schema.sql</code>{" "}
                is what to run once it is there.
              </span>
            )}
          </div>
        )}

        {settled && state && (
          <div className="flex flex-wrap items-baseline gap-(--space-2) text-body">
            <span className="text-fg-muted">
              {state.members.length === 1
                ? "1 person"
                : `${state.members.length} people`}{" "}
              in this workspace.
            </span>
            {/* Your role is a fact about you, not a badge you earned. */}
            {state.role && (
              <span className="text-meta text-fg-subtle">
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
            hint="Roles as the database enforces them, not as a screen displays them. Every policy in the schema asks this same table. A row that says its profile couldn't be read means just that — the membership is real, the profile behind it isn't readable from here, so whether that person ever signed up is not something this screen knows."
            variant="card"
          >
            {state.members.length === 0 ? (
              <Empty>Nobody has joined this workspace yet.</Empty>
            ) : (
              /*
               * The one rule left on this page, and it is a table head — the
               * single place §4 allows a line, because it separates the
               * header row from the rows rather than claiming a region.
               *
               * The head earns it here and not on the log below because this
               * table has a column nobody can read without being told: an
               * eight-character id is not self-describing, where a date and
               * a sentence are. The rows themselves have no lines at all;
               * they read as a table because the columns align, which is how
               * tables have worked for five hundred years.
               */
              <ul className="flex flex-col">
                <li className="flex flex-wrap items-baseline gap-x-(--space-2) border-b border-line pb-(--space-2) text-meta text-fg-subtle">
                  <span>person</span>
                  <span>id</span>
                  <span className="ml-auto">role</span>
                </li>
                {state.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-baseline gap-x-(--space-2) py-(--space-2)"
                  >
                    <span className="text-body text-fg">
                      {member.displayName ?? unnamedMember(member.anonymous)}
                    </span>
                    <span className="font-mono text-meta text-fg-subtle">
                      {member.userId.slice(0, 8)}
                    </span>
                    <span className="ml-auto text-meta text-fg-muted">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                    <span className="w-full text-meta text-fg-subtle">
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
              <ul className="flex flex-col">
                {state.audit.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-(--space-2) py-(--space-2)"
                  >
                    {/* A timestamp is a fact, not something you paste: sans.
                        The actor id beside it is an id and keeps mono. */}
                    <span className="text-meta text-fg-subtle">
                      {formatDateTime(entry.at)}
                    </span>
                    <span className="text-body text-fg-muted">
                      {describeAudit(entry)}
                    </span>
                    {entry.subject && (
                      <span className="text-body text-fg">— {entry.subject}</span>
                    )}
                    <span className="ml-auto font-mono text-meta text-fg-subtle">
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
    <div className="flex flex-col gap-(--space-3)">
      <div className="flex flex-wrap items-center gap-(--space-3)">
        <label className="flex items-center gap-(--space-2) text-body text-fg-muted">
          Keep for
          {/* The field keeps its border. It is the shape your text goes
              inside, and it is one of the two things left on this page that
              a border is honestly for. */}
          <input
            inputMode="numeric"
            value={draft}
            disabled={!canEdit}
            placeholder="everything"
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            aria-label="Days to keep deleted work"
            className="w-[92px] rounded-sm border border-line bg-surface-2 px-2 py-1 text-body text-fg outline-none focus:border-accent disabled:opacity-60"
          />
          days
        </label>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onSave(draft ? Number(draft) : null)}
              className="rounded-sm bg-surface-2 px-2.5 py-1 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
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
                className="text-body text-fg-subtle underline decoration-line-strong underline-offset-2 hover:text-fg"
              >
                Keep everything instead
              </button>
            )}
          </>
        )}
      </div>

      <p className="max-w-[68ch] text-body text-fg-muted">
        {days === null
          ? "Nothing is being removed. That is the default, and it stays the default: a column that quietly defaulted to thirty days would delete somebody's work on our schedule rather than theirs."
          : `Deleted projects and log entries older than ${days} days can be removed.`}
      </p>

      {days !== null && doomed && (
        <div>
          <p className="max-w-[68ch] text-body text-fg-muted">
            {total === 0
              ? "Nothing is old enough to remove yet."
              : `${doomed.projects} deleted projects and ${doomed.audit} log entries are past that.`}
          </p>
          {canEdit && total > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPurge()}
              className="mt-(--space-2) rounded-sm bg-surface-2 px-2.5 py-1 text-body font-medium text-danger transition-colors duration-150 hover:bg-surface-3 disabled:opacity-60"
            >
              Remove them now
            </button>
          )}
          <p className="mt-(--space-2) max-w-[68ch] text-body text-fg-subtle">
            Running it here does it once. To have it happen nightly, schedule{" "}
            <code className="font-mono text-meta">purge_expired</code> with
            pg_cron — the exact line is in{" "}
            <code className="font-mono text-meta">supabase/schema.sql</code>. We
            do not pretend it is scheduled when it is not.
          </p>
        </div>
      )}
    </div>
  );
}
