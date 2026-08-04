"use client";

/**
 * Realtime entry point + React binding.
 *
 * `usePresence` is the only thing components touch. Swap the provider with
 * `setRealtimeProvider(new YjsProvider(doc, awareness))` and presence, cursors
 * and block chips all become real without a component edit.
 */

import { useEffect, useState } from "react";
import type { Collaborator, PeerState } from "../types";
import { createMockProvider } from "./mock";
import type { RealtimeProvider } from "./types";

export type { RealtimeProvider } from "./types";
export { PEERS } from "./mock";

/** The local user. A real app would get this from the session. */
export const LOCAL_USER: Collaborator = {
  id: "u_self",
  name: "You",
  initials: "YO",
  color: "#ededed",
};

let provider: RealtimeProvider = createMockProvider();

export function setRealtimeProvider(next: RealtimeProvider) {
  provider.disconnect();
  provider = next;
}

export function getRealtimeProviderName() {
  return provider.name;
}

/**
 * Subscribe to peer presence for a project.
 *
 * `blockIds` lets the simulated provider attach peers to blocks that actually
 * exist; a real provider ignores it.
 */
export function usePresence(
  projectId: string | null,
  blockIds: string[],
): PeerState[] {
  const [peers, setPeers] = useState<PeerState[]>([]);
  const blockKey = blockIds.join(",");

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = provider.subscribe(setPeers);
    provider.connect(projectId, LOCAL_USER);
    return () => {
      unsubscribe();
      provider.disconnect();
    };
  }, [projectId]);

  useEffect(() => {
    provider.setBlockIds(blockKey ? blockKey.split(",") : []);
  }, [blockKey]);

  // Outside a project there are no peers, whatever the last room left behind.
  return projectId ? peers : EMPTY;
}

const EMPTY: PeerState[] = [];

export function reportLocalCursor(point: { x: number; y: number } | null) {
  provider.setLocalCursor(point);
}

export function reportLocalBlock(blockId: string | null) {
  provider.setLocalActiveBlock(blockId);
}
