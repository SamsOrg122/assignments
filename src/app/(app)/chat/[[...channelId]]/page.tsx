"use client";

/**
 * Chat. An optional-catch-all route so `/chat` picks the most recent channel
 * and `/chat/<id>` opens a specific one — no redirect flash either way.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  channelMessages,
  lastActivity,
  personById,
  threadReplies,
  unreadCount,
  useChat,
  useChatHydrated,
  canOpen,
} from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useHasTeam, useScope } from "@/lib/scope";
import { useUI } from "@/lib/ui-store";
import { TopBar } from "@/components/shell/TopBar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { TeamAssistant } from "@/components/chat/TeamAssistant";
import { ChannelGate } from "@/components/chat/ChannelGate";
import { ChannelSettings } from "@/components/chat/ChannelSettings";
import { Icon } from "@/components/ui/Icon";

export default function ChatPage() {
  const params = useParams<{ channelId?: string[] }>();
  const routeId = params?.channelId?.[0];

  const hydrated = useChatHydrated();
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages);
  const readAt = useChat((s) => s.readAt);
  const notify = useUI((s) => s.notify);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const unlocked = useChat((s) => s.unlocked);

  // The same downgrade the sidebar and the Library make: without a team there
  // is no team world, so the switch cannot strand you in an empty one.
  const chosenScope = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  const world = hasTeam ? chosenScope : "personal";

  /*
   * With no channel in the URL, open whichever has spoken most recently —
   * among the ones the sidebar is actually showing you.
   *
   * The filter applies to the LANDING PICK ONLY, never to the lookup by id.
   * An invite link into an archived room, or a link to a team channel opened
   * while the switch says personal, must still open the room it names; what
   * it must not do is pick that room for you when you asked for no room in
   * particular. Before this, /chat and the installed app's Chat shortcut
   * could drop you into an archived channel, or into the other world.
   */
  const active = useMemo(() => {
    if (routeId) return channels.find((c) => c.id === routeId) ?? null;
    const reachable = channels.filter(
      (c) =>
        !c.archived &&
        (c.kind !== "channel" || (c.scope ?? "personal") === world),
    );
    return (
      [...reachable].sort(
        (a, b) => lastActivity(messages, b.id) - lastActivity(messages, a.id),
      )[0] ?? null
    );
  }, [routeId, channels, messages, world]);

  // Adjust during render rather than in an effect: switching channel must not
  // leave the previous channel's thread open for a frame.
  const [lastChannel, setLastChannel] = useState(active?.id);
  if (lastChannel !== active?.id) {
    setLastChannel(active?.id);
    setThreadId(null);
    setSettingsOpen(false);
  }

  /** A closed channel shows its gate instead of its history. */
  const locked = active ? !canOpen(active, unlocked) : false;

  if (!active) {
    return (
      <>
        <TopBar>
          <span className="text-[13px] font-medium text-fg">Chat</span>
        </TopBar>
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="text-[13px] text-fg-subtle">
            {hydrated ? "No conversations yet." : ""}
          </p>
        </div>
      </>
    );
  }

  const others = active.memberIds.filter((id) => id !== LOCAL_USER.id);
  const parent = threadId ? messages.find((m) => m.id === threadId) : null;

  return (
    <>
      <TopBar
        right={
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {others.slice(0, 4).map((id) => {
                const person = personById(id);
                return (
                  <span
                    key={id}
                    title={person.name}
                    className="grid size-6 place-items-center rounded-full border-2 border-canvas font-mono text-[9px]"
                    style={{
                      background: `${person.color}22`,
                      color: person.color,
                      boxShadow: `inset 0 0 0 1px ${person.color}55`,
                    }}
                  >
                    {person.initials}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                const count = channelMessages(messages, active.id).length;
                notify(`${count} message${count === 1 ? "" : "s"} in this channel`);
              }}
              className="hidden rounded-sm border border-line px-2 py-1 font-mono text-[10px] text-fg-subtle transition-colors hover:text-fg sm:block"
            >
              {others.length + 1} members
            </button>
            {active.kind !== "ai" && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Channel settings"
                title="Channel settings"
                className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
              >
                <Icon name="settings" size={12} />
              </button>
            )}
          </div>
        }
      >
        <Icon
          name={
            active.kind === "ai"
              ? "sparkle"
              : active.kind === "dm"
                ? "users"
                : "board"
          }
          size={13}
          className="shrink-0 text-fg-subtle"
        />
        <span className="truncate text-[13px] font-medium text-fg">
          {active.kind === "channel" ? `#${active.name}` : active.name}
        </span>
        {active.topic && (
          <span className="hidden min-w-0 truncate text-[12px] text-fg-subtle md:block">
            {active.topic}
          </span>
        )}
      </TopBar>

      {settingsOpen && (
        <ChannelSettings channel={active} onClose={() => setSettingsOpen(false)} />
      )}

      <main className="flex min-h-0 flex-1">
        {locked ? (
          <ChannelGate channel={active} />
        ) : active.kind === "ai" ? (
          <TeamAssistant channelId={active.id} />
        ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList channelId={active.id} onOpenThread={setThreadId} />
          </div>
          <Composer
            channelId={active.id}
            placeholder={
              active.kind === "channel"
                ? `Message #${active.name}`
                : `Message ${active.name.split(" ")[0]}`
            }
          />
        </div>
        )}

        {parent && active.kind !== "ai" && (
          <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line lg:flex">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <span className="label-mono">Thread</span>
              <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                {threadReplies(messages, parent.id).length} replies
              </span>
              <button
                type="button"
                onClick={() => setThreadId(null)}
                aria-label="Close thread"
                className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="border-b border-line px-4 py-3">
              <p className="mb-1 font-mono text-[10px] text-fg-subtle">
                {personById(parent.authorId).name}
              </p>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                {parent.body}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <MessageList
                channelId={active.id}
                threadParentId={parent.id}
              />
            </div>

            <Composer
              channelId={active.id}
              parentId={parent.id}
              placeholder="Reply in thread"
            />
          </aside>
        )}
      </main>

      {/* Mobile: the thread takes the whole screen. */}
      {parent && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-canvas lg:hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <button
              type="button"
              onClick={() => setThreadId(null)}
              aria-label="Back"
              className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
            >
              <Icon name="chevron-left" size={14} />
            </button>
            <span className="label-mono">Thread</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList channelId={active.id} threadParentId={parent.id} />
          </div>
          <Composer
            channelId={active.id}
            parentId={parent.id}
            placeholder="Reply in thread"
          />
        </div>
      )}

      {/* Keeps the unread badge honest while the channel is on screen. */}
      <UnreadSync channelId={active.id} readAt={readAt[active.id]} />
    </>
  );
}

function UnreadSync({
  channelId,
  readAt,
}: {
  channelId: string;
  readAt?: number;
}) {
  const messages = useChat((s) => s.messages);
  const markRead = useChat((s) => s.markRead);
  const unread = unreadCount(messages, channelId, readAt);

  // Marking read is a write to an external store, not local state — the
  // channel being on screen *is* the read event.
  useEffect(() => {
    if (unread > 0) markRead(channelId);
  }, [unread, channelId, markRead]);

  return null;
}
