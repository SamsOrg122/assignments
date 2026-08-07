"use client";

/**
 * Who you are, as far as this browser is concerned.
 *
 * Persisted separately from documents: a workspace restored from someone
 * else's backup file should not also make you them. It holds the display name
 * and whether the account choice has been made yet, and nothing else — there
 * is no token here because there is no server to have issued one.
 *
 * The name is not decoration. Comments, presence and mentions all read the
 * local identity, so setting it changes what other people see next to your
 * words — which is a real thing this can do today, without an account.
 */

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { initialsFor, type Identity } from "./index";
import { LOCAL_USER } from "../realtime";

interface AuthState {
  identity: Identity;
  /**
   * Whether the person has been offered the choice between keeping work on
   * this device and creating an account. Asked once, then never again —
   * a prompt that reappears is a prompt that gets dismissed reflexively.
   */
  choiceMade: boolean;

  setName: (name: string) => void;
  /** Record the decision to stay local. A choice, not a deferral. */
  keepOnDevice: () => void;
  signedIn: (identity: Identity) => void;
  signedOut: () => void;
}

const anonymous = (): Identity => ({
  id: LOCAL_USER.id,
  name: LOCAL_USER.name,
  initials: LOCAL_USER.initials,
  kept: "device",
});

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      identity: anonymous(),
      choiceMade: false,

      setName: (name) =>
        set((s) => ({
          identity: {
            ...s.identity,
            name: name.trim() || LOCAL_USER.name,
            initials: initialsFor(name),
          },
        })),

      keepOnDevice: () => set({ choiceMade: true }),

      signedIn: (identity) => set({ identity, choiceMade: true }),

      // The name survives signing out. It was yours before the account was.
      signedOut: () =>
        set((s) => ({
          identity: {
            ...anonymous(),
            name: s.identity.name,
            initials: s.identity.initials,
          },
        })),
    }),
    {
      ...versioned<AuthState>("assignments:identity:v1", []),
      skipHydration: true,
    },
  ),
);

let rehydrateRequested = false;

/**
 * Matches the pattern the other persisted stores use: the middleware is an
 * external store, so subscribe to it rather than mirroring its state into
 * React. The server snapshot is `false`, which is also the first client
 * render — so the two agree and nothing hydrates mismatched.
 */
export function useAuthHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useAuth.persist.onFinishHydration(onChange),
    () => useAuth.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useAuth.persist.rehydrate();
  }, []);

  return hydrated;
}
