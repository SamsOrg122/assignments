/**
 * The collaboration seam.
 *
 * One room, symmetric participants, four kinds of message. Whoever opened the
 * link and whoever sent it run exactly the same code — there is no "host" with
 * extra powers, because a session where one side has to stay online to keep the
 * other's edits is a session that breaks the moment they close a laptop.
 *
 * Document sync is per *block*, last-writer-wins, not a CRDT. That is a real
 * limitation and it is worth naming: two people typing in the same paragraph
 * at the same second will overwrite each other. Two people in different
 * sections — which is what "help me with this assignment" actually looks like
 * — never touch. A CRDT (Yjs) belongs behind this interface, and the message
 * shape is deliberately the one a CRDT would send: changes, not snapshots.
 */

import type { Block, BoardItem, Collaborator } from "../types";

export interface CollabMessage {
  kind: "hello" | "bye" | "cursor" | "patch" | "resend";
  /** Sender's participant id — a session, not a person. */
  from: string;
  user?: Collaborator;
  /** Viewport fractions, 0..1. Null means the pointer left. */
  cursor?: { x: number; y: number } | null;
  activeBlockId?: string | null;

  /** Blocks and board items the sender changed, by value. */
  blocks?: Block[];
  board?: BoardItem[];
  /** Ids the sender deleted. */
  removed?: string[];
  /** Whole-document fields that aren't blocks. */
  name?: string;

  at: number;
}

export interface CollabTransport {
  readonly name: string;
  /** A one-line description of what this transport can actually reach. */
  readonly reach: string;
  isAvailable(): boolean;
  join(room: string, onMessage: (message: CollabMessage) => void): void;
  send(message: CollabMessage): void;
  leave(): void;
}
