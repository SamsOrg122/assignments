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
import { Avatar, KindChip } from "@/components/ui/Avatar";
import { ShareMenu } from "@/components/share/ShareMenu";
import { LookPanel } from "./LookPanel";
import { DeadlineChip } from "@/components/assignments/DeadlineChip";
import { cn } from "@/lib/cn";
import { Toolbar, ToolGroup, ToolText } from "./Toolbar";

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
  const setVoiceOpen = useUI((s) => s.setVoiceOpen);
  const openPalette = useUI((s) => s.openPalette);
  const [draft, setDraft] = useState<string | null>(null);
  const [designOpen, setDesignOpen] = useState(false);

  return (
    <TopBar right={<Avatars peers={peers} />}>
      {/*
        * What you are looking at, said in its own colour.
        *
        * This was the kind's icon in grey, which told you a document was a
        * document and nothing else — the same mark, the same weight, above
        * every one of the six editors. The avatar is the project's actual
        * face (its motif, its emoji, whatever was picked for it) on a tile
        * of its kind's colour, and the chip beside it names the kind in
        * words, for somebody who arrived by link and has never seen this
        * file. Figma's move: the object, its type, and then its name.
        */}
      <Avatar glyph={project.glyph} kind={project.kind} size={13} tile />
      <KindChip kind={project.kind} className="hidden sm:inline-flex" />
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

      {/* Nothing at all unless this document is somebody's assignment. */}
      <DeadlineChip projectId={project.id} />

      {tools}

      {/*
        * The other half of the bar, on the same track as the editor's own
        * tools rather than as five more bordered pills.
        *
        * Design belongs to every kind of project, so it is here and not in
        * each editor's toolset; the three after it are the ways of asking for
        * help and the way to everything else. The hairlines say which is
        * which. `Design` keeps its accent treatment when a look is set,
        * because that is the one button here reporting that something about
        * this document has been changed.
        */}
      <Toolbar className="relative shrink-0">
        <ToolGroup>
          <span className="relative">
            <ToolText
              icon="image"
              title="Design — backdrop and accent"
              active={designOpen}
              onClick={() => setDesignOpen((v) => !v)}
              className={cn(
                project.look && !designOpen && "bg-accent-soft text-fg",
              )}
            >
              Design
            </ToolText>
            {designOpen && (
              <LookPanel
                projectId={project.id}
                look={project.look}
                onClose={() => setDesignOpen(false)}
              />
            )}
          </span>
        </ToolGroup>

        <ToolGroup>
          <span className="hidden md:flex">
            <ShareMenu project={project} />
          </span>
        </ToolGroup>

        <span className="hidden md:contents">
          <ToolGroup>
            <ToolText
              icon="sparkle"
              onClick={() =>
                openAI({
                  projectId: project.id,
                  blockId: project.blocks[0]?.id ?? "",
                  // A board has no blocks, so it names itself as the surface
                  // — otherwise it would be offered a document's openers.
                  blockType:
                    project.kind === "board"
                      ? "board"
                      : (project.blocks[0]?.type ?? "text"),
                  selectionText: "",
                  anchor: { x: window.innerWidth / 2, y: 120 },
                })
              }
            >
              AI
              <kbd className="kbd">⌘J</kbd>
            </ToolText>
            <ToolText
              icon="mic"
              title="Talk to the assistant (⌘⇧V)"
              onClick={() => setVoiceOpen(true)}
            >
              Talk
              <kbd className="kbd">⌘⇧V</kbd>
            </ToolText>
          </ToolGroup>

          <ToolGroup>
            <ToolText onClick={() => openPalette()}>
              Actions
              <kbd className="kbd">⌘K</kbd>
            </ToolText>
          </ToolGroup>
        </span>
      </Toolbar>
    </TopBar>
  );
}
