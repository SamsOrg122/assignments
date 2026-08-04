/**
 * The realtime seam.
 *
 * Presence is modelled the way a CRDT-backed provider models it — an awareness
 * map of peer states that the UI subscribes to — so dropping in Yjs means
 * writing a `RealtimeProvider` whose `subscribe` forwards
 * `awareness.getStates()`. The components below never learn which one they got.
 */

import type { Collaborator, PeerState } from "../types";

export interface RealtimeProvider {
  readonly name: string;

  /** Join a project's room. Safe to call again with a different project. */
  connect(projectId: string, self: Collaborator): void;
  disconnect(): void;

  /** Peers, excluding self. Returns an unsubscribe function. */
  subscribe(listener: (peers: PeerState[]) => void): () => void;

  /**
   * Local cursor, in canvas-relative fractions (0..1 on both axes) so it maps
   * across viewport sizes. A real provider would publish this on awareness.
   */
  setLocalCursor(point: { x: number; y: number } | null): void;

  /** Which block the local user is working in — drives the presence chip. */
  setLocalActiveBlock(blockId: string | null): void;

  /**
   * Tells the provider which blocks exist, so simulated peers can target real
   * blocks. A real provider ignores this.
   */
  setBlockIds(ids: string[]): void;
}
