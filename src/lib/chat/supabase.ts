"use client";

/**
 * Chat, over the account, for real.
 *
 * `ChatProvider` was written as a seam — its own file says the four methods
 * are "shaped like a websocket client … so a real server drops in without a
 * component change". This is the thing that drops in. Everything above it is
 * unchanged: the store, the message list, the composer, the rail.
 *
 * What it replaces is `createMockChatProvider`, which keeps every message in
 * this browser's localStorage and answers each one with a fabricated reply
 * from a random member of the room. That was tolerable while the only people
 * in a room were fictional. Since migration 0015 a conversation can hold a
 * real person's real account, and the same behaviour then means a made-up
 * message arriving under somebody's real name.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE AWKWARD THING, and why it is here rather than anywhere else.
 *
 * The store calls the local person `LOCAL_USER.id` — the string "u_self". It
 * has done since before accounts existed, and every component that decides
 * "is this message mine" compares against it: the message list, the room
 * rail's dot, the composer's optimistic row. The database calls the same
 * person a uuid.
 *
 * Rewriting the app to use uuids everywhere would mean rewriting every one of
 * those comparisons AND migrating what is already in people's localStorage,
 * where "u_self" is written into thousands of stored messages. So the
 * translation lives here, in the one file that touches both vocabularies:
 * outgoing, "u_self" becomes the account's uuid; incoming, the account's uuid
 * becomes "u_self". Everybody else's uuid passes through untouched, and
 * `knownPerson` in lib/team resolves it to a name.
 *
 * It is a seam, not a smell: the provider is exactly where a transport
 * translates between what the app calls things and what the wire calls them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "../db/client";
import { currentWorkspaceId } from "../db/supabase";
import { LOCAL_USER } from "../realtime";
import type {
  Channel,
  ChatHandlers,
  ChatProvider,
  ChatSnapshot,
  Message,
  MessageAttachment,
} from "./types";

/**
 * How much history a room opens with.
 *
 * Not "everything": a channel a class has been using for a term is tens of
 * thousands of rows, and pulling all of it to draw the last screenful is a
 * slow open and a large tab. Older messages are still there and still
 * readable — what is missing is a control that asks for them, which is named
 * in the module's own gaps rather than pretended about.
 */
const RECENT = 300;

interface ChannelRow {
  id: string;
  kind: string;
  scope: string;
  workspace_id: string | null;
  name: string;
  topic: string | null;
  description: string | null;
  created_by: string;
  is_private: boolean;
  archived: boolean;
  created_at: string;
}

interface MemberRow {
  channel_id: string;
  user_id: string;
}

interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  attachments: MessageAttachment[] | null;
  reactions: Record<string, string[]> | null;
  at: string;
  edited_at: string | null;
}

/** The signed-in account, or null. Read fresh: a session can end mid-tab. */
async function whoAmI(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export function createSupabaseChatProvider(): ChatProvider {
  const client = supabase();
  let me: string | null = null;
  let handlers: ChatHandlers | null = null;
  /** Live subscriptions, closed on disconnect. */
  const rooms: Array<{ unsubscribe: () => void }> = [];
  /** Broadcast channels for typing, one per room, made on demand. */
  const typingRooms = new Map<string, ReturnType<
    NonNullable<ReturnType<typeof supabase>>["channel"]
  >>();

  /** Their uuid, or "u_self" when it is mine. See the note at the top. */
  const asApp = (id: string): string => (me && id === me ? LOCAL_USER.id : id);
  /** The inverse, for anything going out. */
  const asWire = (id: string): string =>
    id === LOCAL_USER.id ? (me ?? id) : id;

  const toMessage = (row: MessageRow): Message => ({
    id: row.id,
    channelId: row.channel_id,
    authorId: asApp(row.author_id),
    body: row.body,
    at: Date.parse(row.at) || Date.now(),
    parentId: row.parent_id ?? undefined,
    attachments: row.attachments ?? undefined,
    reactions: row.reactions
      ? Object.fromEntries(
          Object.entries(row.reactions).map(([emoji, ids]) => [
            emoji,
            ids.map(asApp),
          ]),
        )
      : undefined,
    editedAt: row.edited_at ? Date.parse(row.edited_at) : undefined,
  });

  const toChannel = (row: ChannelRow, memberIds: string[]): Channel => ({
    id: row.id,
    kind: row.kind as Channel["kind"],
    scope: row.scope as Channel["scope"],
    name: row.name,
    topic: row.topic ?? undefined,
    description: row.description ?? undefined,
    // A team channel has no membership rows on purpose — its members are the
    // workspace's, and duplicating that would be two truths that drift. So
    // the list is what the join returned, plus you, who are certainly in it.
    memberIds: [...new Set([LOCAL_USER.id, ...memberIds.map(asApp)])],
    createdAt: Date.parse(row.created_at) || Date.now(),
    createdBy: asApp(row.created_by),
    isPrivate: row.is_private,
    archived: row.archived || undefined,
  });

  return {
    name: "account",

    async connect(next: ChatHandlers): Promise<ChatSnapshot> {
      handlers = next;
      me = await whoAmI();
      if (!client || !me) return { channels: [], messages: [] };

      const { data: channelRows } = await client
        .from("channels")
        .select(
          "id, kind, scope, workspace_id, name, topic, description, created_by, is_private, archived, created_at",
        )
        .order("created_at", { ascending: true });
      const channels = (channelRows ?? []) as unknown as ChannelRow[];
      const ids = channels.map((c) => c.id);

      if (ids.length === 0) return { channels: [], messages: [] };

      const { data: memberRows } = await client
        .from("channel_members")
        .select("channel_id, user_id")
        .in("channel_id", ids);
      const byChannel = new Map<string, string[]>();
      for (const row of (memberRows ?? []) as unknown as MemberRow[])
        byChannel.set(row.channel_id, [
          ...(byChannel.get(row.channel_id) ?? []),
          row.user_id,
        ]);

      const { data: messageRows } = await client
        .from("messages")
        .select(
          "id, channel_id, author_id, body, parent_id, attachments, reactions, at, edited_at",
        )
        .in("channel_id", ids)
        .order("at", { ascending: false })
        .limit(RECENT);

      // Subscribed to every insert on `messages` with no filter, which is
      // safe for one reason and only that reason: Realtime evaluates
      // row-level security for `postgres_changes`, so a subscriber is sent
      // exactly the rows their own policies would have returned. The filter
      // is the policy, not a check in this file somebody could skip.
      const live = client
        .channel("chat:messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as unknown as MessageRow;
            // Your own message is already on screen as the optimistic row the
            // store put there, and the store drops a duplicate id — but the
            // echo is what confirms it, so it is passed on rather than
            // filtered out here.
            handlers?.onMessage(toMessage(row));
          },
        )
        .subscribe();
      rooms.push(live);

      return {
        channels: channels.map((row) =>
          toChannel(row, byChannel.get(row.id) ?? []),
        ),
        messages: ((messageRows ?? []) as unknown as MessageRow[])
          .map(toMessage)
          .sort((a, b) => a.at - b.at),
      };
    },

    disconnect() {
      for (const room of rooms.splice(0)) room.unsubscribe();
      typingRooms.clear();
      handlers = null;
    },

    async send(message): Promise<Message> {
      const now = Date.now();
      const optimistic: Message = { ...message, at: now };
      if (!client || !me) return optimistic;

      const { data, error } = await client
        .from("messages")
        .insert({
          id: message.id,
          channel_id: message.channelId,
          author_id: me,
          body: message.body,
          parent_id: message.parentId ?? null,
          attachments: message.attachments ?? null,
        })
        .select(
          "id, channel_id, author_id, body, parent_id, attachments, reactions, at, edited_at",
        )
        .maybeSingle();

      // A refused write returns the message unconfirmed rather than throwing.
      // The store's `.then` is what clears `pending`, and a rejection there
      // would leave the row pending for ever with nothing said — worse than a
      // message that looks sent and is not, which the next reconnect corrects
      // by simply not having it.
      if (error || !data) return optimistic;
      return toMessage(data as unknown as MessageRow);
    },

    async react(messageId: string, emoji: string): Promise<void> {
      if (!client) return;
      // A function rather than an update, because a reaction is the one write
      // somebody makes to a row that is not theirs — see the note on
      // `toggle_reaction` in migration 0017. The userId argument the seam
      // passes is ignored: the database uses `auth.uid()`, which cannot be
      // spoofed by a caller.
      await client.rpc("toggle_reaction", { message_id: messageId, emoji });
    },

    async createChannel(channel): Promise<Channel> {
      const made: Channel = { ...channel, createdAt: Date.now() };
      if (!client || !me) return made;

      if (channel.kind === "dm") {
        // A direct message is not an insert. The other person needs a
        // membership row, which no policy allows a caller to write for
        // somebody else — deliberately, since being added to a room needs a
        // reason. `open_dm` is that reason: it checks the friend graph.
        const other = channel.memberIds
          .map(asWire)
          .find((id) => id !== me && id !== LOCAL_USER.id);
        if (!other) return made;
        const { data } = await client.rpc("open_dm", {
          other,
          wanted: channel.id,
        });
        const answer = data as { ok?: boolean; channel_id?: string } | null;
        if (!answer?.ok || !answer.channel_id) return made;
        return { ...made, id: answer.channel_id };
      }

      const scope = channel.scope ?? "personal";
      const { error } = await client.from("channels").insert({
        id: channel.id,
        kind: channel.kind,
        scope,
        workspace_id: scope === "team" ? await currentWorkspaceId() : null,
        name: channel.name,
        topic: channel.topic ?? null,
        description: channel.description ?? null,
        created_by: me,
        is_private: channel.isPrivate ?? false,
      });
      if (error) return made;

      // Your own row. The policy allows exactly this and nothing wider: you
      // may put yourself in a channel you can already see.
      await client
        .from("channel_members")
        .insert({ channel_id: channel.id, user_id: me });
      return made;
    },

    setTyping(channelId: string, typing: boolean) {
      if (!client || !me) return;
      // Broadcast, not a table. Somebody typing is true for two seconds and
      // worth nothing afterwards; a row per keystroke would be a write
      // amplification of the whole product for a piece of state that is stale
      // before it is durable.
      let room = typingRooms.get(channelId);
      if (!room) {
        const made = client.channel(`typing:${channelId}`);
        made
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            const said = payload as { userId?: string; typing?: boolean };
            if (!said.userId || said.userId === me) return;
            handlers?.onTyping(channelId, asApp(said.userId), Boolean(said.typing));
          })
          .subscribe();
        rooms.push(made);
        room = made;
        typingRooms.set(channelId, made);
      }
      void room.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: me, typing },
      });
    },
  };
}

/**
 * Whether this deployment and this person can have real conversations.
 *
 * Both halves matter. Without a database there is nowhere for a message to
 * go; without a session there is no `auth.uid()`, so every policy in 0017
 * refuses and every read comes back empty — which would look exactly like a
 * workspace where nobody has ever said anything.
 */
export async function chatCanBeReal(): Promise<boolean> {
  return Boolean(supabase()) && (await whoAmI()) !== null;
}
