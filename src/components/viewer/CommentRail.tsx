"use client";

/**
 * Leaving a note on a paragraph you cannot edit.
 *
 * This is the whole of what a "can comment" link adds, and it is deliberately
 * small: a marker in the margin, the thread that is already there, and a box
 * to add to it. No editor, no toolbar, nothing that could be mistaken for
 * permission to change the words.
 *
 * Two honesties it owes the person typing:
 *
 *  - **The name comes first.** A note from "Guest" is a note the author has to
 *    guess about, so the box asks who this is before it takes the first
 *    comment, and remembers the answer.
 *  - **It says whether the note got there.** The note box on the server is one
 *    process's memory with a day on it. When the send fails — restarted
 *    server, several instances, no network — this says so on the spot, while
 *    the words are still on screen to copy, rather than showing a tick and
 *    losing them.
 */

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { guestId, guestName, setGuestName } from "@/lib/guest";
import { leaveNote } from "@/lib/collab/notes";
import type { BoardComment } from "@/lib/types";

export function CommentRail({
  room,
  blockId,
  existing,
}: {
  /** The document's id, which is also the room its notes are kept in. */
  room: string;
  blockId: string;
  /** Whatever thread the link already carried. */
  existing: BoardComment[];
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<BoardComment[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(() => guestName());
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const thread = [...existing, ...mine].sort((a, b) => a.at - b.at);
  const needsName = !name.trim();

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (needsName) return;

    setSending(true);
    setProblem(null);
    setGuestName(name);

    const note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      blockId,
      authorId: guestId(),
      authorName: name.trim(),
      body,
      at: Date.now(),
    };

    const landed = await leaveNote(room, note);
    setSending(false);

    if (!landed) {
      setProblem(
        "That didn't get through. The note box is one server's memory — copy your words somewhere safe and try again in a minute.",
      );
      return;
    }

    setMine((all) => [...all, note]);
    setDraft("");
  };

  return (
    <div className="relative print:hidden" data-comment-rail={blockId}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          thread.length
            ? `${thread.length} comment${thread.length === 1 ? "" : "s"} on this paragraph`
            : "Comment on this paragraph"
        }
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "absolute top-0 -left-9 grid size-6 place-items-center rounded-full border text-[10px] transition-colors duration-150",
          thread.length
            ? "border-accent/50 bg-accent-soft text-accent"
            : "border-line text-fg-subtle opacity-0 group-hover/block:opacity-100 focus-visible:opacity-100",
          open && "opacity-100",
        )}
      >
        {thread.length || <Icon name="quote" size={10} />}
      </button>

      {open && (
        <div className="anim-pop absolute top-0 -left-[268px] z-30 w-[252px] rounded-md border border-line-strong bg-surface p-2 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]">
          {thread.length > 0 && (
            <div className="mb-2 max-h-[220px] space-y-2 overflow-y-auto">
              {thread.map((comment) => (
                <div key={comment.id} className="rounded-sm bg-surface-2 p-2">
                  <p className="text-[11px] text-fg-muted">
                    {comment.authorName ?? "Someone"}
                    <span className="text-fg-subtle">
                      {" "}
                      · {formatDateTime(comment.at)}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] leading-snug whitespace-pre-wrap text-fg">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {needsName && (
            <input
              value={name}
              aria-label="Your name"
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              className="mb-1.5 w-full rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent"
            />
          )}

          <textarea
            value={draft}
            aria-label="Your comment"
            placeholder="Leave a note…"
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            className="w-full resize-y rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12px] leading-snug text-fg outline-none focus:border-accent"
          />

          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim() || needsName}
              className="rounded-sm bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <span className="text-[10.5px] text-fg-subtle">
              {needsName ? "Your name first" : "⌘↵"}
            </span>
          </div>

          {problem && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#d8a33c]">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
