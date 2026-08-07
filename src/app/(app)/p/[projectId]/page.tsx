"use client";

/**
 * One route, one editor per project kind. The shell (top bar, presence,
 * palette) is shared; everything below it is chosen by `project.kind`, so
 * adding a type never touches this file's logic — only its switch.
 */

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useHydrated, useProjects } from "@/lib/store";
import { LOCAL_USER, usePresence } from "@/lib/realtime";
import { useCollabSession } from "@/lib/collab/session";
import { WritingEditor } from "@/components/editors/WritingEditor";
import { DeckEditor } from "@/components/editors/DeckEditor";
import { BoardEditor } from "@/components/editors/BoardEditor";
import { CodeEditor } from "@/components/editors/CodeEditor";
import { DesignPlaceholder } from "@/components/editors/DesignPlaceholder";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const hydrated = useHydrated();

  // Presence targets are blocks in an editor and items on a board.
  const presenceIds = useMemo(() => {
    if (!project) return [];
    return project.kind === "board"
      ? project.board.map((i) => i.id)
      : project.blocks.map((b) => b.id);
  }, [project]);

  const simulated = usePresence(project ? projectId : null, presenceIds);

  /**
   * The live session for this project, always on.
   *
   * There is no switch because there is nothing to switch: a room with no one
   * else in it opens one idle channel and sends nothing until someone joins.
   * The payoff is that an edit link works the moment it is opened, and that
   * the same project in two windows is already collaborative.
   */
  const session = useCollabSession({
    projectId: project ? projectId : null,
    self: LOCAL_USER,
    enabled: Boolean(project),
  });

  // Real people first. The simulated provider is off unless the landing demo
  // turned it on, so in practice this is one list or the other, never a
  // confusing mixture of someone real and someone invented.
  const peers = session.peers.length ? session.peers : simulated;

  if (!project) {
    // Locally-created projects only exist after rehydration; claiming "not
    // found" before then would be a lie for one frame.
    return hydrated ? (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div>
          <p className="text-[14px] text-fg">This project doesn&apos;t exist.</p>
          <p className="mt-1 text-[12.5px] text-fg-subtle">
            It may have been deleted from this browser.
          </p>
          <Link
            href="/library"
            className="mt-4 inline-block text-[13px] text-accent transition-opacity hover:opacity-80"
          >
            Back to the library
          </Link>
        </div>
      </div>
    ) : (
      <div className="flex-1" aria-busy="true" />
    );
  }

  switch (project.kind) {
    case "board":
      return <BoardEditor project={project} peers={peers} />;
    case "deck":
      return <DeckEditor project={project} peers={peers} />;
    case "code":
      return <CodeEditor project={project} peers={peers} />;
    case "design":
      return <DesignPlaceholder project={project} peers={peers} />;
    default:
      return <WritingEditor project={project} peers={peers} />;
  }
}
