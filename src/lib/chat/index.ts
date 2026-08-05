"use client";

/**
 * Chat state and the provider binding.
 *
 * Messages and channels persist locally; read state is per-device (it's about
 * this person's attention, not the conversation). Swap the transport with
 * `setChatProvider` — a websocket client implementing the same four methods
 * needs no component change.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useSyncExternalStore } from "react";
import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { PEERS } from "../realtime/mock";
import type { Collaborator } from "../types";
import { createMockChatProvider } from "./mock";
import { AI_PERSON, SEED_CHANNELS, SEED_MESSAGES } from "./seed";
import type {
  Channel,
  ChannelAccess,
  ChatProvider,
  Message,
  MessageAttachment,
} from "./types";

export type {
  Channel,
  FileAttachment,
  Message,
  MessageAttachment,
  ProjectAttachment,
} from "./types";

/** Everyone who can appear in a conversation. */
/** Everyone a message can be from, including the assistant. */
export const PEOPLE: Collaborator[] = [LOCAL_USER, ...PEERS, AI_PERSON];

/** Just the people — for mentions, membership and anything social. */
export const HUMANS: Collaborator[] = [LOCAL_USER, ...PEERS];

export const personById = (id: string): Collaborator =>
  PEOPLE.find((p) => p.id === id) ?? {
    id,
    name: "Unknown",
    initials: "??",
    color: "#8a8a8a",
  };

interface ChatState {
  channels: Channel[];
  messages: Message[];
  /** channelId → last-read timestamp. */
  readAt: Record<string, number>;
  /**
   * Closed channels this browser has entered the passcode for. Local, because
   * the latch is local — see the note on `Channel.passcodeHash`.
   */
  unlocked: string[];
  /** channelId → user ids currently typing. Never persisted. */
  typing: Record<string, string[]>;
  connected: boolean;

  connect: () => Promise<void>;
  disconnect: () => void;

  send: (
    channelId: string,
    body: string,
    options?: { parentId?: string; attachments?: MessageAttachment[] },
  ) => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  editMessage: (messageId: string, body: string) => void;
  removeMessage: (messageId: string) => void;
  createChannel: (
    name: string,
    topic?: string,
    options?: { access?: ChannelAccess; passcode?: string; memberIds?: string[] },
  ) => Promise<string>;
  openDM: (userId: string) => string;
  markRead: (channelId: string) => void;
  setTyping: (channelId: string, typing: boolean) => void;

  updateChannel: (channelId: string, patch: Partial<Channel>) => void;
  /** Pass null to remove the passcode and re-open the channel. */
  setPasscode: (channelId: string, passcode: string | null) => Promise<void>;
  /** Returns false on a wrong code rather than throwing. */
  unlockChannel: (channelId: string, passcode: string) => Promise<boolean>;
  lockChannel: (channelId: string) => void;
  rotateInvite: (channelId: string) => string;
  addMembers: (channelId: string, userIds: string[]) => void;
  removeMember: (channelId: string, userId: string) => void;
  leaveChannel: (channelId: string) => void;
  setArchived: (channelId: string, archived: boolean) => void;
}

/**
 * SHA-256 via the platform. Async because SubtleCrypto is, and worth it: a
 * passcode should not sit in localStorage in the clear even when the thing it
 * guards is readable anyway.
 */
async function hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Whether the local user can read a channel right now. */
export function canOpen(channel: Channel, unlocked: string[]): boolean {
  if (channel.access !== "closed" || !channel.passcodeHash) return true;
  if (channel.createdBy === LOCAL_USER.id) return true;
  return unlocked.includes(channel.id);
}

let provider: ChatProvider = createMockChatProvider();

export function setChatProvider(next: ChatProvider) {
  provider.disconnect();
  provider = next;
}

export function chatProviderName() {
  return provider.name;
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      channels: SEED_CHANNELS,
      messages: SEED_MESSAGES,
      readAt: {},
      unlocked: [],
      typing: {},
      connected: false,

      connect: async () => {
        if (get().connected) return;
        const snapshot = await provider.connect({
          onMessage: (message) =>
            set((s) =>
              s.messages.some((m) => m.id === message.id)
                ? s
                : { messages: [...s.messages, message] },
            ),
          onTyping: (channelId, userId, typing) =>
            set((s) => {
              const current = s.typing[channelId] ?? [];
              const next = typing
                ? current.includes(userId)
                  ? current
                  : [...current, userId]
                : current.filter((id) => id !== userId);
              return { typing: { ...s.typing, [channelId]: next } };
            }),
        });

        // Merge rather than replace: locally-sent messages and channels made
        // in an earlier session must survive a reconnect.
        set((s) => {
          const known = new Set(s.messages.map((m) => m.id));
          const knownChannels = new Set(s.channels.map((c) => c.id));
          return {
            connected: true,
            messages: [
              ...s.messages,
              ...snapshot.messages.filter((m) => !known.has(m.id)),
            ].sort((a, b) => a.at - b.at),
            channels: [
              ...s.channels,
              ...snapshot.channels.filter((c) => !knownChannels.has(c.id)),
            ],
          };
        });
      },

      disconnect: () => {
        provider.disconnect();
        set({ connected: false, typing: {} });
      },

      send: (channelId, body, options) => {
        const text = body.trim();
        if (!text && !options?.attachments?.length) return;

        const message: Message = {
          id: uid(),
          channelId,
          authorId: LOCAL_USER.id,
          body: text,
          at: Date.now(),
          parentId: options?.parentId,
          attachments: options?.attachments,
          pending: true,
        };

        // Optimistic: your own message appears instantly, then settles.
        set((s) => ({
          messages: [...s.messages, message],
          readAt: { ...s.readAt, [channelId]: message.at },
        }));

        void provider.send(message).then((confirmed) =>
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === message.id ? { ...confirmed, pending: false } : m,
            ),
          })),
        );
      },

      toggleReaction: (messageId, emoji) =>
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id !== messageId) return m;
            const current = m.reactions?.[emoji] ?? [];
            const mine = current.includes(LOCAL_USER.id);
            const next = mine
              ? current.filter((id) => id !== LOCAL_USER.id)
              : [...current, LOCAL_USER.id];
            const reactions = { ...m.reactions, [emoji]: next };
            if (next.length === 0) delete reactions[emoji];
            return { ...m, reactions };
          }),
        })),

      editMessage: (messageId, body) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId && m.authorId === LOCAL_USER.id
              ? { ...m, body, editedAt: Date.now() }
              : m,
          ),
        })),

      removeMessage: (messageId) =>
        set((s) => ({
          // Replies go with their parent — an orphaned thread is worse than
          // no thread.
          messages: s.messages.filter(
            (m) => m.id !== messageId && m.parentId !== messageId,
          ),
        })),

      updateChannel: (channelId, patch) =>
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId ? { ...c, ...patch, id: c.id } : c,
          ),
        })),

      setPasscode: async (channelId, passcode) => {
        const passcodeHash = passcode ? await hash(passcode) : undefined;
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId
              ? {
                  ...c,
                  access: passcode ? "closed" : "open",
                  passcodeHash,
                }
              : c,
          ),
          // Setting a code shouldn't lock out the person setting it.
          unlocked: passcode
            ? [...new Set([...s.unlocked, channelId])]
            : s.unlocked.filter((id) => id !== channelId),
        }));
      },

      unlockChannel: async (channelId, passcode) => {
        const channel = get().channels.find((c) => c.id === channelId);
        if (!channel?.passcodeHash) return true;
        if ((await hash(passcode)) !== channel.passcodeHash) return false;
        set((s) => ({ unlocked: [...new Set([...s.unlocked, channelId])] }));
        return true;
      },

      lockChannel: (channelId) =>
        set((s) => ({ unlocked: s.unlocked.filter((id) => id !== channelId) })),

      rotateInvite: (channelId) => {
        const token = uid() + uid();
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId
              ? { ...c, invite: { token, createdAt: Date.now() } }
              : c,
          ),
        }));
        return token;
      },

      addMembers: (channelId, userIds) =>
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId
              ? { ...c, memberIds: [...new Set([...c.memberIds, ...userIds])] }
              : c,
          ),
        })),

      removeMember: (channelId, userId) =>
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId
              ? { ...c, memberIds: c.memberIds.filter((id) => id !== userId) }
              : c,
          ),
        })),

      leaveChannel: (channelId) =>
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId
              ? {
                  ...c,
                  memberIds: c.memberIds.filter((id) => id !== LOCAL_USER.id),
                }
              : c,
          ),
          // Leaving drops the latch too, so re-joining asks again.
          unlocked: s.unlocked.filter((id) => id !== channelId),
        })),

      setArchived: (channelId, archived) =>
        set((s) => ({
          channels: s.channels.map((c) =>
            c.id === channelId ? { ...c, archived } : c,
          ),
        })),

      createChannel: async (name, topic, options) => {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const existing = get().channels.find(
          (c) => c.kind === "channel" && c.name === slug,
        );
        if (existing) return existing.id;

        const channel = await provider.createChannel({
          id: uid(),
          kind: "channel",
          name: slug || "channel",
          topic,
          createdBy: LOCAL_USER.id,
          access: options?.passcode ? "closed" : "open",
          passcodeHash: options?.passcode
            ? await hash(options.passcode)
            : undefined,
          // People, not the assistant — it belongs to its own channel, and
          // adding it here would inflate every new channel's member count.
          memberIds:
            options?.memberIds ?? HUMANS.map((p) => p.id),
        });
        set((s) => ({
          channels: [...s.channels, channel],
          unlocked: options?.passcode
            ? [...new Set([...s.unlocked, channel.id])]
            : s.unlocked,
        }));
        return channel.id;
      },

      openDM: (userId) => {
        const existing = get().channels.find(
          (c) => c.kind === "dm" && c.memberIds.includes(userId),
        );
        if (existing) return existing.id;

        const channel: Channel = {
          id: uid(),
          kind: "dm",
          name: personById(userId).name,
          memberIds: [LOCAL_USER.id, userId],
          createdAt: Date.now(),
        };
        set((s) => ({ channels: [...s.channels, channel] }));
        return channel.id;
      },

      markRead: (channelId) =>
        set((s) => ({ readAt: { ...s.readAt, [channelId]: Date.now() } })),

      setTyping: (channelId, typing) => provider.setTyping(channelId, typing),
    }),
    {
      name: "assignments:chat:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        channels: s.channels,
        messages: s.messages,
        readAt: s.readAt,
        unlocked: s.unlocked,
      }),
      skipHydration: true,
    },
  ),
);

/* ── Selectors ──────────────────────────────────────────── */

/** Top-level messages in a channel, oldest first. Replies are excluded. */
export function channelMessages(messages: Message[], channelId: string) {
  return messages
    .filter((m) => m.channelId === channelId && !m.parentId)
    .sort((a, b) => a.at - b.at);
}

export function threadReplies(messages: Message[], parentId: string) {
  return messages.filter((m) => m.parentId === parentId).sort((a, b) => a.at - b.at);
}

/** Messages since you last looked, excluding your own. */
export function unreadCount(
  messages: Message[],
  channelId: string,
  readAt: number | undefined,
): number {
  const since = readAt ?? 0;
  return messages.filter(
    (m) =>
      m.channelId === channelId &&
      m.at > since &&
      m.authorId !== LOCAL_USER.id,
  ).length;
}

export function lastActivity(messages: Message[], channelId: string): number {
  let latest = 0;
  for (const m of messages)
    if (m.channelId === channelId && m.at > latest) latest = m.at;
  return latest;
}

/* ── Hydration + connection ─────────────────────────────── */

let rehydrateRequested = false;

export function useChatHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (cb) => useChat.persist.onFinishHydration(cb),
    () => useChat.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useChat.persist.rehydrate();
  }, []);

  const connect = useChat((s) => s.connect);
  useEffect(() => {
    if (hydrated) void connect();
  }, [hydrated, connect]);

  return hydrated;
}
