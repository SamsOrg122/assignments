"use client";

/**
 * The bibliography.
 *
 * Holds no data of its own — it renders `project.sources` through the current
 * style, so it cannot drift from the source list the way a hand-typed
 * references section does. Switching style re-renders every entry *and* every
 * in-text marker in one move.
 */

import { useMemo } from "react";
import type { BibliographyBlock as BibliographyBlockModel, CitationStyle } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { formatReference, sortSources, STYLE_LABELS } from "@/lib/sources";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const STYLES: CitationStyle[] = ["apa", "mla", "chicago", "harvard"];

export function BibliographyBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: BibliographyBlockModel;
}) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const setCitationStyle = useProjects((s) => s.setCitationStyle);
  const updateBlock = useProjects((s) => s.updateBlock);

  const style = project?.citationStyle ?? "apa";
  const sources = useMemo(() => project?.sources ?? [], [project?.sources]);

  /** Ids actually cited in the prose, read straight from the stored HTML. */
  const citedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of project?.blocks ?? []) {
      if (b.type !== "text") continue;
      for (const m of b.html.matchAll(/data-citation="([^"]+)"/g)) ids.add(m[1]);
    }
    return ids;
  }, [project?.blocks]);

  const shown = useMemo(() => {
    const pool =
      block.scope === "cited"
        ? sources.filter((s) => citedIds.has(s.id))
        : sources;
    return sortSources(pool);
  }, [sources, citedIds, block.scope]);

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="label-mono">
          {shown.length} {block.scope === "cited" ? "cited" : "source"}
          {shown.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              updateBlock<BibliographyBlockModel>(projectId, block.id, {
                scope: block.scope === "cited" ? "all" : "cited",
              })
            }
            className="rounded-sm border border-line px-1.5 py-1 text-[11px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {block.scope === "cited" ? "Cited only" : "All sources"}
          </button>

          <div className="flex gap-0.5 rounded-sm border border-line p-0.5">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={style === s}
                onClick={() => setCitationStyle(projectId, s)}
                className={cn(
                  "rounded-xs px-1.5 py-0.5 text-[11px] transition-colors duration-150",
                  style === s
                    ? "bg-surface-3 text-fg"
                    : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                {STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12.5px] text-fg-subtle">
          {sources.length === 0
            ? "No sources yet. Press ⌘⇧C in the text to add and cite one."
            : "Nothing cited yet — switch to “All sources” to list everything collected."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((s) => (
            <li
              key={s.id}
              className="border-b border-line px-3 py-2.5 last:border-b-0"
            >
              <p
                className="prose-canvas text-[13px] leading-relaxed [text-indent:-1.4em] [padding-left:1.4em]"
                // Formatter output only; every field is escaped in format.ts.
                dangerouslySetInnerHTML={{ __html: formatReference(s, style) }}
              />
              {s.uncertain && s.uncertain.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-warn">
                  <Icon name="sparkle" size={9} />
                  check {s.uncertain.join(", ")} — inferred, not verified
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
