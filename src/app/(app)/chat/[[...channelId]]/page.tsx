"use client";

/**
 * Chat. An optional-catch-all route so `/chat` picks the most recent channel
 * and `/chat/<id>` opens a specific one — no redirect flash either way.
 *
 * The page carries its own room list now (`RoomsRail`), because the sidebar
 * that used to hold it is a nav column for the whole product and is a closed
 * drawer below 1024px — which left chat on a phone with no way to reach a
 * second conversation. The rail draws in every state, including the one where
 * there is no conversation at all.
 *
 * THE TOP BAR IS THREE THINGS, NOT FIVE. The avatar stack, a bordered "N
 * members" button beside it and a bordered gear made three objects and two
 * boxes out of one question — who is in here — with the faces already
 * answering it. The stack IS the button now: same click, same message, same
 * count, and the count keeps the `sm:` it always had so a phone still shows
 * faces alone. The gear is a bare icon like the sidebar toggle two columns to
 * its left; a button in a bar is not an input, not an object with an address
 * and not a floating layer, so it gets no border under the container rule.
 *
 * The thread panel keeps exactly one line: the `border-l` between it and the
 * conversation, which is a split between two regions that scroll
 * independently. Its two internal `border-b`s are gone — space separates the
 * head from the parent message and the parent from the replies, and a rule
 * that could have been a gap was never earning the ink.
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
import { RoomsRail } from "@/components/chat/RoomsRail";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

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

  /*
   * Computed for whatever is open, or empty when nothing is.
   *
   * There used to be an early return above this for the no-channel case, which
   * meant the rail could not be drawn in the one state where it matters most:
   * a workspace with nothing in it needs the "+" and "message someone" more
   * than a workspace full of rooms does. Now the page always renders its
   * chrome and the conversation half is what changes.
   */
  const others = active
    ? active.memberIds.filter((id) => id !== LOCAL_USER.id)
    : [];
  const parent = threadId ? messages.find((m) => m.id === threadId) : null;

  return (
    <>
      <TopBar
        right={
          active ? (
          <div className="flex items-center gap-2">
            {/* One control, not two objects and a border between them. The
                faces were already the answer to "who is in here"; the words
                beside them are the same fact spelled out, and they keep the
                `sm:` they have always had so a phone shows the stack alone. */}
            <button
              type="button"
              onClick={() => {
                const count = channelMessages(messages, active.id).length;
                notify(`${count} message${count === 1 ? "" : "s"} in this channel`);
              }}
              aria-label={`${others.length + 1} members`}
              className="flex items-center gap-2 rounded-sm text-fg-subtle transition-colors hover:text-fg"
            >
              <span className="flex -space-x-1.5">
                {others.slice(0, 4).map((id) => {
                  const person = personById(id);
                  return (
                    <span
                      key={id}
                      title={person.name}
                      className="grid size-6 place-items-center rounded-full border-2 border-canvas text-meta"
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
              </span>
              {/* The words stand down for the faces, and only while there
                  are faces: a channel you just made holds you alone, and
                  hiding both would leave a focusable button with nothing in
                  it on a phone. Before this the words were `hidden sm:block`
                  outright, so that room had no members control below 640px at
                  all — this keeps the one it had and gives the phone the one
                  it did not. */}
              <span
                className={cn("text-meta", others.length > 0 && "hidden sm:block")}
              >
                {others.length + 1} members
              </span>
            </button>
            {active.kind !== "ai" && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Channel settings"
                title="Channel settings"
                className="rounded-sm p-1.5 text-fg-subtle transition-colors hover:text-fg"
              >
                <Icon name="settings" size={12} />
              </button>
            )}
          </div>
          ) : undefined
        }
      >
        {active ? (
          <>
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
            <span className="truncate text-object text-fg">
              {active.kind === "channel" ? `#${active.name}` : active.name}
            </span>
            {active.topic && (
              <span className="hidden min-w-0 truncate text-body text-fg-subtle md:block">
                {active.topic}
              </span>
            )}
          </>
        ) : (
          <span className="text-object text-fg">Chat</span>
        )}
      </TopBar>

      {settingsOpen && active && (
        <ChannelSettings channel={active} onClose={() => setSettingsOpen(false)} />
      )}

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <RoomsRail activeId={active?.id} />

        {!active ? (
          <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
            <p className="text-body text-fg-subtle">
              {hydrated ? "No conversations yet." : ""}
            </p>
          </div>
        ) : locked ? (
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

        {parent && active && active.kind !== "ai" && (
          <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line lg:flex">
            <div className="flex items-center gap-2 px-3 pt-3 pb-(--space-2)">
              <span className="text-meta text-fg-subtle">Thread</span>
              <span className="ml-auto text-meta text-fg-subtle">
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

            {/* The message the thread hangs off, and then the replies. What
                separates them is `--space-4` of air rather than the hairline
                that used to sit here: a gap that size does the same job, and a
                rule and a gap doing one job is one of them wasted. */}
            <div className="px-4 pb-(--space-4)">
              <p className="mb-(--space-1) text-meta text-fg-subtle">
                {personById(parent.authorId).name}
              </p>
              <p className="text-body text-fg-muted">{parent.body}</p>
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

      {/* Mobile: the thread takes the whole screen.

          This header keeps the `border-b` its desktop twin gave up, and the
          difference is structural rather than an oversight: the aside has a
          `border-l` telling you it is a separate region, and this layer has no
          edge of its own — it is painted over the whole page, so the line is
          its ceiling, which is one of the three places a rule is allowed. */}
      {parent && active && (
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
            <span className="text-meta text-fg-subtle">Thread</span>
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
      {active && <UnreadSync channelId={active.id} readAt={readAt[active.id]} />}
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
