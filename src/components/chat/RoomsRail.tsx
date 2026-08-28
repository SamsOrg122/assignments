"use client";

/**
 * Every room you have, beside the one you are in.
 *
 * The sidebar used to carry the channel list, the DM list and the two "+"
 * buttons that fed them. It is a nav column for the whole product and chat was
 * borrowing it, which meant the rooms disappeared the moment somebody closed
 * the drawer — and below 1024px the drawer is closed by default, so on a phone
 * chat had no room list at all. It lives here now, on the page it belongs to,
 * where it is a column on a desktop and the first thing above the messages on
 * a phone.
 *
 * Nothing the sidebar had is missing: the assistant, the channels of the
 * current scope with their unread counts, the six-item row menu (from
 * `useChannelActions`, shared with the sidebar's recent list so the two can
 * never offer different actions for the same room), the inline "new channel"
 * field, and the direct messages. Two things are here that were nowhere: a
 * visible way to start a DM, and a way back to an archived room that does not
 * need the command palette.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  lastActivity,
  personById,
  unreadCount,
  useChat,
  type Channel,
} from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useHasTeam, useScope } from "@/lib/scope";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useMenu } from "@/components/ui/Menu";
import { RowMenuButton } from "@/components/ui/RowMenuButton";
import { Friends } from "@/components/social/Friends";
import { useChannelActions } from "./useChannelActions";
import { PeoplePicker } from "./PeoplePicker";

export function RoomsRail({ activeId }: { activeId?: string | null }) {
  const router = useRouter();
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages);
  const readAt = useChat((s) => s.readAt);
  const createChannel = useChat((s) => s.createChannel);
  const openDM = useChat((s) => s.openDM);
  const setArchived = useChat((s) => s.setArchived);

  const menu = useMenu();
  const rowActions = useChannelActions();

  const [creating, setCreating] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [picking, setPicking] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  /*
   * The same downgrade the page makes a few lines away, written the same way:
   * without a team there is no team world, and every scope switch in the
   * product is hidden when `hasTeam` is false — but the choice persists, so
   * the store can still say "team" with nothing behind it. Derived here rather
   * than taken as a prop so the rail is whole on its own; both are the same
   * pure function of the same two stores, so the list and the page's landing
   * pick cannot disagree about which world you are in.
   */
  const chosenScope = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  const world = hasTeam ? chosenScope : "personal";
  const teamless = chosenScope === "team" && !hasTeam;

  const { assistant, rooms, dms, archived, roomCount, messageCount } = useMemo(() => {
    const meta = channels.map((channel) => ({
      channel,
      unread: unreadCount(messages, channel.id, readAt[channel.id]),
      // A room nobody has spoken in yet has no last activity. Falling back to
      // when it was made keeps a channel created thirty seconds ago above one
      // that has been silent since January, rather than at the very bottom.
      at: lastActivity(messages, channel.id) || channel.createdAt,
    }));

    /** Unread first, then most recent. One rule for every list on the rail. */
    const byAttention = (
      a: { unread: number; at: number },
      b: { unread: number; at: number },
    ) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || b.at - a.at;

    /** DMs and the assistant belong to no world; channels belong to one. */
    const mine = (c: Channel) =>
      c.kind !== "channel" || (c.scope ?? "personal") === world;

    const assistantRow = meta.find((m) => m.channel.kind === "ai") ?? null;
    const openRooms = meta
      .filter(
        (m) =>
          m.channel.kind === "channel" && !m.channel.archived && mine(m.channel),
      )
      .sort(byAttention);
    const direct = meta
      .filter((m) => m.channel.kind === "dm" && !m.channel.archived)
      .sort(byAttention);
    const stowed = meta
      .filter((m) => m.channel.archived && mine(m.channel))
      .sort(byAttention);

    const listed = assistantRow
      ? [assistantRow, ...openRooms, ...direct]
      : [...openRooms, ...direct];
    const listedIds = new Set(listed.map((m) => m.channel.id));

    return {
      assistant: assistantRow,
      rooms: openRooms,
      dms: direct,
      archived: stowed,
      roomCount: listed.length,
      // Counted over the rooms this rail is showing, so the number answers
      // "how much is in here" rather than "how much is in the database".
      messageCount: messages.filter((m) => listedIds.has(m.channelId)).length,
    };
  }, [channels, messages, readAt, world]);

  /*
   * Somebody who followed a link into an archived room is *in* it, so the
   * section holding its row opens with the page rather than leaving the rail
   * with nothing selected. Opened ONCE, rather than derived: `showArchived ||
   * activeIsArchived` made the toggle inert for as long as you stayed in that
   * room — and archiving the room you are reading is the commonest way into
   * this section, so the control you reached for did nothing.
   */
  const activeIsArchived = archived.some((m) => m.channel.id === activeId);
  useEffect(() => {
    // Off the effect body, as everything that sets state on mount is here.
    if (activeIsArchived)
      void Promise.resolve().then(() => setShowArchived(true));
  }, [activeIsArchived]);
  const archivedOpen = showArchived;

  const openMenuFor = (channelId: string) => (event: React.MouseEvent) =>
    menu.open(event, rowActions.actionsFor(channelId));

  const submitChannel = async () => {
    const name = channelName.trim();
    if (!name) return;
    const id = await createChannel(name, undefined, { scope: world });
    setCreating(false);
    setChannelName("");
    router.push(`/chat/${id}`);
  };

  const cancelChannel = () => {
    setCreating(false);
    setChannelName("");
  };

  return (
    <aside
      aria-label="Rooms"
      className={cn(
        "flex shrink-0 flex-col border-line bg-canvas",
        // A column beside the conversation on a desktop; above it on a phone,
        // capped so the messages are still the bigger half of the screen.
        "max-h-[42vh] w-full border-b",
        "lg:max-h-none lg:w-[236px] lg:border-r lg:border-b-0",
      )}
    >
      {menu.node}
      {rowActions.dialogs}

      {picking && (
        <PeoplePicker
          onPick={(personId) =>
            void openDM(personId).then((id) => router.push(`/chat/${id}`))
          }
          onClose={() => setPicking(false)}
        />
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
        {/* The assistant, pinned. It is the one room a brand-new workspace
            ships with, so it is the one row that is never empty — and the
            only thing on this rail that stays put whatever the scope says. */}
        {assistant && (
          <ul className="flex flex-col gap-0.5 px-2">
            <RoomRow
              channel={assistant.channel}
              label={t("nav.assistant")}
              icon="sparkle"
              unread={assistant.unread}
              active={assistant.channel.id === activeId}
              onOpenMenu={openMenuFor(assistant.channel.id)}
            />
          </ul>
        )}

        <div className="mt-3 mb-1 flex items-center justify-between px-4">
          <span className="label-mono">
            {world === "team" ? t("nav.channels") : t("nav.chats")}
          </span>
          <button
            type="button"
            disabled={teamless}
            onClick={() => setCreating(true)}
            aria-label={
              teamless ? "New channel — needs a team first" : "New channel"
            }
            title={teamless ? "Channels need a team first" : "New channel"}
            className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg disabled:opacity-40"
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        {teamless && (
          /* The switch says team and there is no team behind it, so the rooms
             below are your own. Saying so beats a list that looks as though it
             has lost something. */
          <div className="mb-1 px-4">
            <p className="text-[11px] leading-relaxed text-fg-subtle">
              No team yet — the rooms below are your own.
            </p>
            {/* The two doors the sidebar's team panel used to carry. They are
                on /library and /more as well, but this is the screen where
                somebody meets the disabled "+", so this is where the way out
                of it belongs. */}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Link
                href="/pricing"
                className="rounded-sm bg-accent px-2 py-1 text-[11.5px] font-medium text-on-accent transition-[filter] hover:brightness-110"
              >
                Create a team
              </Link>
              <Link
                href="/team#join"
                className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Join a team
              </Link>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-0.5 px-2">
          {rooms.map(({ channel, unread }) => (
            <RoomRow
              key={channel.id}
              channel={channel}
              label={`# ${channel.name}`}
              unread={unread}
              active={channel.id === activeId}
              locked={
                channel.access === "closed" && Boolean(channel.passcodeHash)
              }
              onOpenMenu={openMenuFor(channel.id)}
            />
          ))}

          {creating && (
            <li className="px-2 py-1">
              <input
                autoFocus
                value={channelName}
                placeholder="channel-name"
                aria-label="New channel name"
                onChange={(e) => setChannelName(e.target.value)}
                onBlur={cancelChannel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitChannel();
                  else if (e.key === "Escape") cancelChannel();
                }}
                className="w-full rounded-sm border border-accent bg-surface-2 px-2 py-1 text-[12.5px] text-fg outline-none"
              />
            </li>
          )}

          {rooms.length === 0 && !creating && !teamless && (
            <li className="px-2 py-1 text-[11px] leading-relaxed text-fg-subtle">
              {world === "team"
                ? "No channels here yet. Make one with +."
                : "Chats with friends or classmates. Make one with +. Getting somebody into it means having them in your team first — that link is on the team page."}
            </li>
          )}
        </ul>

        <div className="mt-3 mb-1 px-4">
          <span className="label-mono">{t("nav.dms")}</span>
        </div>

        {/*
          * The button this heading has needed since the heading existed.
          *
          * `openDM` shipped with the store and its only caller in the whole
          * product was a command-palette row, so the sidebar advertised a
          * section for something a pointer could not do. Words rather than a
          * bare "+", because this is the one control here that has to be found
          * by somebody who has never started a conversation.
          */}
        <div className="px-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-[var(--ui-row-y)] text-left text-[12.5px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="plus" size={12} className="shrink-0 text-fg-subtle" />
            <span className="truncate">Message someone</span>
          </button>
        </div>

        <ul className="mt-0.5 flex flex-col gap-0.5 px-2">
          {dms.map(({ channel, unread }) => {
            const other = channel.memberIds.find((id) => id !== LOCAL_USER.id);
            return (
              <RoomRow
                key={channel.id}
                channel={channel}
                label={channel.name}
                dot={other ? personById(other).color : undefined}
                unread={unread}
                active={channel.id === activeId}
                onOpenMenu={openMenuFor(channel.id)}
              />
            );
          })}
        </ul>

        {/*
          * Who you are connected to, under the conversations with them.
          *
          * It had no home at all: the panel was reachable only inside the
          * "Message someone" dialog, which meant the one screen showing a
          * connection was a screen you had to already be starting a message
          * on — and the join page told everybody who accepted a friend link
          * that their new connection was "in the rail beside your direct
          * messages", which it was not. It is now.
          *
          * Here rather than in the sidebar because a connection is somebody
          * you talk to, and this rail is where talking lives. The sidebar's
          * one list is things you last touched; a person you have never
          * messaged has nothing to sort by.
          */}
        <Friends className="mt-4 px-2" />

        {/* Archiving used to be a one-way door for a pointer: Restore lives in
            the menu on the row, and archiving the row took the row away. The
            filter appears exactly when there is something behind it. */}
        {archived.length > 0 && (
          <>
            <div className="mt-3 mb-1 px-2">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={archivedOpen}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-[var(--ui-row-y)] text-left transition-colors duration-150 hover:bg-surface-2"
              >
                <Icon
                  name={archivedOpen ? "chevron-down" : "chevron-right"}
                  size={11}
                  className="shrink-0 text-fg-subtle"
                />
                <span className="label-mono">Archived</span>
                <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                  {archived.length}
                </span>
              </button>
            </div>

            {archivedOpen && (
              <ul className="flex flex-col gap-0.5 px-2">
                {archived.map(({ channel }) => (
                  <li key={channel.id} className="flex items-center gap-1">
                    <Link
                      href={`/chat/${channel.id}`}
                      onContextMenu={openMenuFor(channel.id)}
                      aria-current={channel.id === activeId ? "page" : undefined}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-md px-2 py-[var(--ui-row-y)] text-[13px] transition-colors duration-150",
                        channel.id === activeId
                          ? "bg-surface-2 text-fg"
                          : "text-fg-subtle hover:bg-surface hover:text-fg",
                      )}
                    >
                      {channel.kind === "channel"
                        ? `# ${channel.name}`
                        : channel.name}
                    </Link>
                    {/* Its own button rather than only the row menu: a list you
                        opened to undo something should not make you open a
                        second thing to undo it. */}
                    <button
                      type="button"
                      onClick={() => setArchived(channel.id, false)}
                      className="shrink-0 rounded-xs px-1.5 py-1 font-mono text-[10px] text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                    >
                      Restore
                    </button>
                    {/* A plain sibling rather than RowMenuButton, which is
                        absolutely positioned for rows that are a single link.
                        Without it this is the one row type on the rail whose
                        menu is right-click only — and below 1024px there is no
                        right-click, so Settings and Leave
                        would have no pointer at all on an archived room. */}
                    <button
                      type="button"
                      onClick={openMenuFor(channel.id)}
                      aria-label={`More for ${channel.name}`}
                      className="shrink-0 rounded-xs px-1 py-1 text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                    >
                      <Icon name="dots" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* What is in here, and the one room that is not yours. The community
          link is unconditional, exactly as its sidebar row was. */}
      <div className="shrink-0 border-t border-line px-3 py-2">
        <p className="flex flex-wrap items-center gap-x-1 font-mono text-[10px] text-fg-subtle">
          <span>
            {roomCount} room{roomCount === 1 ? "" : "s"}
          </span>
          {/* Each segment carries its own leading separator and refuses to
              break inside, so a narrow rail wraps the line without stranding a
              "·" at the end of it. */}
          <span className="whitespace-nowrap">
            · {messageCount} message{messageCount === 1 ? "" : "s"}
          </span>
          <span className="whitespace-nowrap">· {archived.length} archived</span>
          <span className="whitespace-nowrap">
            <span aria-hidden="true">· </span>
            <Link href="/community" className="transition-colors hover:text-fg">
              {t("nav.community").toLowerCase()}
            </Link>
          </span>
        </p>
      </div>
    </aside>
  );
}

function RoomRow({
  channel,
  label,
  icon,
  dot,
  locked,
  unread,
  active,
  onOpenMenu,
}: {
  channel: Channel;
  label: string;
  icon?: IconName;
  /** A person's colour, for a direct message. */
  dot?: string;
  locked?: boolean;
  unread: number;
  active: boolean;
  onOpenMenu: (event: React.MouseEvent) => void;
}) {
  return (
    // The menu button is a sibling of the link, never a child of it: a button
    // inside an anchor is markup browsers disagree about, and the two
    // activations fight each other.
    <li className="group relative">
      <Link
        href={`/chat/${channel.id}`}
        onContextMenu={onOpenMenu}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md py-[var(--ui-row-y)] pr-7 pl-2 text-[13px] transition-colors duration-150",
          active
            ? "bg-surface-2 text-fg"
            : unread > 0
              ? "text-fg hover:bg-surface"
              : "text-fg-muted hover:bg-surface hover:text-fg",
        )}
      >
        {icon && (
          <Icon name={icon} size={12} className="shrink-0 text-fg-subtle" />
        )}
        {locked && (
          <Icon
            name="focus"
            size={10}
            aria-label="Closed group"
            className="shrink-0 text-fg-subtle"
          />
        )}
        {dot && (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        )}
        <span className={cn("truncate", unread > 0 && "font-medium")}>
          {label}
        </span>
        {unread > 0 && (
          <span className="ml-auto grid min-w-[16px] shrink-0 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-on-accent">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <RowMenuButton label={`More for ${label}`} onOpen={onOpenMenu} />
    </li>
  );
}
