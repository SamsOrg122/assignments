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

/**
 * How a channel is entered.
 *
 * `closed` channels ask for a passcode. Read the note on `passcodeHash` before
 * treating that as security — it isn't, and the UI says so.
 */
export type ChannelAccess = "open" | "closed";

export interface Channel {
  id: string;
  kind: ChannelKind;
  /**
   * Whose channel this is. Absent means personal — chats existed before
   * teams did, and a solo user's chats must not vanish behind a team gate
   * they cannot open.
   */
  scope?: "personal" | "team";
  /** Channels have names; DMs derive theirs from members. */
  name: string;
  topic?: string;
  /** A longer description, shown in channel settings and on the join gate. */
  description?: string;
  /** Collaborator ids, including the local user. */
  memberIds: string[];
  createdAt: number;
  createdBy?: string;
  /** Private channels are listed only to members. */
  isPrivate?: boolean;

  access?: ChannelAccess;
  /**
   * SHA-256 of the passcode, so the code itself is never written to storage.
   *
   * This is a latch, not a lock. The messages are not encrypted, and anyone
   * who can read this browser's storage — or, later, the API — can read the
   * channel without ever seeing the gate. It keeps a closed group out of the
   * way of people who shouldn't wander in; it does not keep anything out of
   * reach. Real access control belongs on the server, behind the same
   * `ChatProvider` seam as everything else, and the UI states this plainly
   * rather than implying a guarantee we can't make.
   */
  passcodeHash?: string;
  /** Shareable join token. Rotating it invalidates every old link. */
  invite?: { token: string; createdAt: number };
  /** Archived channels drop out of the sidebar but keep their history. */
  archived?: boolean;
}

/** A live reference to something in the workspace. */
export interface ProjectAttachment {
  kind: "project";
  projectId: string;
}

/**
 * A file dropped into the conversation.
 *
 * The extracted text travels with the message rather than a blob, for the same
 * reason the Team page stores words instead of originals: it is what the
 * assistant can actually read, it is a fraction of the size, and it means a
 * file shared in a channel is answerable from immediately — no separate
 * "index this" step.
 */
export interface FileAttachment {
  kind: "file";
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Extracted text. Empty when the type needs a server-side extractor. */
  text: string;
  status: "ready" | "unsupported" | "failed";
  /** Why it couldn't be read, or what was dropped in reading it. */
  note?: string;
}

export type MessageAttachment = ProjectAttachment | FileAttachment;

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
