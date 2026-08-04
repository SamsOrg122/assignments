"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHydrated, useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { usePresence } from "@/lib/realtime";
import { TopBar } from "@/components/shell/TopBar";
import { Canvas } from "@/components/canvas/Canvas";
import { Avatars } from "@/components/presence/Avatars";
import { Icon } from "@/components/ui/Icon";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const renameProject = useProjects((s) => s.renameProject);
  const hydrated = useHydrated();
  const openAI = useUI((s) => s.openAI);
  const openPalette = useUI((s) => s.openPalette);
  const router = useRouter();

  const blockIds = useMemo(
    () => project?.blocks.map((b) => b.id) ?? [],
    [project],
  );
  const peers = usePresence(project ? projectId : null, blockIds);

  const [draftName, setDraftName] = useState<string | null>(null);

  // Persisted projects only exist after rehydration; showing "not found" first
  // would be a lie for one frame.
  if (!project) {
    return hydrated ? (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div>
          <p className="text-[14px] text-fg">This project doesn&apos;t exist.</p>
          <p className="mt-1 text-[12.5px] text-fg-subtle">
            It may have been deleted from this browser.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-[13px] text-accent transition-opacity hover:opacity-80"
          >
            Back to projects
          </Link>
        </div>
      </div>
    ) : (
      <div className="flex-1" aria-busy="true" />
    );
  }

  return (
    <>
      <TopBar right={<Avatars peers={peers} />}>
        <input
          value={draftName ?? project.name}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => {
            if (draftName !== null) {
              renameProject(project.id, draftName.trim() || project.name);
              setDraftName(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraftName(null);
              e.currentTarget.blur();
            }
          }}
          aria-label="Project name"
          className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-1 text-[13px] font-medium text-fg outline-none transition-colors duration-150 hover:bg-surface focus:bg-surface"
        />

        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <button
            type="button"
            onClick={() =>
              openAI({
                projectId: project.id,
                blockId: project.blocks[0]?.id ?? "",
                blockType: project.blocks[0]?.type ?? "text",
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

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-6 lg:px-12 lg:py-12">
          <div className="mb-6 flex items-center gap-2 print:hidden">
            <span className="label-mono">
              {project.blocks.length} block
              {project.blocks.length === 1 ? "" : "s"}
            </span>
            <span className="h-px flex-1 bg-line" />
            <button
              type="button"
              onClick={() => router.push("/")}
              className="label-mono transition-colors duration-150 hover:!text-fg-muted"
            >
              All projects
            </button>
          </div>

          <Canvas project={project} peers={peers} />
        </div>
      </main>
    </>
  );
}
