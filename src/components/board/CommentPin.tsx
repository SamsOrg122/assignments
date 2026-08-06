"use client";

/**
 * A comment thread pinned to a board item.
 *
 * The badge is the only thing that shows when the thread is closed — a
 * conversation shouldn't cost you canvas. Reactions are a fixed set of four:
 * enough for "seen it", "agreed", "not sure", "this one", and few enough that
 * choosing takes no thought.
 */

import { useState } from "react";
import type { BoardComment } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { collaboratorById } from "@/lib/team";
import { LOCAL_USER } from "@/lib/realtime";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const REACTIONS = ["👍", "🎯", "❓", "🔥"];

export function CommentPin({
  projectId,
  itemId,
  comments,
  open,
  onOpenChange,
}: {
  projectId: string;
  itemId: string;
  comments: BoardComment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addComment = useProjects((s) => s.addBoardComment);
  const toggleReaction = useProjects((s) => s.toggleBoardReaction);
  const resolve = useProjects((s) => s.resolveBoardComment);
  const [draft, setDraft] = useState("");

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(projectId, itemId, body, LOCAL_USER.id);
    setDraft("");
  };

  return (
    <>
      <button
        type="button"
        aria-label={
          comments.length
            ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
            : "Add a comment"
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className={cn(
          "absolute -top-2.5 -right-2.5 z-10 grid size-[22px] place-items-center rounded-full border text-[10px] font-medium transition-colors",
          comments.length
            ? "border-accent bg-accent text-on-accent"
            : "border-line-strong bg-surface text-fg-subtle hover:text-fg",
        )}
      >
        {comments.length || <Icon name="quote" size={10} />}
      </button>

      {open && (
        <div
          // Comments are a conversation, not a drag handle.
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="anim-pop absolute top-0 left-full z-30 ml-3 w-[248px] rounded-md border border-line-strong bg-surface p-2 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]"
        >
          <div className="max-h-[220px] space-y-2 overflow-y-auto">
            {comments.length === 0 && (
              <p className="px-1 py-2 text-[11.5px] text-fg-subtle">
                No comments yet.
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
                      onClick={() => resolve(projectId, itemId, c.id)}
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
                      const who = c.reactions?.[emoji] ?? [];
                      const mine = who.includes(LOCAL_USER.id);
                      if (!who.length)
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              toggleReaction(
                                projectId,
                                itemId,
                                c.id,
                                emoji,
                                LOCAL_USER.id,
                              )
                            }
                            aria-label={`React ${emoji}`}
                            className="rounded-full px-1 text-[11px] opacity-35 transition-opacity hover:opacity-100"
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
                              itemId,
                              c.id,
                              emoji,
                              LOCAL_USER.id,
                            )
                          }
                          aria-label={`React ${emoji}`}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] transition-colors",
                            mine
                              ? "border-accent bg-accent-soft text-fg"
                              : "border-line text-fg-muted hover:border-line-strong",
                          )}
                        >
                          {emoji} {who.length}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-end gap-1.5">
            <textarea
              autoFocus
              rows={2}
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
              placeholder="Comment…"
              aria-label="Comment"
              className="min-w-0 flex-1 resize-none rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Post comment"
              className={cn(
                "rounded-sm p-1.5 transition-colors",
                draft.trim()
                  ? "bg-accent text-on-accent"
                  : "border border-line text-fg-subtle",
              )}
            >
              <Icon name="corner-down-left" size={11} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
