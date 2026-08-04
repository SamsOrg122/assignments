"use client";

/**
 * Design projects exist in the Library and appear as cards on Boards, but the
 * editor is a deliberate placeholder — building a real vector tool is out of
 * scope. It says so rather than pretending, and the notes it does take are
 * ordinary blocks, so nothing has to be migrated when the real editor lands.
 */

import type { PeerState, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { Canvas } from "@/components/canvas/Canvas";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";

export function DesignPlaceholder({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const addBlock = useProjects((s) => s.addBlock);

  return (
    <>
      <ProjectTopBar project={project} peers={peers} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-8">
          <div className="hairline mb-8 flex items-start gap-3 rounded-lg bg-surface px-4 py-3.5">
            <Icon name="sparkle" size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div>
              <p className="text-[13px] text-fg">The design editor isn&apos;t built yet.</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                Design projects are real Library items — they sort, search and
                drop onto Boards as live cards like anything else. The canvas
                itself is the next thing to build. In the meantime this project
                takes notes, so nothing needs migrating later.
              </p>
            </div>
          </div>

          {project.blocks.length === 0 ? (
            <button
              type="button"
              onClick={() => addBlock(project.id, "text")}
              className="w-full rounded-lg border border-dashed border-line py-10 text-[13px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Start a note
            </button>
          ) : (
            <Canvas project={project} peers={peers} />
          )}
        </div>
      </main>
    </>
  );
}
