"use client";

/**
 * Ephemeral UI state — deliberately separate from document state so that
 * "is the palette open" never ends up in a persisted (or synced) document.
 */

import { create } from "zustand";
import type { BlockType } from "./types";

/** What the inline AI popover is attached to when it opens. */
export interface AITarget {
  projectId: string;
  blockId: string;
  blockType: BlockType;
  /** Selected text, if the user invoked AI from a selection. */
  selectionText: string;
  /** Viewport coordinates to anchor the popover to. */
  anchor: { x: number; y: number };
  /** Pre-filled prompt, e.g. when launched from the command palette. */
  seedPrompt?: string;
}

interface UIState {
  paletteOpen: boolean;
  /** Text the palette opens with — lets "/" hand off to ⌘K. */
  paletteSeed: string;
  sidebarOpen: boolean;
  aiTarget: AITarget | null;
  /** Block the local user is focused in — drives the "you" presence chip. */
  focusedBlockId: string | null;
  /** Distraction-free writing. Strips the shell down to the page. */
  focusMode: boolean;
  /**
   * A passage the user marked as "this is the voice". Held here rather than in
   * the document because it's a working preference, not content.
   */
  voiceSample: { text: string; projectId: string } | null;
  toast: { id: number; message: string } | null;

  /** Bumped on every openAI call, so the popover remounts with fresh state. */
  aiOpenId: number;

  openPalette: (seed?: string) => void;
  closePalette: () => void;
  togglePalette: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openAI: (target: AITarget) => void;
  closeAI: () => void;
  setFocusedBlock: (blockId: string | null) => void;
  setFocusMode: (on: boolean) => void;
  setVoiceSample: (sample: { text: string; projectId: string } | null) => void;
  notify: (message: string) => void;
  dismissToast: () => void;
}

let toastSeq = 0;

export const useUI = create<UIState>()((set, get) => ({
  paletteOpen: false,
  paletteSeed: "",
  sidebarOpen: true,
  aiTarget: null,
  aiOpenId: 0,
  focusedBlockId: null,
  focusMode: false,
  voiceSample: null,
  toast: null,

  openPalette: (seed = "") => set({ paletteOpen: true, paletteSeed: seed }),
  closePalette: () => set({ paletteOpen: false, paletteSeed: "" }),
  togglePalette: () =>
    set((s) => ({ paletteOpen: !s.paletteOpen, paletteSeed: "" })),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  openAI: (aiTarget) =>
    set((s) => ({ aiTarget, aiOpenId: s.aiOpenId + 1, paletteOpen: false })),
  closeAI: () => set({ aiTarget: null }),

  setFocusedBlock: (focusedBlockId) => set({ focusedBlockId }),
  setFocusMode: (focusMode) => set({ focusMode }),
  setVoiceSample: (voiceSample) => set({ voiceSample }),

  notify: (message) => {
    const id = ++toastSeq;
    set({ toast: { id, message } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2600);
  },
  dismissToast: () => set({ toast: null }),
}));
