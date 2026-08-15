/**
 * The collaboration seam.
 *
 * One room, symmetric participants, four kinds of message. Whoever opened the
 * link and whoever sent it run exactly the same code — there is no "host" with
 * extra powers, because a session where one side has to stay online to keep the
 * other's edits is a session that breaks the moment they close a laptop.
 *
 * Prose travels as CRDT updates — see `ydoc.ts` — so two people typing in the
 * same paragraph at the same second both keep their words. Everything that is
 * not prose (board items, tables, slides) is still per item and
 * last-writer-wins, which is the right trade for things you grab rather than
 * type into, and is named here so nobody has to read three files to find out.
 */

import type { Block, BoardItem, Collaborator } from "../types";

export interface CollabMessage {
  /**
   * `probe` never reaches the session — it is a transport's own message,
   * sent to itself through the server, and the only proof available that the
   * round trip works. The transport swallows it on the way back.
   */
  kind: "hello" | "bye" | "cursor" | "patch" | "resend" | "probe" | "ydoc";
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

  /**
   * A Yjs update, base64. Carries the prose in every text block: those merge
   * character by character rather than arriving as a whole block, which is
   * the difference between two people in one paragraph and one of them losing
   * a sentence. Everything that is not prose still travels as `blocks`.
   */
  update?: string;

  /**
   * What the sender already holds, base64. Whoever holds more replies with the
   * difference. This is what makes the merge survive a transport that loses
   * messages — see `ydoc.ts`.
   */
  sv?: string;

  at: number;
}

/**
 * What a transport has actually managed to do — not what it hoped for.
 *
 * `reach` only appears once a round trip has been proven, which is the whole
 * point of the state existing: a session that says "anyone you send the link
 * to" while nothing is getting through is worse than one that admits it.
 */
export type TransportStatus =
  | { state: "connecting" }
  | { state: "live"; reach: string; note?: string }
  | { state: "failed"; problem: string };

export interface CollabTransport {
  readonly name: string;
  /** What this transport reaches *if it connects*. A hope, not a fact. */
  readonly reach: string;
  isAvailable(): boolean;
  join(
    room: string,
    onMessage: (message: CollabMessage) => void,
    onStatus: (status: TransportStatus) => void,
  ): void;
  send(message: CollabMessage): void;
  leave(): void;
}
