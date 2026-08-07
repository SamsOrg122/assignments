"use client";

/**
 * `?demo=1` — the sample workspace, on request.
 *
 * The app ships empty. The landing page's live frame still has to show a
 * product with something in it, and someone evaluating this deserves a way to
 * see it populated without inventing a thesis first, so both load the samples
 * through this one door.
 *
 * It only ever fills an *empty* workspace. Landing on a demo link with real
 * work already in the browser must not replace it — that would be the worst
 * possible reading of a URL parameter.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createJSONStorage } from "zustand/middleware";
import { useProjects, useHydrated } from "@/lib/store";
import { setSimulatedPeers } from "@/lib/realtime/mock";

export function DemoBootstrap() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const demo = params?.get("demo") === "1";

  useEffect(() => {
    if (!demo) return;
    // Peers are part of what the demo is demonstrating.
    setSimulatedPeers(true);
    // Wait for the store to rehydrate, or "empty" is just "not loaded yet".
    if (!hydrated) return;
    if (useProjects.getState().projects.length > 0) return;

    // Detach persistence *before* loading anything.
    //
    // The landing page runs this inside an iframe on the same origin, which
    // means the same localStorage: writing the samples here would drop a
    // stranger's thesis into the visitor's own workspace. A demo has to leave
    // nothing behind, so it runs entirely in memory.
    useProjects.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      })),
    });
    useProjects.getState().loadSamples();
  }, [demo, hydrated]);

  return null;
}
