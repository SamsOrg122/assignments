"use client";

/**
 * The Team page.
 *
 * Four things in one place because they're the same idea: who is here, what
 * they may do, what the group knows, and what it has read. The last two are
 * what the assistant is handed — so the page doubles as "what the AI knows
 * about us", which is the only honest way to present a memory.
 *
 * Who is here, and how somebody else gets here, now come from the database.
 * They used to come from this browser's own store: three invented colleagues,
 * an "Invite" button that wrote an email address into local storage, and a
 * "Mark joined" button whose own tooltip admitted it was pretending somebody
 * had followed a link. Everything a member list is for — knowing who can read
 * your work, letting somebody in, shutting the door again — was theatre.
 *
 * So the top half is real: `listMembers` for the rows, `createInvite` and
 * `revokeInvite` for the links, and the account rule asked *before* any of it
 * is drawn. The bottom half — what the team knows, and the files — is
 * deliberately still the local store: those are this browser's context for the
 * assistant, they work with no database at all, and there is no table for them
 * yet. Moving them would be a different change.
 *
 * There is no email field on the invite form. An invite here is an open link:
 * whoever holds it and is signed in with a real account can use it. What
 * closes it is the expiry and the Revoke button, both of which genuinely work,
 * rather than an address that a forward into a group chat makes meaningless.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  KNOWLEDGE_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  can,
  useCan,
  useTeam,
  useTeamHydrated,
  type KnowledgeKind,
  type Role,
} from "@/lib/team";
import {
  INVITE_ROLES,
  MAX_DAYS,
  createInvite,
  explainAccount,
  listMembers,
  revokeInvite,
  useAccountState,
  useInvites,
  type AccountState,
  type Outcome,
  type TeamInvite,
  type TeamMember,
} from "@/lib/team/invites";
import { ingestFile } from "@/lib/files/ingest";
import { LOCAL_USER } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/store";
import { useUI } from "@/lib/ui-store";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";

export default function TeamPage() {
  useTeamHydrated();
  const workspace = useTeam((s) => s.workspace);
  const knowledge = useTeam((s) => s.knowledge);
  const files = useTeam((s) => s.files);
  const canEditWorkspace = useCan("manageWorkspace");
  const openAI = useUI((s) => s.openAI);

  const account = useAccountState();
  const members = useMembers(account.ready);

  /*
   * What the database says you are — as three answers, not two.
   *
   * A bare `role ?? null` cannot tell "still reading" from "asked, and you
   * have no membership row", and the invite controls have to treat those
   * differently. The first is every single page load, because this read and
   * the invites read run in parallel, so a null-means-maybe rule hands the
   * whole form and a Revoke button to everybody for as long as the round trip
   * takes — and for good, if it fails.
   */
  const roleRead: RoleRead =
    members.outcome === null
      ? { state: "reading" }
      : !members.outcome.ok
        ? { state: "unreadable" }
        : {
            state: "known",
            role: members.outcome.value.find((m) => m.isMe)?.role ?? null,
          };
  const myRole = roleRead.state === "known" ? roleRead.role : null;

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() =>
              openAI({
                projectId: "",
                blockId: "",
                blockType: "text",
                selectionText: "",
                anchor: { x: window.innerWidth / 2, y: 130 },
                seedPrompt: "Catch me up on this team",
              })
            }
            className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="sparkle" size={11} />
            Ask about the team
          </button>
        }
      >
        <span className="text-[13px] font-medium text-fg">Team</span>
        {myRole && (
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
            You are {(ROLE_LABELS[myRole] ?? myRole).toLowerCase()}
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-9 sm:px-8">
          <WorkspaceSection editable={canEditWorkspace} />

          {/*
            Members and invites both need an account, so when there isn't one
            they collapse into a single panel that says which of the three
            reasons it is. One panel rather than the same sentence printed
            twice — and it keeps `id="join"`, because the chat rail and the
            library page send people to /team#join and the answer they need on
            arrival is exactly this one. (/more and the command palette link
            to plain /team and land at the top; the anchor is for those two.)
          */}
          {account.ready ? (
            <>
              <MembersSection read={members} />
              <InvitesSection role={roleRead} />
            </>
          ) : (
            <NoAccountSection settled={account.settled} state={account.state} />
          )}

          <KnowledgeSection count={knowledge.length} />
          <FilesSection count={files.length} />

          <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
            What the team knows and the files above are handed to the assistant
            as context. It answers from that record, so anything wrong here
            shows up in its answers — which is why nothing it infers is stored
            until someone confirms it.
            {/* Only where there is a member list to compare it against, and
                noise on a deployment with no database at all. The member half
                and the two halves above now come from different places, which
                is the thing worth saying where they sit on one screen. */}
            {account.ready && (
              <>
                {" "}
                Who is here goes with them, from the database rather than
                from this browser&apos;s own copy of it. It is read once when
                the app loads, so somebody who joins while this tab is open is
                in an answer after a reload. What the team knows and the files
                stay in this browser.
              </>
            )}
          </p>
          <span className="hidden">{workspace.id}</span>
        </div>
      </main>
    </>
  );
}

/* ── Reading the membership ─────────────────────────────── */

interface MembersRead {
  outcome: Outcome<TeamMember[]> | null;
  busy: boolean;
  reload: () => Promise<void>;
}

/**
 * Your own role, taken out of the member list for the invite controls.
 *
 * `known` with a null role is a real answer: a workspace made before the
 * trigger that adds its owner has a membership row for nobody, and its owner
 * can still invite. `reading` and `unreadable` are not answers, and nothing
 * that acts on the workspace may be drawn on either of them.
 */
type RoleRead =
  | { state: "reading" }
  | { state: "unreadable" }
  | { state: "known"; role: Role | null };

/**
 * `listMembers` for a component, in the same shape `useInvites` has so the two
 * halves of this page behave identically: nothing known, then an outcome.
 *
 * `enabled` is the account rule. A browser with no database, no session, or an
 * anonymous one has nothing to ask about, and asking anyway would put a
 * refusal in the network log every time this page loads.
 */
function useMembers(enabled: boolean): MembersRead {
  const [outcome, setOutcome] = useState<Outcome<TeamMember[]> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    const answer = await listMembers();
    setOutcome(answer);
    setBusy(false);
  }, []);

  // Who is signed in is the trigger, never the answer: somebody can sign out
  // in Settings and come back to this tab, and the list has to follow.
  const who = useAuth((s) => s.identity.id);

  useEffect(() => {
    if (!enabled) return;
    // Off the effect body — a synchronous setState here is the cascading
    // render the lint rule is about.
    void Promise.resolve().then(reload);
  }, [enabled, reload, who]);

  return { outcome, busy, reload };
}

/* ── No account ─────────────────────────────────────────── */

/** Where each of the three answers sends somebody, and what to call it. */
const DOOR: Record<
  Exclude<AccountState, "real">,
  { title: string; href: string; label: string }
> = {
  "no-database": {
    title: "No team to show",
    href: "/settings#connection",
    label: "What is missing",
  },
  "signed-out": {
    title: "Not signed in",
    href: "/signin",
    label: "Sign in",
  },
  anonymous: {
    title: "Signed in without an account",
    href: "/settings#account",
    label: "Add an email",
  },
};

function NoAccountSection({
  settled,
  state,
}: {
  settled: boolean;
  state: AccountState | null;
}) {
  // The sentence is taken here, where `state` is still narrowed, rather than
  // in the branch below — `door` being non-null tells TypeScript nothing about
  // `state`.
  const door =
    state && state !== "real"
      ? { ...DOOR[state], sentence: explainAccount(state) }
      : null;

  return (
    <Section
      id="join"
      title="Members and invites"
      hint="Both are rows in the account database, so both need an account behind them."
    >
      {!settled || !door ? (
        <Checking>Checking what is configured…</Checking>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="rounded-md border border-line bg-surface p-3.5">
            <p className="flex items-center gap-2 text-[13px] text-fg">
              <span className="size-1.5 rounded-full bg-fg-subtle" />
              {door.title}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
              {/* The sentence the library writes, not a second one written
                  here: the account rule is enforced inside the database, and
                  two places explaining it drift apart within a release. */}
              {door.sentence}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-subtle">
              Nothing below is affected. What the team knows and the files are
              kept in this browser and work either way.
            </p>
          </div>
          <Link
            href={door.href}
            className="flex w-fit items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {door.label}
            <Icon name="arrow-right" size={12} />
          </Link>
        </div>
      )}
    </Section>
  );
}

/* ── Workspace ──────────────────────────────────────────── */

/**
 * These five fields are this browser's, on purpose: they are what the
 * assistant should assume about where you are, they are useful with no
 * database at all, and no table holds them. They are not the workspace's name
 * in the database, which is why nothing here claims to rename anything for
 * anybody else.
 */
function WorkspaceSection({ editable }: { editable: boolean }) {
  const workspace = useTeam((s) => s.workspace);
  const renameWorkspace = useTeam((s) => s.renameWorkspace);
  const setContext = useTeam((s) => s.setContext);

  return (
    <Section
      title="Workspace"
      hint="What every answer should assume about where you are. Kept in this browser."
    >
      <Field
        label="Name"
        value={workspace.name}
        editable={editable}
        onChange={renameWorkspace}
      />
      <Field
        label="Organisation"
        placeholder="University, school or company"
        value={workspace.context?.organisation ?? ""}
        editable={editable}
        onChange={(organisation) => setContext({ organisation })}
      />
      <Field
        label="Department"
        placeholder="Programme, faculty or team"
        value={workspace.context?.unit ?? ""}
        editable={editable}
        onChange={(unit) => setContext({ unit })}
      />
      <Field
        label="Subject"
        placeholder="Course, project or remit"
        value={workspace.context?.subject ?? ""}
        editable={editable}
        onChange={(subject) => setContext({ subject })}
      />
      <Field
        label="Notes"
        placeholder="Anything else worth knowing"
        value={workspace.context?.notes ?? ""}
        editable={editable}
        multiline
        onChange={(notes) => setContext({ notes })}
      />
    </Section>
  );
}

/* ── Members ────────────────────────────────────────────── */

/**
 * Two letters for the circle, or none.
 *
 * Nothing is invented from a user id: a person with no display name gets a
 * plain glyph rather than initials taken from a uuid, which would read as a
 * name they never chose.
 */
function initials(name: string | null): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

function MembersSection({ read }: { read: MembersRead }) {
  const { outcome, busy, reload } = read;
  const rows = outcome?.ok ? outcome.value : null;

  return (
    <Section
      title="Members"
      hint={
        rows
          ? `${rows.length === 1 ? "1 person" : `${formatNumber(rows.length)} people`} in this workspace.`
          : "Who is in this workspace, as the database has it."
      }
    >
      <p className="mb-1 text-[12px] leading-relaxed text-fg-subtle">
        Every row here is a real membership, and the role beside it is the one
        the database enforces — every policy in the schema asks this same table.
        Nothing on this page changes a role;{" "}
        <Link
          href="/admin"
          className="underline decoration-line-strong underline-offset-2 hover:text-fg"
        >
          Administration
        </Link>{" "}
        is where these rows are read alongside the log.
      </p>

      {!outcome && <Checking>Reading who is here…</Checking>}

      {outcome && !outcome.ok && (
        <Trouble
          what="The member list couldn't be read."
          reason={outcome.reason}
          busy={busy}
          onRetry={() => void reload()}
        />
      )}

      {rows && rows.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          Nobody is listed in this workspace — not even you. That means the
          membership row is missing rather than that the workspace is empty, so
          an invite made here still lands somewhere real.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((m) => {
            const mark = initials(m.displayName);
            return (
              <li
                key={m.userId}
                data-member={m.userId}
                className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-mono text-[10px] font-medium text-fg-muted"
                  aria-hidden="true"
                >
                  {mark || <Icon name="users" size={12} />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
                    {m.displayName ?? (
                      <span className="text-fg-muted">no name yet</span>
                    )}
                    {m.isMe && (
                      <span className="text-[11px] text-fg-subtle">you</span>
                    )}
                  </p>
                  {/* Three states, three lines. `anonymous` is nullable, and
                      null is "the profile could not be read" — the ordinary
                      state of a database that has not had 0015's profiles
                      policy applied, since every migration here is run by
                      hand. Printing the warning for it told a whole real team
                      they were about to evaporate. `false` says nothing at
                      all: having an account is the normal case, and a badge
                      on every row for it is noise. */}
                  <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                    Joined {formatDate(m.joinedAt)}
                    {m.anonymous === true &&
                      " · no account, so this place disappears when their browser is cleared"}
                    {m.anonymous === null &&
                      " · their profile couldn't be read, so whether they have an account is unknown"}
                  </p>
                </div>

                {/* The role text is whatever the column holds. A value outside
                    the five we know about is shown as it stands rather than as
                    blank — a role nobody recognises is worth seeing. */}
                <span
                  title={ROLE_HINTS[m.role] ?? ""}
                  className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted"
                >
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ── Invites ────────────────────────────────────────────── */


/**
 * How long a link may live. `MAX_DAYS` is the library's cap, not a guess —
 * which is why it is deduped and filtered rather than written out: lowering
 * the cap to 30 would otherwise render two options keyed the same, and
 * lowering it to 14 would offer 30 days on a link the library refuses.
 */
const LIFETIMES = [
  ...new Set([1, 7, 30, MAX_DAYS].filter((d) => d <= MAX_DAYS)),
].sort((a, b) => a - b);

const lifetimeLabel = (days: number): string =>
  days === 1 ? "1 day" : `${days} days`;

const usesLine = (invite: TeamInvite): string => {
  if (invite.maxUses !== null)
    return `used ${formatNumber(invite.uses)} of ${formatNumber(invite.maxUses)} times`;
  if (invite.uses === 0) return "never used";
  return invite.uses === 1 ? "used once" : `used ${formatNumber(invite.uses)} times`;
};

const lifeLine = (invite: TeamInvite): string => {
  if (invite.status === "revoked")
    return invite.revokedAt === null
      ? "revoked"
      : `revoked ${formatDate(invite.revokedAt)}`;
  if (invite.status === "expired") return `expired ${formatDate(invite.expiresAt)}`;
  if (invite.status === "used-up") return "no uses left";
  return `expires ${formatDate(invite.expiresAt)}`;
};

function InvitesSection({ role: mine }: { role: RoleRead }) {
  const { settled, outcome, busy, reload } = useInvites();
  const notify = useUI((s) => s.notify);

  const [role, setRole] = useState<Role>("editor");
  const [days, setDays] = useState(7);
  const [minting, setMinting] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justRevoked, setJustRevoked] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  /*
   * Only once the database has actually answered. A null role inside a
   * `known` answer still means "you have no membership row", which is not
   * "you may not" — a workspace made before the trigger that adds its owner
   * has a row for nobody, and its owner can still invite; `createInvite` asks
   * that of the workspace itself and refuses in a sentence. What is not
   * allowed is guessing during the read, which used to be the common case.
   */
  const canInvite =
    mine.state === "known" &&
    (mine.role === null || can(mine.role, "manageMembers"));

  /*
   * Proof that a revocation landed, read off the reloaded list rather than
   * off the call: `revokeInvite` sends an update with no `.select()`, and an
   * RLS `using` clause that hides the row answers that with success and zero
   * rows changed. Derived in render, not in an effect, because the answer
   * only exists once the reload after the press has come back.
   */
  const stillLive =
    justRevoked !== null &&
    outcome?.ok === true &&
    outcome.value.some((i) => i.id === justRevoked && i.status === "live");

  const create = async () => {
    setMinting(true);
    setRefusal(null);
    const made = await createInvite(role, days);
    setMinting(false);
    if (!made.ok) {
      setRefusal(made.reason);
      return;
    }
    setFresh(made.value);
    setCopied(false);
    await reload();
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
    } catch {
      // The clipboard is refused on an insecure origin and inside some
      // embedded browsers. Selecting the text is a copy somebody can finish
      // themselves, which beats a button that silently does nothing. No key
      // is named: this fires wherever the refusal happens, which is every
      // platform, and ⌘C is wrong on most of them.
      linkRef.current?.select();
      notify("This browser wouldn't copy. The link is selected — copy it yourself.");
      return;
    }
    setCopied(true);
    notify("Invite link copied");
    window.setTimeout(() => setCopied(false), 1600);
  };

  const revoke = async (invite: TeamInvite) => {
    setJustRevoked(null);
    const done = await revokeInvite(invite.id);
    if (!done.ok) {
      notify(done.reason);
      return;
    }
    /*
     * The link in the box above cannot be matched to a row — only its
     * fingerprint was stored and minting hands back a URL, not an id — so
     * after any revocation there is no way to prove the one on screen still
     * works. It goes. Offering a Copy button for a link that may already be
     * dead is the exact failure this rewrite exists to remove; making another
     * is one press away.
     */
    setFresh(null);
    /*
     * No "Link revoked" here. All that is known at this point is that the
     * request was accepted — see `stillLive`, which is what actually says
     * whether the door shut. The row below turning into "revoked" is the
     * confirmation, and it is the one that cannot be wrong.
     */
    setJustRevoked(invite.id);
    await reload();
  };

  if (mine.state === "reading")
    return (
      <Section
        id="join"
        title="Invites"
        hint="Who may hand out a link is the database's answer, and it hasn't come back yet."
      >
        <Checking>Checking what you may do…</Checking>
      </Section>
    );

  if (mine.state === "unreadable")
    return (
      <Section
        id="join"
        title="Invites"
        hint="Who may hand out a link is the database's answer, and this time it didn't come."
      >
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          Your membership row couldn&apos;t be read, so nothing here is
          offered. Both handing out a link and revoking one are the database&apos;s
          decision, and a Revoke button that turns out to change nothing is
          worse than no button at all. &quot;Ask again&quot; under Members
          retries the same read.
        </p>
      </Section>
    );

  if (!canInvite)
    return (
      <Section
        id="join"
        title="Invites"
        hint="Only owners and admins can hand out a link to this workspace."
      >
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          Ask one of them for one. A link works for whoever holds it, so they
          can send you the same one they sent everybody else.
        </p>
      </Section>
    );

  return (
    /* `id="join"` because the chat rail and the library page point at
       /team#join, and this is the section that answers them. /more and the
       command palette link to plain /team, which lands at the top of the
       page — the anchor exists for those two callers. */
    <Section
      id="join"
      title="Invites"
      hint="An open link. Whoever holds it and is signed in with an account joins with the role you pick — which is the point: it survives being forwarded into a group chat. The expiry and Revoke are what close it again."
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          aria-label="Role the link gives"
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-sm border border-line bg-surface px-2 py-1.5 text-[12px] text-fg-muted outline-none focus:border-accent"
        >
          {/* From INVITE_ROLES, which mirrors the check constraint on the
              column. A link can never carry `owner`. */}
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r} className="bg-surface">
              {ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </select>
        <select
          value={days}
          aria-label="How long the link lives"
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-sm border border-line bg-surface px-2 py-1.5 text-[12px] text-fg-muted outline-none focus:border-accent"
        >
          {LIFETIMES.map((d) => (
            <option key={d} value={d} className="bg-surface">
              {lifetimeLabel(d)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void create()}
          disabled={minting}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-[12.5px] font-medium transition-[filter] duration-150",
            minting
              ? "border border-line text-fg-subtle"
              : "bg-accent text-on-accent hover:brightness-110",
          )}
        >
          {minting ? "Making…" : "Create a link"}
        </button>
      </div>

      <p className="text-[11.5px] text-fg-subtle">{ROLE_HINTS[role] ?? ""}</p>

      {refusal && (
        <p className="text-[12.5px] leading-relaxed text-warn">{refusal}</p>
      )}

      {fresh && (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={linkRef}
              value={fresh}
              readOnly
              aria-label="The invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px] text-fg outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {/* The token is in the path now, so this is a key, not an address:
              worth saying beside the box rather than only in the section hint
              above it, which is scrolled away by the time a link is minted. */}
          <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
            This is the only time this link can be shown. Only a fingerprint of
            it is stored, so nobody — including whoever runs the database — can
            read it back out. It works for whoever holds it, which is what the
            expiry and Revoke below are for. Lose it and make another.
          </p>
        </div>
      )}

      {stillLive && (
        <p className="text-[12.5px] leading-relaxed text-warn">
          That link is still live. The revocation was accepted and then changed
          nothing, which is what happens when the row isn&apos;t yours to
          change — ask an owner or an admin, and treat the link as working
          until the row below says otherwise.
        </p>
      )}

      {!settled || !outcome ? (
        <Checking>Reading the links…</Checking>
      ) : !outcome.ok ? (
        <Trouble
          what="The links couldn't be read."
          reason={outcome.reason}
          busy={busy}
          onRetry={() => void reload()}
        />
      ) : outcome.value.length === 0 ? (
        <p className="text-[12.5px] text-fg-muted">
          No links have been made for this workspace.
        </p>
      ) : (
        <ul className="flex flex-col">
          {outcome.value.map((i) => (
            <li
              key={i.id}
              data-invite={i.id}
              className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border",
                  i.status === "live"
                    ? "border-line-strong text-fg-muted"
                    : "border-dashed border-line text-fg-subtle",
                )}
                aria-hidden="true"
              >
                <Icon name={i.status === "live" ? "link" : "lock"} size={12} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-fg">
                  {ROLE_LABELS[i.role] ?? i.role} link
                </span>
                <span className="block text-[11px] text-fg-subtle">
                  Made {formatDate(i.createdAt)} · {lifeLine(i)} ·{" "}
                  {usesLine(i)}
                </span>
              </span>

              {i.status === "live" ? (
                <button
                  type="button"
                  onClick={() => void revoke(i)}
                  aria-label={`Revoke the ${(ROLE_LABELS[i.role] ?? i.role).toLowerCase()} link made ${formatDate(i.createdAt)}`}
                  className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  Revoke
                </button>
              ) : (
                <span className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-subtle">
                  {i.status === "used-up" ? "used up" : i.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] leading-relaxed text-fg-subtle">
        Every link ever made is listed, dead ones included — who was handed a
        way in, and whether anyone used it, is as much the question as who can
        still get in. None of them can be shown again.
      </p>
    </Section>
  );
}

/* ── Knowledge ──────────────────────────────────────────── */

const KINDS = Object.keys(KNOWLEDGE_LABELS) as KnowledgeKind[];

function KnowledgeSection({ count }: { count: number }) {
  const knowledge = useTeam((s) => s.knowledge);
  const remember = useTeam((s) => s.remember);
  const confirmKnowledge = useTeam((s) => s.confirmKnowledge);
  const forget = useTeam((s) => s.forget);
  const canEdit = useCan("edit");
  const notify = useUI((s) => s.notify);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<KnowledgeKind>("fact");

  const unconfirmed = useMemo(
    () => knowledge.filter((k) => !k.confirmed),
    [knowledge],
  );

  const add = () => {
    if (!subject.trim() || !body.trim()) return;
    remember({
      kind,
      subject: subject.trim(),
      body: body.trim(),
      source: "manual",
      confirmed: true,
      addedBy: LOCAL_USER.id,
    });
    setSubject("");
    setBody("");
    notify("Added to what the team knows");
  };

  return (
    <Section
      title="What the team knows"
      hint={`${count} entr${count === 1 ? "y" : "ies"}${unconfirmed.length ? ` · ${unconfirmed.length} waiting to be confirmed` : ""}. Kept in this browser.`}
    >
      {canEdit && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2.5">
          <div className="flex flex-wrap gap-2">
            <input
              value={subject}
              placeholder="What it's about"
              aria-label="Subject"
              onChange={(e) => setSubject(e.target.value)}
              className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
            />
            <select
              value={kind}
              aria-label="Kind"
              onChange={(e) => setKind(e.target.value as KnowledgeKind)}
              className="rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg-muted outline-none focus:border-accent"
            >
              {KINDS.map((k) => (
                <option key={k} value={k} className="bg-surface-2">
                  {KNOWLEDGE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={body}
            rows={2}
            placeholder="The thing itself — a convention, a deadline, who decides what"
            aria-label="Detail"
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-none rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={!subject.trim() || !body.trim()}
            className={cn(
              "self-start rounded-sm px-2.5 py-1 text-[12px] font-medium transition-[filter] duration-150",
              subject.trim() && body.trim()
                ? "bg-accent text-on-accent hover:brightness-110"
                : "border border-line text-fg-subtle",
            )}
          >
            Remember this
          </button>
        </div>
      )}

      <ul className="flex flex-col">
        {knowledge.map((k) => (
          <li
            key={k.id}
            data-knowledge={k.id}
            className="group/k flex items-start gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <span className="mt-0.5 shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle">
              {KNOWLEDGE_LABELS[k.kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-fg">
                {k.subject}
              </span>
              <span className="block text-[12.5px] leading-relaxed text-fg-muted">
                {k.body}
              </span>
              {!k.confirmed && (
                <span className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] text-warn">
                    Learned from {k.source} — not confirmed
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => confirmKnowledge(k.id)}
                      className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:text-fg"
                    >
                      Confirm
                    </button>
                  )}
                </span>
              )}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => forget(k.id)}
                aria-label={`Forget ${k.subject}`}
                className="shrink-0 rounded-xs p-1 text-fg-subtle opacity-0 transition-opacity group-hover/k:opacity-100 focus-visible:opacity-100 hover:text-danger"
              >
                <Icon name="trash" size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Files ──────────────────────────────────────────────── */

function FilesSection({ count }: { count: number }) {
  const files = useTeam((s) => s.files);
  const addFile = useTeam((s) => s.addFile);
  const removeFile = useTeam((s) => s.removeFile);
  const toggleFileMuted = useTeam((s) => s.toggleFileMuted);
  const canEdit = useCan("edit");
  const notify = useUI((s) => s.notify);

  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const file of Array.from(list)) {
      const ingested = await ingestFile(file);
      addFile(ingested);
      notify(
        ingested.status === "ready"
          ? `Read ${ingested.name}`
          : `${ingested.name}: ${ingested.note ?? "could not read"}`,
      );
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Section
      title="Files the assistant has read"
      hint={`${count} file${count === 1 ? "" : "s"}. Text is extracted and used as context; the original isn't stored. Kept in this browser.`}
    >
      {canEdit && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center transition-colors duration-150",
            busy
              ? "border-accent"
              : "border-line hover:border-line-strong",
          )}
        >
          <Icon name="download" size={16} className="text-fg-subtle" />
          <span className="text-[12.5px] text-fg-muted">
            {busy ? "Reading…" : "Drop a file, or click to choose"}
          </span>
          <span className="text-[11px] text-fg-subtle">
            Markdown, text, CSV, JSON, PowerPoint and Word are read here. PDFs
            need a server-side extractor.
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Upload files"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      )}

      <ul className="flex flex-col">
        {files.map((f) => (
          <li
            key={f.id}
            data-file={f.id}
            className="group/f flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <Icon
              name="file"
              size={13}
              className={cn(
                "shrink-0",
                f.status === "ready" ? "text-fg-muted" : "text-warn",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-fg">
                {f.name}
              </span>
              <span className="block truncate text-[11px] text-fg-subtle">
                {f.status === "ready"
                  ? `${formatNumber(f.text.split(/\s+/).filter(Boolean).length)} words${f.note ? ` · ${f.note}` : ""}`
                  : (f.note ?? f.status)}
                {f.muted ? " · excluded from context" : ""}
              </span>
            </span>
            {canEdit && (
              <>
                {f.status === "ready" && (
                  <button
                    type="button"
                    onClick={() => toggleFileMuted(f.id)}
                    className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:text-fg"
                  >
                    {f.muted ? "Include" : "Exclude"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 rounded-xs p-1 text-fg-subtle opacity-0 transition-opacity group-hover/f:opacity-100 focus-visible:opacity-100 hover:text-danger"
                >
                  <Icon name="trash" size={12} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Shared ─────────────────────────────────────────────── */

/** Nothing known yet. Not "there is none" — the same distinction the plan
 *  card makes, and for the same reason. */
function Checking({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-fg-muted">
      <span className="size-1.5 rounded-full bg-fg-subtle" />
      {children}
    </p>
  );
}

/**
 * A question that could not be asked. Emphatically not an empty list: an empty
 * member list means nobody is here, and this means nobody knows.
 *
 * `setup: true` — no database — cannot really reach this, because the account
 * rule answers that before either read is drawn; if a session vanishes between
 * the two, the library's sentence still describes what happened, so there is
 * no second card for it.
 */
function Trouble({
  what,
  reason,
  busy,
  onRetry,
}: {
  what: string;
  reason: string;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warn/35 bg-warn/[0.07] p-3.5">
      <Icon name="minus" size={13} className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">{what}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
          {reason}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="mt-2.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-45"
        >
          {busy ? "Asking again…" : "Ask again"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  id,
  children,
}: {
  title: string;
  hint?: string;
  /** An address other pages can send somebody to. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 mb-9">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 mb-3 max-w-[62ch] text-[12.5px] leading-relaxed text-fg-muted">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  editable,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  editable: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => draft !== value && onChange(draft);

  const shared = {
    value: draft,
    placeholder,
    disabled: !editable,
    "aria-label": label,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(e.target.value),
    onBlur: commit,
    className:
      "w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg outline-none transition-colors focus:border-accent disabled:opacity-70",
  };

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <span className="pt-1.5 text-[12.5px] text-fg-muted sm:w-[112px] sm:shrink-0">
        {label}
      </span>
      {multiline ? (
        <textarea {...shared} rows={3} className={`${shared.className} resize-none leading-relaxed`} />
      ) : (
        <input
          {...shared}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
    </div>
  );
}
