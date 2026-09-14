/**
 * One table describing every project type: how it's labelled, which glyph it
 * carries, which editor opens it, and how ⌘K finds it. Adding a type is an
 * entry here plus an editor — nothing else in the app switches on the kind.
 */

import type { IconName } from "@/components/ui/Icon";
import type { ProjectKind } from "./types";

export interface KindMeta {
  label: string;
  /** Shown under the name in the Library. */
  hint: string;
  glyph: string;
  icon: IconName;
  /** Extra search terms so "thesis" finds a Doc and "pitch" finds a Deck. */
  keywords: string;
  /**
   * The colour this kind is, everywhere.
   *
   * ── WHY A KIND HAS A COLOUR AND A STATE STILL DOES NOT ─────────────────
   * This app's rule is that a fill may never be the sole carrier of a
   * *state*, and that rule holds: the surface ramp measures 1.08–1.24:1 and
   * somebody who cannot see it must still have ink and weight to go on.
   *
   * Identity is a different job. What kind of thing this is does not change,
   * is never the only label — the name and the glyph are right there — and is
   * exactly what colour is good at: you learn in a day that blue means a
   * document and green means a board, and after that you find things in a
   * list without reading it. That is what Figma does with layer types and
   * what Slack does with people, and it is why a monochrome list of twenty
   * projects is slower to use than a coloured one no matter how calm it is.
   *
   * The value is a CSS custom property name, not a hex: the six are declared
   * once in globals.css and tuned there for both themes at once.
   */
  hue: string;
  /** Editors that aren't built out yet say so instead of pretending. */
  placeholder?: boolean;
}

export const KINDS: Record<ProjectKind, KindMeta> = {
  doc: {
    label: "Thesis / Doc",
    hint: "Long-form writing",
    glyph: "◆",
    icon: "text",
    keywords: "thesis doc document essay paper dissertation report write prose chapter",
    hue: "--kind-doc",
  },
  notes: {
    label: "Notes",
    hint: "Quick capture",
    glyph: "◇",
    icon: "file",
    keywords: "notes notebook scratch jot memo minutes",
    hue: "--kind-notes",
  },
  deck: {
    label: "Deck",
    hint: "Slides for pitching",
    glyph: "▲",
    icon: "slides",
    keywords: "deck slides presentation pitch talk keynote powerpoint",
    hue: "--kind-deck",
  },
  board: {
    label: "Board",
    hint: "Infinite thinking canvas",
    glyph: "◈",
    icon: "board",
    keywords: "board canvas whiteboard map spatial brainstorm freeform figma",
    hue: "--kind-board",
  },
  code: {
    label: "Code",
    hint: "Files and a live preview",
    glyph: "■",
    icon: "code",
    keywords: "code program script prototype html css javascript",
    hue: "--kind-code",
  },
  design: {
    label: "Design",
    hint: "Placeholder — not built yet",
    glyph: "○",
    icon: "sparkle",
    keywords: "design vector figma sketch mockup ui",
    hue: "--kind-design",
    placeholder: true,
  },
};

export const KIND_ORDER: ProjectKind[] = [
  "doc",
  "deck",
  "board",
  "notes",
  "code",
  "design",
];

/** Project kinds that open in the writing editor. */
export const isWriting = (kind: ProjectKind) => kind === "doc" || kind === "notes";
