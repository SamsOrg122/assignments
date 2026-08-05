"use client";

/**
 * The Team page.
 *
 * Four things in one place because they're the same idea: who is here, what
 * they may do, what the group knows, and what it has read. The last two are
 * what the assistant is handed — so the page doubles as "what the AI knows
 * about us", which is the only honest way to present a memory.
 */

import { useMemo, useRef, useState } from "react";
import {
  KNOWLEDGE_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  assignableRoles,
  collaboratorById,
  useCan,
  useMyMembership,
  useTeam,
  useTeamHydrated,
  type KnowledgeKind,
  type Role,
} from "@/lib/team";
import { ingestFile } from "@/lib/files/ingest";
import { LOCAL_USER } from "@/lib/realtime";
import { useUI } from "@/lib/ui-store";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export default function TeamPage() {
  useTeamHydrated();
  const workspace = useTeam((s) => s.workspace);
  const knowledge = useTeam((s) => s.knowledge);
  const files = useTeam((s) => s.files);
  const me = useMyMembership();
  const canManage = useCan("manageMembers");
  const canEditWorkspace = useCan("manageWorkspace");
  const openAI = useUI((s) => s.openAI);

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
        {me && (
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted">
            You are {ROLE_LABELS[me.role].toLowerCase()}
          </span>
        )}
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-9 sm:px-8">
          <WorkspaceSection editable={canEditWorkspace} />
          <MembersSection canManage={canManage} myRole={me?.role} />
          <InvitesSection canManage={canManage} myRole={me?.role} />
          <KnowledgeSection count={knowledge.length} />
          <FilesSection count={files.length} />

          <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
            Members, what the team knows and the files above are all handed to
            the assistant as context. It answers from this record, so anything
            wrong here shows up in its answers — which is why nothing it infers
            is stored until someone confirms it.
          </p>
          <span className="hidden">{workspace.id}</span>
        </div>
      </main>
    </>
  );
}

/* ── Workspace ──────────────────────────────────────────── */

function WorkspaceSection({ editable }: { editable: boolean }) {
  const workspace = useTeam((s) => s.workspace);
  const renameWorkspace = useTeam((s) => s.renameWorkspace);
  const setContext = useTeam((s) => s.setContext);

  return (
    <Section
      title="Workspace"
      hint="What every answer should assume about where you are."
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

function MembersSection({
  canManage,
  myRole,
}: {
  canManage: boolean;
  myRole?: Role;
}) {
  const members = useTeam((s) => s.workspace.members);
  const setRole = useTeam((s) => s.setRole);
  const updateMember = useTeam((s) => s.updateMember);
  const removeMember = useTeam((s) => s.removeMember);
  const notify = useUI((s) => s.notify);

  const options = assignableRoles(myRole);
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <Section title="Members" hint={`${members.length} people in this workspace.`}>
      <ul className="flex flex-col">
        {members.map((m) => {
          const person = collaboratorById(m.id);
          const isMe = m.id === LOCAL_USER.id;
          const lastOwner = m.role === "owner" && owners === 1;

          return (
            <li
              key={m.id}
              data-member={m.id}
              className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full font-mono text-[10px] font-medium"
                style={{
                  background: `${person.color}22`,
                  color: person.color,
                  boxShadow: `inset 0 0 0 1px ${person.color}55`,
                }}
                aria-hidden="true"
              >
                {person.initials}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] text-fg">
                  {person.name}
                  {isMe && (
                    <span className="text-[11px] text-fg-subtle">you</span>
                  )}
                </p>
                <input
                  value={m.title ?? ""}
                  placeholder="Add a role description"
                  disabled={!canManage && !isMe}
                  aria-label={`Title for ${person.name}`}
                  onChange={(e) => updateMember(m.id, { title: e.target.value })}
                  className="w-full bg-transparent text-[12px] text-fg-muted outline-none placeholder:text-fg-subtle disabled:opacity-70"
                />
                {m.email && (
                  <p className="truncate text-[11px] text-fg-subtle">{m.email}</p>
                )}
              </div>

              {canManage && options.length > 0 && !lastOwner ? (
                <select
                  value={m.role}
                  aria-label={`Role for ${person.name}`}
                  onChange={(e) => setRole(m.id, e.target.value as Role)}
                  className="rounded-sm border border-line bg-surface px-2 py-1 text-[11.5px] text-fg-muted outline-none transition-colors hover:text-fg focus:border-accent"
                >
                  {options.map((r) => (
                    <option key={r} value={r} className="bg-surface">
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  title={ROLE_HINTS[m.role]}
                  className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted"
                >
                  {ROLE_LABELS[m.role]}
                </span>
              )}

              {canManage && !isMe && !lastOwner && (
                <button
                  type="button"
                  onClick={() => {
                    removeMember(m.id);
                    notify(`${person.name} removed`);
                  }}
                  aria-label={`Remove ${person.name}`}
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
                >
                  <Icon name="trash" size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!canManage && (
        <p className="text-[12px] text-fg-subtle">
          Only admins and owners can change roles or remove people.
        </p>
      )}
    </Section>
  );
}

/* ── Invites ────────────────────────────────────────────── */

function InvitesSection({
  canManage,
  myRole,
}: {
  canManage: boolean;
  myRole?: Role;
}) {
  const invites = useTeam((s) => s.workspace.invites);
  const invite = useTeam((s) => s.invite);
  const revokeInvite = useTeam((s) => s.revokeInvite);
  const acceptInvite = useTeam((s) => s.acceptInvite);
  const notify = useUI((s) => s.notify);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [link, setLink] = useState<string | null>(null);

  const options = assignableRoles(myRole).filter((r) => r !== "owner");
  const pending = invites.filter((i) => i.status === "pending");

  const send = () => {
    const created = invite(email, role);
    if (!created) {
      notify("Check the address — or they're already invited");
      return;
    }
    setEmail("");
    setLink(`${window.location.origin}/join/${created.token}`);
    notify(`Invited ${created.email}`);
  };

  if (!canManage)
    return (
      <Section title="Invites" hint="Admins and owners can invite people.">
        <p className="text-[12px] text-fg-subtle">
          {pending.length} invitation{pending.length === 1 ? "" : "s"} pending.
        </p>
      </Section>
    );

  return (
    <Section title="Invites" hint="They join with the role you pick here.">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          placeholder="name@university.edu"
          aria-label="Email address"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
        />
        <select
          value={role}
          aria-label="Invite role"
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-sm border border-line bg-surface px-2 py-1.5 text-[12px] text-fg-muted outline-none focus:border-accent"
        >
          {options.map((r) => (
            <option key={r} value={r} className="bg-surface">
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={send}
          disabled={!email.trim()}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-[12.5px] font-medium transition-[filter] duration-150",
            email.trim()
              ? "bg-accent text-white hover:brightness-110"
              : "border border-line text-fg-subtle",
          )}
        >
          Invite
        </button>
      </div>

      <p className="text-[11.5px] text-fg-subtle">{ROLE_HINTS[role]}</p>

      {link && (
        <div className="flex items-center gap-2 rounded-sm border border-line bg-surface px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
            {link}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              notify("Invite link copied");
            }}
            className="shrink-0 rounded-xs border border-line px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
          >
            Copy
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col">
          {pending.map((i) => (
            <li
              key={i.id}
              data-invite={i.id}
              className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-fg-subtle">
                <Icon name="plus" size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-fg">
                  {i.email}
                </span>
                <span className="text-[11px] text-fg-subtle">
                  Invited as {ROLE_LABELS[i.role].toLowerCase()} · not yet joined
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  acceptInvite(i.id);
                  notify(`${i.email} joined`);
                }}
                title="Simulate them following the link"
                className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Mark joined
              </button>
              <button
                type="button"
                onClick={() => revokeInvite(i.id)}
                aria-label={`Revoke invite for ${i.email}`}
                className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
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
      hint={`${count} entr${count === 1 ? "y" : "ies"}${unconfirmed.length ? ` · ${unconfirmed.length} waiting to be confirmed` : ""}.`}
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
                ? "bg-accent text-white hover:brightness-110"
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
      hint={`${count} file${count === 1 ? "" : "s"}. Text is extracted and used as context; the original isn't stored.`}
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
                  ? `${f.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words${f.note ? ` · ${f.note}` : ""}`
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

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
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
