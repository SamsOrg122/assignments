"use client";

/**
 * The other half of an edit link: someone helping with your assignment.
 *
 * This is the real editor, not a viewer with the buttons switched on. A guest
 * gets the slash menu, the tables, the slide stage and the board — because
 * "help me with this" means doing the work, and a reduced editor would just be
 * a slower way to hand the document back.
 *
 * Two things make that safe. The project is loaded into a *sandboxed* store —
 * persistence detached before anything is written — so a document a stranger
 * sent can never land in the helper's own library or overwrite their work. And
 * every route out of here is a real page load, not a client navigation, so the
 * sandbox dies with the tab it was made in.
 */

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useCollabSession } from "@/lib/collab/session";
import { WritingEditor } from "@/components/editors/WritingEditor";
import { DeckEditor } from "@/components/editors/DeckEditor";
import { BoardEditor } from "@/components/editors/BoardEditor";
import { CodeEditor } from "@/components/editors/CodeEditor";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { InlineAI } from "@/components/ai/InlineAI";
import { Toast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Who the guest is to everyone else. Named, not anonymous — see below. */
const GUEST_COLORS = ["#26a17b", "#c46be0", "#d8a33c", "#e0685b"];

export function GuestEditor({
  project,
  suggesting = false,
}: {
  project: Project;
  /** A "can suggest" link. Typing proposes; the author decides. */
  suggesting?: boolean;
}) {
  const [name, setName] = useState<string | null>(null);

  // Loading the sandbox is a write to an external system, so it belongs in an
  // effect — and readiness is then simply whether the store has the project,
  // rather than a second piece of state saying the same thing.
  useEffect(() => {
    useProjects.getState().openSandbox(project);
  }, [project]);

  // The link decided this, so it is set once rather than offered as a toggle
  // the guest could quietly turn off.
  useEffect(() => {
    useUI.getState().setSuggestMode(suggesting);
    return () => useUI.getState().setSuggestMode(false);
  }, [suggesting]);

  const live = useProjects((s) => s.projects.find((p) => p.id === project.id));
  const ready = Boolean(live);

  // Memoised on the name alone: a fresh object every render would tear the
  // session down and rejoin it on every keystroke.
  const self = useMemo(
    () => ({
      id: "guest",
      name: name?.trim() || "Guest",
      initials: (name?.trim() || "Guest").slice(0, 2).toUpperCase(),
      color: GUEST_COLORS[0],
    }),
    [name],
  );

  const session = useCollabSession({
    projectId: ready ? project.id : null,
    // From the link, never the project id — see `Project.shareRoom`.
    room: project.shareRoom ?? null,
    self,
    enabled: ready,
  });

  if (!live)
    return (
      <div className="grid h-full place-items-center bg-canvas" aria-busy="true">
        <p className="text-[13px] text-fg-subtle">Opening the session…</p>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-canvas">
      <SessionBar
        session={session}
        name={name}
        onName={setName}
        projectName={live.name}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {live.kind === "board" ? (
          <BoardEditor project={live} peers={session.peers} />
        ) : live.kind === "deck" ? (
          <DeckEditor project={live} peers={session.peers} />
        ) : live.kind === "code" ? (
          <CodeEditor project={live} peers={session.peers} />
        ) : (
          <WritingEditor project={live} peers={session.peers} />
        )}
      </div>

      {/* The pieces of the shell an editor actually needs to work. The sidebar
          is deliberately absent: a guest has no library here, and showing one
          would invite them to look for work that isn't in this tab. */}
      <CommandPalette />
      <InlineAI />
      <Toast />
    </div>
  );
}

function SessionBar({
  session,
  name,
  onName,
  projectName,
}: {
  session: ReturnType<typeof useCollabSession>;
  name: string | null;
  onName: (value: string) => void;
  projectName: string;
}) {
  const others = session.peers.length;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface/60 px-4 py-2">
      <span className="flex items-center gap-2 text-[12px] text-fg">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            others > 0 ? "bg-leaf" : "bg-fg-subtle",
          )}
        />
        {others > 0
          ? `Working together on ${projectName}`
          : `Helping with ${projectName}`}
      </span>

      <span aria-hidden="true" className="h-3.5 w-px bg-line" />

      <label className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        You are
        <input
          value={name ?? ""}
          onChange={(e) => onName(e.target.value)}
          placeholder="Guest"
          aria-label="Your name in this session"
          maxLength={24}
          className="w-[11ch] rounded-xs border border-line bg-canvas px-1.5 py-0.5 text-[11.5px] text-fg outline-none focus:border-line-strong"
        />
      </label>

      <span className="ml-auto flex items-center gap-2.5">
        {/*
          The one sentence that decides whether this feature is honest. A
          session that silently can't reach the person who sent the link is
          worse than no session, so what it reaches is always on screen.
        */}
        {/*
          Three honest states, never a promise. Connecting says so; a failure
          or a downgrade says what happened; and an empty room says what it
          has actually been shown to reach rather than what it hoped for.
        */}
        <span
          className={cn(
            "text-[11px]",
            session.problem ? "text-[#d8a33c]" : "text-fg-subtle",
          )}
        >
          {others > 0
            ? `${others} other ${others === 1 ? "person" : "people"} here`
            : session.connecting
              ? "Connecting…"
              : session.problem
                ? session.problem
                : `Waiting — this session reaches ${session.reach ?? "nobody"}.`}
        </span>
        <a
          href="/library"
          className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Icon name="home" size={11} />
          {/* A real page load: it leaves the sandbox behind rather than
              carrying a memory-only store into the helper's own workspace. */}
          Your workspace
        </a>
      </span>
    </div>
  );
}
