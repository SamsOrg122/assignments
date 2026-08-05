/**
 * Chat.
 *
 * The thing Slack structurally can't do is put the conversation *in the same
 * workspace as the work*: a message here can carry a live reference to a
 * Library project, and that card stays in step with the project rather than
 * being a dead link to another tool. That's the whole reason chat lives here
 * instead of beside here.
 *
 * The transport is a seam. `ChatProvider` is shaped like a websocket client —
 * send, subscribe, typing, read receipts — so a real server drops in without a
 * component change.
 */

/**
 * `ai` is a channel whose other participant is the workspace assistant. It is
 * a channel kind rather than a separate surface so threads, attachments,
 * history and search all work without a second implementation.
 */
export type ChannelKind = "channel" | "dm" | "ai";

export interface Channel {
  id: string;
  kind: ChannelKind;
  /** Channels have names; DMs derive theirs from members. */
  name: string;
  topic?: string;
  /** Collaborator ids, including the local user. */
  memberIds: string[];
  createdAt: number;
  /** Private channels are listed only to members. */
  isPrivate?: boolean;
}

/** A live reference to something in the workspace. */
export interface MessageAttachment {
  kind: "project";
  projectId: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  at: number;
  /** Set when this message is a reply inside a thread. */
  parentId?: string;
  attachments?: MessageAttachment[];
  /** emoji → user ids who reacted. */
  reactions?: Record<string, string[]>;
  /** True while a sent message is unconfirmed by the transport. */
  pending?: boolean;
  editedAt?: number;
}

export interface ChatSnapshot {
  channels: Channel[];
  messages: Message[];
}

export interface ChatHandlers {
  /** A message arrived — from anyone, including an echo of your own. */
  onMessage(message: Message): void;
  /** Someone started or stopped typing. */
  onTyping(channelId: string, userId: string, typing: boolean): void;
}

export interface ChatProvider {
  readonly name: string;

  /** Initial state. A real provider fetches; the mock seeds. */
  connect(handlers: ChatHandlers): Promise<ChatSnapshot>;
  disconnect(): void;

  send(message: Omit<Message, "at" | "pending">): Promise<Message>;
  react(messageId: string, emoji: string, userId: string): Promise<void>;
  createChannel(channel: Omit<Channel, "createdAt">): Promise<Channel>;
  /** Tell peers you're typing. Throttled by the caller. */
  setTyping(channelId: string, typing: boolean): void;
}
