"use client";

/**
 * Reviewing what somebody proposed.
 *
 * Every run, in reading order, with the words it would add or take away and a
 * verdict beside it. Not a modal wizard stepping through them one at a time:
 * a supervisor wants to see the shape of the whole review before agreeing to
 * any of it, and one-at-a-time hides exactly that.
 */

import { useMemo } from "react";
import { useProjects } from "@/lib/store";
import { resolveSuggestions, suggestionRuns } from "@/lib/suggestions";
import { useUI } from "@/lib/ui-store";
import type { Project, TextBlock } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function SuggestionsPanel({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const notify = useUI((s) => s.notify);

  const perBlock = useMemo(
    () =>
      project.blocks
        .filter((b): b is TextBlock => b.type === "text")
        .map((block) => ({ block, runs: suggestionRuns(block.html) }))
        .filter((entry) => entry.runs.length > 0),
    [project.blocks],
  );

  const total = perBlock.reduce((n, e) => n + e.runs.length, 0);

  const resolveOne = (
    blockId: string,
    html: string,
    index: number,
    verdict: "accept" | "reject",
  ) =>
    updateBlock<TextBlock>(project.id, blockId, {
      html: resolveSuggestions(html, verdict, index),
    });

  const resolveAll = (verdict: "accept" | "reject") => {
    for (const { block } of perBlock)
      updateBlock<TextBlock>(project.id, block.id, {
        html: resolveSuggestions(block.html, verdict),
      });
    notify(
      verdict === "accept"
        ? `Accepted ${total} change${total === 1 ? "" : "s"}`
        : `Rejected ${total} change${total === 1 ? "" : "s"}`,
    );
  };

  return (
    <aside className="w-[290px] shrink-0 overflow-y-auto border-l border-line bg-surface/40 p-3.5 print:hidden">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12px] tracking-wide text-fg-muted uppercase">
          Proposed
        </span>
        <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
          {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the review panel"
          className="ml-auto rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={11} />
        </button>
      </div>

      {total === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-fg-subtle">
          Nothing proposed. Turn on suggesting and anything you type is offered
          rather than written — which is what a &ldquo;can help&rdquo; link
          gives somebody by default.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => resolveAll("accept")}
              className="flex-1 rounded-sm bg-accent px-2 py-1 text-[12px] font-medium text-on-accent transition-[filter] hover:brightness-110"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => resolveAll("reject")}
              className="flex-1 rounded-sm border border-line px-2 py-1 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Reject all
            </button>
          </div>

          <ul className="space-y-2">
            {perBlock.map(({ block, runs }) =>
              runs.map((run) => (
                <li
                  key={`${block.id}-${run.index}`}
                  className="rounded-sm border border-line bg-surface p-2"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-xs px-1 py-0.5 font-mono text-[9.5px]",
                        run.kind === "insert"
                          ? "bg-leaf-soft text-leaf"
                          : "bg-danger/15 text-danger",
                      )}
                    >
                      {run.kind === "insert" ? "add" : "cut"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(`block-${block.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      className="min-w-0 truncate text-left text-[11px] text-fg-subtle transition-colors hover:text-fg"
                    >
                      in {block.title ?? "the text"}
                    </button>
                  </div>

                  <p
                    className={cn(
                      "mt-1 text-[12.5px] leading-snug text-fg",
                      run.kind === "delete" && "line-through opacity-70",
                    )}
                  >
                    {run.text || "(empty)"}
                  </p>

                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        resolveOne(block.id, block.html, run.index, "accept")
                      }
                      className="rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent hover:text-fg"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        resolveOne(block.id, block.html, run.index, "reject")
                      }
                      className="rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-danger/50 hover:text-danger"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              )),
            )}
          </ul>
        </>
      )}
    </aside>
  );
}
