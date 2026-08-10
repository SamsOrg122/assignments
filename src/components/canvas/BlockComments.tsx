"use client";

/**
 * A comment thread on a block.
 *
 * Pinned to the block rather than to a run of characters. A comment anchored to
 * an offset drifts onto the wrong sentence the first time somebody edits above
 * it, and keeping it in place honestly needs a CRDT that this document model
 * does not have. A block survives editing; an offset does not.
 *
 * The badge is the only thing visible when the thread is closed, so a
 * conversation costs no column width. Reactions are four, for the same reason
 * they are four on the board: enough to answer without typing, few enough to
 * pick without thinking.
 */

import { useState } from "react";
import type { BoardComment } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { collaboratorById } from "@/lib/team";
import { LOCAL_USER } from "@/lib/realtime";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const REACTIONS = ["👍", "🎯", "❓", "🔥"];

export function BlockComments({
  projectId,
  blockId,
  comments,
  open,
  onOpenChange,
}: {
  projectId: string;
  blockId: string;
  comments: BoardComment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addComment = useProjects((s) => s.addBlockComment);
  const toggleReaction = useProjects((s) => s.toggleBlockReaction);
  const resolve = useProjects((s) => s.resolveBlockComment);
  const [draft, setDraft] = useState("");

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(projectId, blockId, body, LOCAL_USER.id);
    setDraft("");
  };

  return (
    <>
      <button
        type="button"
        aria-label={
          comments.length
            ? `${comments.length} comment${comments.length === 1 ? "" : "s"} on this block`
            : "Comment on this block"
        }
        onClick={() => onOpenChange(!open)}
        className={cn(
          "grid size-[22px] shrink-0 place-items-center rounded-full border text-[10px] font-medium transition-colors duration-150",
          comments.length
            ? "border-accent bg-accent text-on-accent"
            : "border-line text-fg-subtle opacity-0 group-hover/block:opacity-100 hover:border-line-strong hover:text-fg",
          open && "opacity-100",
        )}
      >
        {comments.length || <Icon name="quote" size={10} />}
      </button>

      {open && (
        <div className="anim-pop absolute top-0 right-full z-30 mr-3 w-[248px] rounded-md border border-line-strong bg-surface p-2 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] print:hidden">
          <div className="max-h-[240px] space-y-2 overflow-y-auto">
            {comments.length === 0 && (
              <p className="px-1 py-2 text-[11.5px] text-fg-subtle">
                Nothing said about this yet.
              </p>
            )}
            {comments.map((c) => {
              const who = collaboratorById(c.authorId);
              return (
                <div key={c.id} className="rounded-sm bg-surface-2 p-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="grid size-[15px] shrink-0 place-items-center rounded-full font-mono text-[8px] text-black"
                      style={{ background: who.color }}
                    >
                      {who.initials}
                    </span>
                    <span className="truncate text-[11px] text-fg-muted">
                      {who.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => resolve(projectId, blockId, c.id)}
                      aria-label="Resolve comment"
                      className="ml-auto rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
                    >
                      <Icon name="check" size={10} />
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug whitespace-pre-wrap text-fg">
                    {c.body}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {REACTIONS.map((emoji) => {
                      const reacted = c.reactions?.[emoji] ?? [];
                      const mine = reacted.includes(LOCAL_USER.id);
                      if (!reacted.length && !mine)
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              toggleReaction(
                                projectId,
                                blockId,
                                c.id,
                                emoji,
                                LOCAL_USER.id,
                              )
                            }
                            aria-label={`React with ${emoji}`}
                            className="rounded-xs px-1 py-0.5 text-[11px] opacity-40 transition-opacity hover:opacity-100"
                          >
                            {emoji}
                          </button>
                        );
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() =>
                            toggleReaction(
                              projectId,
                              blockId,
                              c.id,
                              emoji,
                              LOCAL_USER.id,
                            )
                          }
                          aria-pressed={mine}
                          className={cn(
                            "flex items-center gap-1 rounded-xs border px-1 py-0.5 text-[11px] transition-colors",
                            mine
                              ? "border-accent bg-accent-soft text-fg"
                              : "border-line text-fg-muted",
                          )}
                        >
                          {emoji}
                          <span className="font-mono text-[9px]">
                            {reacted.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-end gap-1.5 border-t border-line pt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape") onOpenChange(false);
              }}
              rows={2}
              placeholder="Say something…"
              aria-label="Write a comment"
              className="min-w-0 flex-1 resize-none rounded-sm bg-surface-2 px-2 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send"
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-sm transition-colors",
                draft.trim()
                  ? "bg-accent text-on-accent hover:brightness-110"
                  : "border border-line text-fg-subtle",
              )}
            >
              <Icon name="arrow-up" size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
