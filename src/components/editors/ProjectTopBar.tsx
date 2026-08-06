"use client";

/**
 * Shared top bar for every editor: rename, presence, AI, palette. Editors pass
 * their own controls through `tools` so nothing here has to know what kind of
 * project it's above.
 */

import { useState } from "react";
import type { PeerState, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { TopBar } from "@/components/shell/TopBar";
import { Avatars } from "@/components/presence/Avatars";
import { Icon } from "@/components/ui/Icon";
import { KINDS } from "@/lib/kinds";

export function ProjectTopBar({
  project,
  peers,
  tools,
}: {
  project: Project;
  peers: PeerState[];
  tools?: React.ReactNode;
}) {
  const renameProject = useProjects((s) => s.renameProject);
  const openAI = useUI((s) => s.openAI);
  const openPalette = useUI((s) => s.openPalette);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <TopBar right={<Avatars peers={peers} />}>
      <Icon
        name={KINDS[project.kind].icon}
        size={13}
        className="shrink-0 text-fg-subtle"
      />
      <input
        value={draft ?? project.name}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) {
            renameProject(project.id, draft.trim() || project.name);
            setDraft(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        aria-label="Project name"
        className="min-w-0 max-w-[38ch] flex-1 truncate rounded-sm bg-transparent px-1 py-1 text-[13px] font-medium text-fg outline-none transition-colors duration-150 hover:bg-surface focus:bg-surface"
      />

      {tools}

      <span className="hidden shrink-0 items-center gap-1.5 md:flex">
        <button
          type="button"
          onClick={() =>
            openAI({
              projectId: project.id,
              blockId: project.blocks[0]?.id ?? "",
              // A board has no blocks, so it names itself as the surface —
              // otherwise it would be offered a document's openers.
              blockType:
                project.kind === "board"
                  ? "board"
                  : (project.blocks[0]?.type ?? "text"),
              selectionText: "",
              anchor: { x: window.innerWidth / 2, y: 120 },
            })
          }
          className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="sparkle" size={11} />
          AI
          <kbd className="kbd">⌘J</kbd>
        </button>
        <button
          type="button"
          onClick={() => openPalette()}
          className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          Actions
          <kbd className="kbd">⌘K</kbd>
        </button>
      </span>
    </TopBar>
  );
}
