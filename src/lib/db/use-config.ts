"use client";

/**
 * The configuration, as React sees it.
 *
 * `config.ts` is a module-level store, so it has to be read through
 * `useSyncExternalStore` — the server cannot know what `/api/config` will say,
 * and rendering one answer on the server and another on the client is React
 * error #418. The server snapshot is deliberately the compiled-in answer,
 * which is also the client's first render.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureRemoteConfig,
  remoteConfig,
  remoteConfigSettled,
  subscribeConfig,
  type RemoteConfig,
} from "./config";

/** The keys, or null. Triggers the runtime lookup on first use. */
export function useRemoteConfig(): RemoteConfig | null {
  useEffect(() => {
    void ensureRemoteConfig();
  }, []);

  return useSyncExternalStore(subscribeConfig, remoteConfig, () => null);
}

/** Whether accounts can work here at all. */
export const useRemoteConfigured = (): boolean => useRemoteConfig() !== null;

/**
 * Whether the question has been answered yet. Until it has, the honest thing
 * for a screen to say is "checking", not "there is no database".
 */
export function useRemoteConfigSettled(): boolean {
  useEffect(() => {
    void ensureRemoteConfig();
  }, []);

  return useSyncExternalStore(
    subscribeConfig,
    remoteConfigSettled,
    () => false,
  );
}
