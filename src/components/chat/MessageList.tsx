"use client";

/**
 * The message list.
 *
 * Consecutive messages from one person inside a few minutes collapse into a
 * group with a single avatar — the thing that makes a channel readable rather
 * than a wall of repeated names.
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
import type { Message } from "@/lib/chat";

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
        <p className="py-10 text-center text-[13px] text-fg-subtle">
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
        <p className="anim-fade px-1 pt-2 font-mono text-[10.5px] text-fg-subtle">
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
      <div className="w-7 shrink-0 pt-0.5">
        {grouped ? (
          <time
            dateTime={new Date(message.at).toISOString()}
            suppressHydrationWarning
            className="hidden pt-1 text-right font-mono text-[9px] text-fg-subtle group-hover/msg:block"
          >
            {shortTime(message.at)}
          </time>
        ) : (
          <span
            className="grid size-7 place-items-center rounded-full font-mono text-[9.5px] font-medium"
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
            <span className="text-[12.5px] font-medium text-fg">{author.name}</span>
            <time
              dateTime={new Date(message.at).toISOString()}
              suppressHydrationWarning
              className="font-mono text-[9.5px] text-fg-subtle"
            >
              {shortTime(message.at)}
            </time>
            {message.pending && (
              <span className="font-mono text-[9px] text-fg-subtle">sending…</span>
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
              className="w-full resize-none rounded-sm border border-accent bg-surface-2 px-2.5 py-2 text-[13px] text-fg outline-none"
            />
            <span className="font-mono text-[9.5px] text-fg-subtle">
              ↵ save · esc cancel
            </span>
          </div>
        ) : (
          message.body && (
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">
              {message.body}
              {message.editedAt && (
                <span className="ml-1.5 font-mono text-[9px] text-fg-subtle">
                  (edited)
                </span>
              )}
            </p>
          )
        )}

        {message.attachments?.map((a, i) => (
          <ProjectAttachment key={i} projectId={a.projectId} />
        ))}

        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(message.id, emoji)}
                title={users.map((u) => personById(u).name).join(", ")}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors duration-150",
                  users.includes(LOCAL_USER.id)
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line text-fg-muted hover:border-line-strong",
                )}
              >
                {emoji}
                <span className="font-mono text-[9.5px]">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {replies > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message.id)}
            className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-accent transition-opacity hover:opacity-80"
          >
            <Icon name="corner-down-left" size={11} />
            {replies} {replies === 1 ? "reply" : "replies"}
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
              className="rounded-xs px-1 py-0.5 text-[13px] transition-colors hover:bg-surface-2"
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
function ProjectAttachment({ projectId }: { projectId: string }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const router = useRouter();

  if (!project)
    return (
      <p className="mt-1.5 rounded-sm border border-dashed border-line px-2.5 py-2 text-[11.5px] text-fg-subtle">
        That project was deleted.
      </p>
    );

  const meta = KINDS[project.kind];

  return (
    <button
      type="button"
      onClick={() => router.push(`/p/${project.id}`)}
      className="group/att mt-2 flex w-full max-w-[420px] items-start gap-2.5 rounded-md border border-line bg-surface p-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-sm border border-line text-fg-muted">
        <Icon name={meta.icon} size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-fg">
            {project.name}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] text-accent">
            <span className="size-1 rounded-full bg-accent" />
            live
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
          {firstLine(project, 90)}
        </span>
        <span className="mt-1 block font-mono text-[9.5px] text-fg-subtle">
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
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
