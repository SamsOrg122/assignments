"use client";

/**
 * The message list.
 *
 * Consecutive messages from one person inside a few minutes collapse into a
 * group with a single avatar — the thing that makes a channel readable rather
 * than a wall of repeated names.
 *
 * TYPE, ON THE SCREEN THAT EXISTS TO BE READ. The message body was the weakest
 * thing here: 13.5px, no rank of its own, and as wide as the window — 1258px,
 * about 184 characters a line at 1800, which is two and a half times a
 * readable measure. It is now `text-body max-w-[68ch]`, and everything hung
 * off it — the time, the initials, the reaction count, `(edited)`, `sending…`
 * — is `text-meta` in the sans face. Those were nine sizes between 9px and
 * 13.5px and four of them in monospace, which made a stack of machine captions
 * out of the facts around a sentence. Two sizes carry the whole row now: the
 * author at `text-object`, everything else at `text-meta`, and the body
 * between them at `text-body`.
 *
 * Nothing here is bordered except the shared-project card, which has its own
 * name and its own address and is therefore an object you open. A message is
 * not an object you pick up; it has the list to belong to.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { channelMessages, personById, threadReplies, useChat } from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useProjects } from "@/lib/store";
import { KINDS } from "@/lib/kinds";
import { firstLine, projectSummary } from "@/lib/summary";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { FileCard } from "./attachments";
import type { Message } from "@/lib/chat";
import { formatTime } from "@/lib/format";

const EMPTY: string[] = [];
const GROUP_WINDOW = 5 * 60_000;
const QUICK_REACTIONS = ["👍", "🔥", "🎯", "👀", "🙏"];

export function MessageList({
  channelId,
  onOpenThread,
  threadParentId,
}: {
  channelId: string;
  onOpenThread?: (messageId: string) => void;
  /** Set when rendering inside a thread panel. */
  threadParentId?: string;
}) {
  const messages = useChat((s) => s.messages);
  // Select the map, not a derived array: `s.typing[id] ?? []` hands React a
  // new array every call and zustand treats that as a changed snapshot.
  const typingByChannel = useChat((s) => s.typing);
  const typing = typingByChannel[channelId] ?? EMPTY;
  const bottomRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () =>
      threadParentId
        ? threadReplies(messages, threadParentId)
        : channelMessages(messages, channelId),
    [messages, channelId, threadParentId],
  );

  // Follow the conversation as it grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [list.length, typing.length]);

  return (
    <div className="flex flex-col gap-0.5 px-4 py-4">
      {list.length === 0 && (
        <p className="py-10 text-center text-body text-fg-subtle">
          {threadParentId ? "No replies yet." : "No messages yet — say something."}
        </p>
      )}

      {list.map((message, i) => {
        const previous = list[i - 1];
        const grouped =
          previous !== undefined &&
          previous.authorId === message.authorId &&
          message.at - previous.at < GROUP_WINDOW;
        return (
          <MessageRow
            key={message.id}
            message={message}
            grouped={grouped}
            replies={threadParentId ? 0 : threadReplies(messages, message.id).length}
            onOpenThread={onOpenThread}
          />
        );
      })}

      {typing.length > 0 && (
        <p className="anim-fade px-1 pt-2 text-meta text-fg-subtle">
          {typing.map((id) => personById(id).name.split(" ")[0]).join(", ")}{" "}
          {typing.length === 1 ? "is" : "are"} typing
          <span className="anim-shimmer">…</span>
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  replies,
  onOpenThread,
}: {
  message: Message;
  grouped: boolean;
  replies: number;
  onOpenThread?: (messageId: string) => void;
}) {
  const toggleReaction = useChat((s) => s.toggleReaction);
  const removeMessage = useChat((s) => s.removeMessage);
  const editMessage = useChat((s) => s.editMessage);

  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const author = personById(message.authorId);
  const mine = message.authorId === LOCAL_USER.id;

  return (
    <div
      data-message-id={message.id}
      className={cn(
        "group/msg relative flex gap-2.5 rounded-sm px-1 transition-colors duration-100 hover:bg-surface-2/40",
        grouped ? "py-0.5" : "mt-3 py-1 first:mt-0",
      )}
    >
      {/* The gutter: a time on a grouped row, an avatar on the first of a
          run. Both are `text-meta` in the sans face — an initial is a name
          abbreviated and a time is a fact, and neither is a string you would
          paste anywhere, which is the whole test for the monospace face. */}
      <div className="w-7 shrink-0 pt-0.5">
        {grouped ? (
          <time
            dateTime={new Date(message.at).toISOString()}
            suppressHydrationWarning
            className="hidden pt-1 text-right text-meta text-fg-subtle group-hover/msg:block"
          >
            {shortTime(message.at)}
          </time>
        ) : (
          <span
            /* font-medium rides beside the token here rather than being
               forgotten inside it: two letters at 11px sit on a 13%-alpha disc
               of the person's own colour, and the weight is what keeps them
               legible against it. */
            className="grid size-7 place-items-center rounded-full text-meta font-medium"
            style={{
              background: `${author.color}22`,
              color: author.color,
              boxShadow: `inset 0 0 0 1px ${author.color}55`,
            }}
            aria-hidden="true"
          >
            {author.initials}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="mb-0.5 flex items-baseline gap-2">
            <span className="text-object text-fg">{author.name}</span>
            <time
              dateTime={new Date(message.at).toISOString()}
              suppressHydrationWarning
              className="text-meta text-fg-subtle"
            >
              {shortTime(message.at)}
            </time>
            {message.pending && (
              <span className="text-meta text-fg-subtle">sending…</span>
            )}
          </p>
        )}

        {editing ? (
          <div className="flex flex-col gap-1.5 py-1">
            <textarea
              autoFocus
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  editMessage(message.id, draft.trim());
                  setEditing(false);
                } else if (e.key === "Escape") {
                  setDraft(message.body);
                  setEditing(false);
                }
              }}
              className="w-full resize-none rounded-sm border border-accent bg-surface-2 px-2.5 py-2 text-body text-fg outline-none"
            />
            <span className="text-meta text-fg-subtle">
              ↵ save · esc cancel
            </span>
          </div>
        ) : (
          // 68ch, not the window. The measure is a property of reading, and
          // letting it track the viewport is what made the widest screen the
          // worst one to read on.
          message.body && (
            <p className="max-w-[68ch] text-body whitespace-pre-wrap text-fg">
              {message.body}
              {message.editedAt && (
                <span className="ml-1.5 text-meta text-fg-subtle">
                  (edited)
                </span>
              )}
            </p>
          )
        )}

        {message.attachments?.map((a, i) =>
          a.kind === "project" ? (
            <ProjectCard key={i} projectId={a.projectId} />
          ) : (
            <div key={i} className="mt-2 max-w-[420px]">
              <FileCard file={a} />
            </div>
          ),
        )}

        {/* The container rule's one written escape hatch: reaction pills abut
            each other with no room for space between, so a fill stands in for
            the border they used to carry. The fill is never the carrier on its
            own — surface-2 is 1.24:1 on canvas in dark and 1.08:1 in light —
            so the ink moves with it, muted to full. */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(message.id, emoji)}
                title={users.map((u) => personById(u).name).join(", ")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-meta transition-colors duration-150",
                  users.includes(LOCAL_USER.id)
                    ? "bg-accent-soft text-fg"
                    : "bg-surface-2 text-fg-muted hover:text-fg",
                )}
              >
                {emoji}
                <span className="text-meta">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {replies > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message.id)}
            /* An underlined word rather than accent ink. The screen's one
               accent is the send button, and a reply arrow sitting under a
               message already says this is a way in — which is exactly the
               case where accent text is not earning anything. */
            className="mt-1.5 flex items-center gap-1.5 text-meta text-fg-muted transition-colors hover:text-fg"
          >
            <Icon name="corner-down-left" size={11} />
            <span className="underline decoration-line-strong underline-offset-2">
              {replies} {replies === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute -top-2.5 right-2 flex items-center gap-0.5 rounded-sm border border-line bg-surface p-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100">
        {picking ? (
          QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                toggleReaction(message.id, emoji);
                setPicking(false);
              }}
              className="rounded-xs px-1 py-0.5 text-body transition-colors hover:bg-surface-2"
            >
              {emoji}
            </button>
          ))
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPicking(true)}
              aria-label="Add reaction"
              className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
            >
              <Icon name="sparkle" size={11} />
            </button>
            {onOpenThread && (
              <button
                type="button"
                onClick={() => onOpenThread(message.id)}
                aria-label="Reply in thread"
                className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
              >
                <Icon name="corner-down-left" size={11} />
              </button>
            )}
            {mine && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit message"
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
                >
                  <Icon name="text" size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => removeMessage(message.id)}
                  aria-label="Delete message"
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
                >
                  <Icon name="trash" size={11} />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A shared project, rendered live from the store — the same trick as board
 * cards. Share a doc in chat and the card reflects the doc, not a snapshot of
 * how it looked when someone pasted it.
 */
function ProjectCard({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const router = useRouter();

  if (!project)
    return (
      <p className="mt-1.5 text-meta text-fg-subtle">
        That project was deleted.
      </p>
    );

  const meta = KINDS[project.kind];

  return (
    <button
      type="button"
      onClick={() => router.push(`/p/${project.id}`)}
      /* Case 2 of the container rule: its own name, its own address. It keeps
         the border and loses the fill — the canvas shows through, and
         `hover:bg-surface` is feedback rather than a state. The icon tile
         inside it loses its border, because nothing bordered sits inside
         something bordered. */
      className="group/att mt-2 flex w-full max-w-[420px] items-start gap-2.5 rounded-md border border-line p-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-sm text-fg-muted">
        <Icon name={meta.icon} size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {/* text-body, not text-object, and the difference is the point:
              this card sits INSIDE a message, so a 15px name would make an
              attachment louder than the sentence carrying it. The same object
              on /library is that page's subject and gets text-object. Rank is
              relative to what a thing is inside. */}
          <span className="truncate text-body text-fg">{project.name}</span>
          <span className="flex shrink-0 items-center gap-1 text-meta text-fg-subtle">
            <span className="size-1 rounded-full bg-current" />
            live
          </span>
        </span>
        <span className="mt-0.5 block truncate text-meta text-fg-muted">
          {firstLine(project, 90)}
        </span>
        <span className="mt-1 block text-meta text-fg-subtle">
          {meta.label} · {projectSummary(project)}
        </span>
      </span>
      <Icon
        name="arrow-right"
        size={12}
        className="mt-1 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/att:opacity-100"
      />
    </button>
  );
}

function shortTime(ts: number): string {
  return formatTime(ts);
}
