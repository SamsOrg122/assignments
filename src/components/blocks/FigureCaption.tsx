"use client";

/**
 * "Table 1 — Revenue by quarter", above the thing it names.
 *
 * The number is derived and the words are the block's own title, so renaming
 * happens in one place and renumbering happens in none. Above rather than
 * below because that is where table captions go in every style guide that has
 * an opinion; pictures keep theirs underneath.
 */

import { useProjects } from "@/lib/store";
import { figureFor } from "@/lib/figures";
import type { Block } from "@/lib/types";

export function FigureCaption({
  projectId,
  block,
  placeholder,
}: {
  projectId: string;
  block: Block;
  placeholder: string;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const label = useProjects(
    (s) =>
      figureFor(
        s.projects.find((p) => p.id === projectId)?.blocks ?? [],
        block.id,
      )?.label ?? "",
  );

  if (!label) return null;

  return (
    <div className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
      <span className="shrink-0 text-[12px] font-medium text-fg-muted">
        {label}.
      </span>
      <input
        value={block.title ?? ""}
        onChange={(e) =>
          updateBlock(projectId, block.id, { title: e.target.value })
        }
        placeholder={placeholder}
        aria-label={`${label} caption`}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-fg-subtle outline-none placeholder:text-fg-subtle/60 focus:text-fg-muted"
      />
    </div>
  );
}
