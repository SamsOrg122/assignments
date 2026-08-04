/**
 * Simulated multiplayer.
 *
 * Peers wander on a smoothed path toward a moving target rather than jumping
 * between random points — jitter is what makes fake cursors read as fake. Every
 * peer independently drifts, pauses, picks up a block to "edit", and puts it
 * down again.
 */

import type { Collaborator, PeerState } from "../types";
import type { RealtimeProvider } from "./types";

export const PEERS: Collaborator[] = [
  { id: "u_mira", name: "Mira Chen", initials: "MC", color: "#3d7dff" },
  { id: "u_dev", name: "Dev Raman", initials: "DR", color: "#26a17b" },
  { id: "u_ana", name: "Ana Silva", initials: "AS", color: "#c46be0" },
];

const ACTIVITIES = ["editing", "reviewing", "commenting on"];

interface Sim {
  user: Collaborator;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Frames until the peer picks a new target. */
  hold: number;
  activeBlockId: string | null;
  activity: string | null;
  blockHold: number;
  /** Peers idle out and their cursor disappears, like a real session. */
  away: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function newSim(user: Collaborator, i: number): Sim {
  return {
    user,
    x: 0.25 + i * 0.22,
    y: 0.3 + i * 0.13,
    tx: rand(0.15, 0.85),
    ty: rand(0.15, 0.85),
    hold: Math.floor(rand(40, 160)),
    activeBlockId: null,
    activity: null,
    blockHold: Math.floor(rand(30, 200)),
    away: false,
  };
}

export function createMockProvider(): RealtimeProvider {
  let sims: Sim[] = [];
  let blockIds: string[] = [];
  const listeners = new Set<(peers: PeerState[]) => void>();
  let raf: number | null = null;
  let frame = 0;
  let connected = false;

  const emit = () => {
    const peers: PeerState[] = sims.map((s) => ({
      user: s.user,
      cursor: s.away ? null : { x: s.x, y: s.y },
      activeBlockId: s.activeBlockId,
      activity: s.activity,
    }));
    for (const l of listeners) l(peers);
  };

  const tick = () => {
    frame++;
    for (const s of sims) {
      if (--s.hold <= 0) {
        s.tx = rand(0.08, 0.92);
        s.ty = rand(0.1, 0.9);
        s.hold = Math.floor(rand(50, 200));
        // Occasionally step away entirely, then come back.
        if (Math.random() < 0.12) s.away = !s.away;
      }
      // Critically-damped-ish easing toward the target.
      s.x += (s.tx - s.x) * 0.022;
      s.y += (s.ty - s.y) * 0.022;

      if (--s.blockHold <= 0) {
        s.blockHold = Math.floor(rand(120, 420));
        if (blockIds.length && Math.random() < 0.75) {
          s.activeBlockId = blockIds[Math.floor(Math.random() * blockIds.length)];
          s.activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        } else {
          s.activeBlockId = null;
          s.activity = null;
        }
      }
    }
    // Emit at ~20fps; cursors are smoothed in CSS, so 60fps state churn is waste.
    if (frame % 3 === 0) emit();
    raf = requestAnimationFrame(tick);
  };

  return {
    name: "mock",

    connect() {
      // A fresh room each time, so switching projects re-seeds positions.
      const count = 2 + Math.floor(Math.random() * (PEERS.length - 1));
      sims = PEERS.slice(0, count).map(newSim);
      connected = true;
      emit();
      if (raf === null && typeof requestAnimationFrame === "function")
        raf = requestAnimationFrame(tick);
    },

    disconnect() {
      connected = false;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      sims = [];
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      if (connected) listener(sims.map((s) => ({
        user: s.user,
        cursor: s.away ? null : { x: s.x, y: s.y },
        activeBlockId: s.activeBlockId,
        activity: s.activity,
      })));
      return () => {
        listeners.delete(listener);
      };
    },

    // The mock has no server to publish to; a real provider would broadcast.
    setLocalCursor() {},
    setLocalActiveBlock() {},

    setBlockIds(ids) {
      blockIds = ids;
    },
  };
}
