"use client";

/**
 * A contents page.
 *
 * Derived from the document's headings on every render, so it cannot be out of
 * date. Word stores one and asks you to press "update field"; the interesting
 * consequence of that design is that half the theses in the world are handed in
 * with a contents page that does not match the document, and nobody notices
 * until the person marking it does.
 *
 * Clicking an entry scrolls to the heading itself, not to the block it lives
 * in. Those differ whenever a block holds more than one heading, which is most
 * of the time once someone writes properly.
 */

import { useMemo } from "react";
import { useProjects } from "@/lib/store";
import { headings } from "@/lib/toc";
import type { TocBlock as TocBlockModel } from "@/lib/types";
import { cn } from "@/lib/cn";

const DEPTHS = [1, 2, 3] as const;

export function TocBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: TocBlockModel;
}) {
  const blocks = useProjects(
    (s) => s.projects.find((p) => p.id === projectId)?.blocks,
  );
  const updateBlock = useProjects((s) => s.updateBlock);
  const depth = block.depth ?? 3;

  const entries = useMemo(
    () => headings(blocks ?? []).filter((h) => h.level <= depth),
    [blocks, depth],
  );

  const goTo = (blockId: string, index: number) => {
    const host = document.getElementById(`block-${blockId}`);
    const heading = host?.querySelectorAll("h1, h2, h3")[index] ?? host;
    heading?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3.5">
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 className="text-[12px] tracking-wide text-fg-muted uppercase">
          {block.title ?? "Contents"}
        </h2>
        <span className="ml-auto flex items-center gap-1 print:hidden">
          {DEPTHS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() =>
                updateBlock<TocBlockModel>(projectId, block.id, { depth: level })
              }
              aria-pressed={depth === level}
              aria-label={`Show headings down to level ${level}`}
              className={cn(
                "rounded-xs px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-150",
                depth === level
                  ? "bg-white/10 text-fg"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              H{level}
            </button>
          ))}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">
          No headings yet. Anything you set as a heading appears here.
        </p>
      ) : (
        <ol className="space-y-0.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              // Indentation carries the level, so the shape of the argument is
              // visible at a glance — which is most of what a contents page is
              // for while you are still writing.
              style={{ paddingLeft: `${(entry.level - 1) * 16}px` }}
            >
              <button
                type="button"
                onClick={() => goTo(entry.blockId, entry.index)}
                className={cn(
                  "w-full text-left text-[13px] transition-colors duration-150 hover:text-accent",
                  entry.level === 1 ? "font-medium text-fg" : "text-fg-muted",
                )}
              >
                {entry.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
