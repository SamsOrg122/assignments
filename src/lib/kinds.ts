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
  },
  notes: {
    label: "Notes",
    hint: "Quick capture",
    glyph: "◇",
    icon: "file",
    keywords: "notes notebook scratch jot memo minutes",
  },
  deck: {
    label: "Deck",
    hint: "Slides for pitching",
    glyph: "▲",
    icon: "slides",
    keywords: "deck slides presentation pitch talk keynote powerpoint",
  },
  board: {
    label: "Board",
    hint: "Infinite thinking canvas",
    glyph: "◈",
    icon: "board",
    keywords: "board canvas whiteboard map spatial brainstorm freeform figma",
  },
  code: {
    label: "Code",
    hint: "Files and a live preview",
    glyph: "■",
    icon: "code",
    keywords: "code program script prototype html css javascript",
  },
  design: {
    label: "Design",
    hint: "Placeholder — not built yet",
    glyph: "○",
    icon: "sparkle",
    keywords: "design vector figma sketch mockup ui",
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
