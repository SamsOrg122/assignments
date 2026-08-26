"use client";

/**
 * One handler set for a room's menu, wherever it is opened from.
 *
 * Its two callers are the sidebar's recent list
 * (`src/components/shell/Sidebar.tsx`) and the rooms rail on `/chat`. The menu
 * used to be a closure inside the sidebar, which is why the rail could not
 * have it: the sidebar is the only place a channel could be archived, given an
 * invite link, or left, and below 1024px the sidebar is a drawer nobody opens
 * to administer a room. Now the same six actions come out of one place, so the
 * two surfaces cannot drift into offering different menus for the same room —
 * which is the failure `useProjectActions` was written to end for projects.
 *
 * Shaped like `useProjectActions`: a caller renders `dialogs` once and calls
 * `actionsFor(id)` when a menu opens. The one difference is that this returns
 * the finished `MenuItem[]` rather than a callback bag for a separate builder,
 * because channels have no `lib/channel-menu.ts` twin to hand it to — there is
 * one builder and it is here.
 *
 *   const rooms = useChannelActions({ onNavigate: closeOnMobile });
 *   <li onContextMenu={(e) => menu.open(e, rooms.actionsFor(id))}>…</li>
 *   {rooms.dialogs}
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/lib/chat";
import { useUI } from "@/lib/ui-store";
import type { MenuItem } from "@/components/ui/Menu";
import { ChannelSettings } from "./ChannelSettings";

export function useChannelActions(options?: { onNavigate?: () => void }): {
  actionsFor: (channelId: string) => MenuItem[];
  dialogs: React.ReactNode;
} {
  const router = useRouter();
  const channels = useChat((s) => s.channels);

  const [settingsFor, setSettingsFor] = useState<string | null>(null);

  /*
   * Held as an id and read back from the store, the same way
   * `useProjectActions` holds a project id.
   *
   * The row that opened the menu is a snapshot: renaming a channel from
   * inside the settings panel, or archiving it, drops it out of the list that
   * was rendered when the menu opened. Capturing the object would leave the
   * panel editing a copy of a channel that no longer exists as drawn.
   */
  const settingsChannel = channels.find((c) => c.id === settingsFor) ?? null;

  const actionsFor = (channelId: string): MenuItem[] => {
    const chat = useChat.getState();
    const channel = chat.channels.find((c) => c.id === channelId);
    if (!channel) return [];

    const notify = useUI.getState().notify;
    const dm = channel.kind === "dm";
    /*
     * The assistant is a channel in the store and nothing like one on screen.
     *
     * It has no members to invite, nobody to leave behind, and archiving it
     * would take the only pointer to it out of the sidebar for a restore
     * that lives inside the menu that just disappeared. It gets the two items
     * that mean something and no more — which is still two more than it had,
     * because as a nav row it had no menu at all.
     */
    const ai = channel.kind === "ai";
    /** Re-read at the moment the item is chosen, never from the closure. */
    const live = () => useChat.getState().channels.find((c) => c.id === channelId);

    const items: MenuItem[] = [
      {
        kind: "item",
        label: "Open",
        icon: "arrow-right",
        onSelect: () => {
          options?.onNavigate?.();
          router.push(`/chat/${channelId}`);
        },
      },
      {
        kind: "item",
        label: "Mark as read",
        icon: "check",
        onSelect: () => useChat.getState().markRead(channelId),
      },
    ];

    if (ai) return items;

    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      // The panel titles itself "Conversation" for a direct message and says
      // there is nothing in it but membership; calling the item "Settings…"
      // promises a screen of switches that a DM does not have.
      label: dm ? "Conversation…" : "Settings…",
      icon: "settings",
      onSelect: () => setSettingsFor(channelId),
    });

    /*
     * There is no "invite link" row here any more, and its absence is the
     * point. It minted `/chat/<id>?join=<token>` and nothing in this codebase
     * has ever read a `join` query parameter — the link opened the channel for
     * somebody who could already see it and did nothing for anybody else. It
     * sat in a menu labelled as the way to get a person into a room.
     *
     * A channel is not a workspace, so the workspace invite that now exists is
     * not a drop-in replacement: it puts somebody in the whole team, not in
     * one room. The honest thing a menu can say is where the real door is,
     * which is what the settings panel does — a row that quietly did nothing
     * would just move the problem.
     */

    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      label: channel.archived ? "Restore" : "Archive",
      icon: "history",
      onSelect: () => {
        const now = live();
        if (!now) return;
        useChat.getState().setArchived(channelId, !now.archived);
      },
    });

    /*
     * Leaving is a channel action only.
     *
     * `leaveChannel` takes you out of `memberIds`, but `openDM` finds an
     * existing conversation by the *other* person's id — so a "left" DM comes
     * straight back the next time anyone messages that person, with its
     * history intact and you no longer listed in it. Archive is the honest
     * verb for a two-person conversation, and it is right above this.
     */
    if (!dm) {
      items.push({
        kind: "item",
        label: "Leave",
        icon: "x",
        danger: true,
        onSelect: () => {
          const now = live();
          if (!now) return;
          useChat.getState().leaveChannel(channelId);
          notify(`You left #${now.name}`);
        },
      });
    }

    return items;
  };

  const dialogs = settingsChannel ? (
    <ChannelSettings
      channel={settingsChannel}
      onClose={() => setSettingsFor(null)}
    />
  ) : null;

  return { actionsFor, dialogs };
}
