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
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { useEffect, useSyncExternalStore } from "react";
import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { NO_NAME, knownPerson } from "../team";
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

/**
 * The people this file can name on its own: you, and the assistant.
 *
 * It used to be you, the assistant and `PEERS` — Mira Chen, Dev Raman and Ana
 * Silva, the three simulated colleagues from `lib/realtime/mock`, whose own
 * file says that people who don't exist are the most convincing lie a product
 * can tell about itself. They were in `PEOPLE`, so the command palette offered
 * "Message Mira Chen"; they were in `HUMANS`, so every channel you made was
 * born with them in it, every @-mention list offered them, and the mock
 * provider — which replies as a random member of the room — had three mouths
 * to put words in. They are gone from all of it. The demo frame on the landing
 * page still has them, where the point is showing what multiplayer looks like:
 * it takes them straight from `lib/realtime/mock` behind `setSimulatedPeers`,
 * and nothing here is in its way.
 */
export const PEOPLE: Collaborator[] = [LOCAL_USER, AI_PERSON];

/** What a name that isn't one looks like, in one place — see `mentionName`. */
const UNKNOWN = "Unknown";

/**
 * Whoever this id belongs to, named if the app can name them.
 *
 * The rest of the chat UI resolves every id through here — the member list in
 * settings, the author of a message, the dot on a room row — so an id it
 * cannot place used to be printed as "Unknown" with grey "??" initials, real
 * account or not. Since the person picker moved onto the connections table
 * that included your actual friends: their name in the room title, "Unknown"
 * everywhere else in the same room.
 *
 * `knownPerson` is the app's one directory of real accounts (`lib/team`),
 * filled from the workspace roster and the connections table. It is a lookup
 * rather than a registry the picker writes into, because a name read once at
 * the moment somebody was picked is a name that goes stale silently — and
 * because a message list has to name people nobody ever picked. "Unknown"
 * survives only for an id nothing in the app has ever heard of.
 */
export const personById = (id: string): Collaborator =>
  PEOPLE.find((p) => p.id === id) ??
  knownPerson(id) ?? {
    id,
    name: UNKNOWN,
    initials: "??",
    color: "#8a8a8a",
  };

/**
 * What to type to mention somebody, or null when there is nothing to type.
 *
 * A mention is a piece of text a person types at somebody. "@Unknown" reaches
 * nobody, and "@no name yet" is not a name — so an autocomplete offering
 * either is offering a dead end. They are still in the room and still on its
 * member list; they are just not mentionable until the app knows what to call
 * them.
 */
export function mentionName(id: string): string | null {
  const { name } = personById(id);
  return name === UNKNOWN || name === NO_NAME ? null : name;
}

export { AI_USER_ID } from "./seed";

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
    options?: {
      access?: ChannelAccess;
      passcode?: string;
      memberIds?: string[];
      scope?: "personal" | "team";
    },
  ) => Promise<string>;
  openDM: (userId: string) => Promise<string>;
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

/**
 * Swap the mock for the account, once, if there is an account to swap to.
 *
 * Deliberately asked at connect time rather than at module load: whether this
 * can be real depends on a runtime config lookup AND a session, and neither is
 * settled when this file is first evaluated. Asked once — a second call after
 * signing in would need a reconnect, and the store already refuses to connect
 * twice, so signing in mid-session leaves chat local until the next load.
 * That is a real limit and it is written down here rather than papered over.
 *
 * The import is dynamic so that a deployment with no database never pulls the
 * Supabase client into the bundle it serves.
 */
let transportChosen = false;
async function chooseTransport(): Promise<void> {
  if (transportChosen) return;
  transportChosen = true;
  try {
    const real = await import("./supabase");
    if (!(await real.chatCanBeReal())) return;
    setChatProvider(real.createSupabaseChatProvider());
  } catch {
    // No database, no session, or the module failed to load. The mock stays,
    // and it says what it is: conversations kept in this browser.
  }
}

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
        await chooseTransport();
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
          scope: options?.scope ?? "personal",
          name: slug || "channel",
          topic,
          createdBy: LOCAL_USER.id,
          access: options?.passcode ? "closed" : "open",
          passcodeHash: options?.passcode
            ? await hash(options.passcode)
            : undefined,
          // You, and whoever the caller named. A new channel used to be born
          // holding the three simulated colleagues, which put words in their
          // mouths — the mock provider answers as a random member of the room
          // — and printed a membership of four for a workspace of one. Add
          // people from the channel's settings, where the list is the people
          // you are really connected to.
          memberIds: options?.memberIds ?? [LOCAL_USER.id],
        });
        set((s) => ({
          channels: [...s.channels, channel],
          unlocked: options?.passcode
            ? [...new Set([...s.unlocked, channel.id])]
            : s.unlocked,
        }));
        return channel.id;
      },

      /*
       * Asynchronous, and it has to be.
       *
       * Opening a conversation is the one act that puts somebody ELSE in a
       * room, and migration 0017 allows no client to write that row —
       * `open_dm` does it, after checking the two of you are actually
       * connected. So the id can come back different from the one minted
       * here: if you already have a conversation with this person on another
       * device, the server hands back that one rather than making a second
       * empty one. Returning a local id synchronously and correcting it
       * afterwards would strand the navigation that just used it.
       */
      openDM: async (userId) => {
        const existing = get().channels.find(
          (c) => c.kind === "dm" && c.memberIds.includes(userId),
        );
        if (existing) return existing.id;

        const wanted: Channel = {
          id: uid(),
          kind: "dm",
          name: personById(userId).name,
          memberIds: [LOCAL_USER.id, userId],
          createdAt: Date.now(),
        };
        const channel = await provider.createChannel(wanted);
        set((s) =>
          s.channels.some((c) => c.id === channel.id)
            ? s
            : { channels: [...s.channels, channel] },
        );
        return channel.id;
      },

      markRead: (channelId) =>
        set((s) => ({ readAt: { ...s.readAt, [channelId]: Date.now() } })),

      setTyping: (channelId, typing) => provider.setTyping(channelId, typing),
    }),
    {
      ...versioned<ChatState>("assignments:chat:v1", []),
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
