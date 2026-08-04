"use client";

/**
 * Code projects.
 *
 * Deliberately light: this reuses the existing code *block* (multi-file editor,
 * file tree, sandboxed preview) rather than growing into an IDE. Anything more
 * is out of scope for now, and the block is already a clean seam to grow from.
 */

import type { PeerState, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { Canvas } from "@/components/canvas/Canvas";
import { ProjectTopBar } from "./ProjectTopBar";

export function CodeEditor({
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
        <div className="mx-auto w-full max-w-[1100px] px-5 py-8 sm:px-8">
          {project.blocks.length === 0 ? (
            <div className="hairline rounded-lg bg-surface px-6 py-14 text-center">
              <p className="text-[13.5px] text-fg-muted">No files yet.</p>
              <button
                type="button"
                onClick={() => addBlock(project.id, "code")}
                className="mt-3 text-[13px] text-accent transition-opacity hover:opacity-80"
              >
                Add a code block
              </button>
            </div>
          ) : (
            <Canvas project={project} peers={peers} />
          )}
        </div>
      </main>
    </>
  );
}
