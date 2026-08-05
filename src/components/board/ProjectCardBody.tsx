"use client";

/**
 * A live card for a Library project.
 *
 * It holds an id and reads through the store, exactly like a chart bound to a
 * table — so editing the thesis updates this card on the same commit. That's
 * what "keep the connection live" means here; there is no copy to go stale.
 *
 * Deliberately *not* a full editor embedded in the canvas: a preview plus a
 * double-click that opens the real thing.
 */

import { useProjects } from "@/lib/store";
import { KINDS } from "@/lib/kinds";
import { firstLine, projectSummary } from "@/lib/summary";
import { Icon } from "@/components/ui/Icon";

export function ProjectCardBody({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));

  if (!project)
    return (
      <div className="grid size-full place-items-center rounded-md border border-dashed border-line bg-surface px-4 text-center">
        <p className="text-[11.5px] text-fg-subtle">
          The linked project was deleted.
        </p>
      </div>
    );

  const meta = KINDS[project.kind];

  return (
    <div className="surface-grain flex size-full flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
        <Icon name={meta.icon} size={11} className="shrink-0 text-fg-subtle" />
        <span className="label-mono truncate">{meta.label}</span>
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-accent">
          <span className="size-1 rounded-full bg-accent" />
          live
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <p className="mb-1 truncate text-[13px] font-medium text-fg">
          {project.name}
        </p>
        <p className="mb-2 line-clamp-3 text-[11.5px] leading-relaxed text-fg-muted">
          {firstLine(project, 160)}
        </p>
        <p className="mt-auto font-mono text-[9.5px] text-fg-subtle">
          {projectSummary(project)}
        </p>
      </div>

    </div>
  );
}
