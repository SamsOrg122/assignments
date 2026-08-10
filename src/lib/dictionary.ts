"use client";

/**
 * Your own words.
 *
 * A personal dictionary that is honest about its reach. The browser's
 * spellchecker is the browser's: there is no web API that adds a word to it,
 * so nothing here removes a red underline. Claiming otherwise would be the
 * kind of setting that looks like it works and doesn't.
 *
 * What it genuinely does: the assistant is told these are deliberate, so it
 * stops offering to "correct" a surname, a variable name or a Dutch term in an
 * English document — which is the actual complaint behind wanting a personal
 * dictionary in the first place.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useSyncExternalStore } from "react";
import { versioned } from "./persistence/versioned";

interface DictionaryState {
  words: string[];
  add: (word: string) => void;
  remove: (word: string) => void;
}

export const useDictionary = create<DictionaryState>()(
  persist(
    (set) => ({
      words: [],
      add: (word) =>
        set((s) => {
          const clean = word.trim();
          if (!clean) return s;
          // Case-insensitive: adding "Kubernetes" should also cover
          // "kubernetes" at the start of a sentence.
          if (s.words.some((w) => w.toLowerCase() === clean.toLowerCase()))
            return s;
          return { words: [...s.words, clean].sort((a, b) => a.localeCompare(b)) };
        }),
      remove: (word) =>
        set((s) => ({ words: s.words.filter((w) => w !== word) })),
    }),
    {
      ...versioned<DictionaryState>("assignments:dictionary:v1", []),
      skipHydration: true,
    },
  ),
);

let requested = false;

export function useDictionaryHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useDictionary.persist.onFinishHydration(onChange),
    () => useDictionary.persist.hasHydrated(),
    () => false,
  );
  useEffect(() => {
    if (requested) return;
    requested = true;
    void useDictionary.persist.rehydrate();
  }, []);
  return hydrated;
}

/** The words, for anything that runs outside React. */
export const knownWords = () => useDictionary.getState().words;

/**
 * The languages worth offering.
 *
 * Not every BCP-47 tag — a list of two hundred is a list nobody reads. These
 * are what a browser ships dictionaries for and what this app's users write
 * in; the field takes anything, so an unusual one is typed rather than absent.
 */
export const LANGUAGES: Array<{ tag: string; label: string }> = [
  { tag: "en-GB", label: "English (UK)" },
  { tag: "en-US", label: "English (US)" },
  { tag: "nl", label: "Nederlands" },
  { tag: "de", label: "Deutsch" },
  { tag: "fr", label: "Français" },
  { tag: "es", label: "Español" },
];

export const DEFAULT_LANGUAGE = "en-GB";
