"use client";

/**
 * Appearance store.
 *
 * Every preference maps onto a CSS custom property the design tokens already
 * reference, so a change repaints the whole app without a single component
 * knowing about it. Stored separately from documents: how the app looks is a
 * property of this person on this machine, not of the work.
 *
 * The plain data lives in `./appearance` because the root layout — a Server
 * Component — has to inline it into the boot script.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useSyncExternalStore } from "react";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "./appearance";

export {
  ACCENTS,
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  type Appearance,
  type AccentName,
  type DensityName,
  type MotionName,
  type RadiusName,
  type ThemeMode,
  type UIFont,
} from "./appearance";

interface AppearanceState extends Appearance {
  set: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void;
  reset: () => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE,
      set: (key, value) => set({ [key]: value } as Partial<Appearance>),
      reset: () => set({ ...DEFAULT_APPEARANCE }),
    }),
    {
      name: APPEARANCE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Same reasoning as the project store: reading storage during module
      // evaluation would desync the first client render from the server one.
      skipHydration: true,
    },
  ),
);

/** The single place that knows how a preference becomes an attribute. */
export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved =
    a.mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : a.mode;

  root.dataset.theme = resolved;
  root.dataset.accent = a.accent;
  root.dataset.radius = a.radius;
  root.dataset.density = a.density;
  root.dataset.font = a.font;
  root.dataset.motion = a.motion;
  root.style.setProperty("--sidebar-w", `${a.sidebarWidth}px`);
  root.style.colorScheme = resolved;
}

let rehydrateRequested = false;

/** Rehydrates once, then keeps the DOM in step with the store. */
export function useAppearanceSync() {
  const hydrated = useSyncExternalStore(
    (cb) => useAppearance.persist.onFinishHydration(cb),
    () => useAppearance.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useAppearance.persist.rehydrate();
  }, []);

  const appearance = useAppearance();

  useEffect(() => {
    if (!hydrated) return;
    applyAppearance(appearance);
  }, [hydrated, appearance]);

  // "System" has to follow the OS while the app is open, not only at load.
  useEffect(() => {
    if (appearance.mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyAppearance(useAppearance.getState());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [appearance.mode]);
}
