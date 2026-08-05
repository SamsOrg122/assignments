/**
 * Deck themes.
 *
 * Five looks, each fully set — surface, ink, accent and a type pairing. The
 * point is to make a good-looking deck unavoidable: you choose a theme, not a
 * font size, a colour and a margin. Every value resolves to a CSS custom
 * property the slide renderer reads, so adding a theme is a data change.
 */

import type { DeckThemeName } from "./types";

export interface DeckTheme {
  label: string;
  hint: string;
  /** Slide background. */
  bg: string;
  /** Primary and secondary ink. */
  fg: string;
  muted: string;
  accent: string;
  /** Hairline used for rules and dividers. */
  line: string;
  /** Title face. Body always uses the UI sans for legibility at distance. */
  titleFamily: string;
  titleWeight: number;
  /** Tightening on big type, in em. */
  titleTracking: string;
}

export const DECK_THEMES: Record<DeckThemeName, DeckTheme> = {
  ink: {
    label: "Ink",
    hint: "Near-black, one accent",
    bg: "#121215",
    fg: "#f2f2f5",
    muted: "#a8a8b3",
    accent: "#3d7dff",
    line: "rgba(255,255,255,0.14)",
    titleFamily: "var(--font-sans)",
    titleWeight: 600,
    titleTracking: "-0.03em",
  },
  paper: {
    label: "Paper",
    hint: "Warm white, serif titles",
    bg: "#faf8f4",
    fg: "#1b1a17",
    muted: "#5f5c55",
    accent: "#b4531f",
    line: "rgba(0,0,0,0.14)",
    titleFamily:
      '"Iowan Old Style", Palatino, Charter, Georgia, "Times New Roman", serif',
    titleWeight: 600,
    titleTracking: "-0.02em",
  },
  editorial: {
    label: "Editorial",
    hint: "White, large serif, generous",
    bg: "#ffffff",
    fg: "#111114",
    muted: "#55555f",
    accent: "#111114",
    line: "rgba(0,0,0,0.12)",
    titleFamily:
      '"Iowan Old Style", Palatino, Charter, Georgia, "Times New Roman", serif',
    titleWeight: 500,
    titleTracking: "-0.025em",
  },
  signal: {
    label: "Signal",
    hint: "High contrast, accent ground",
    bg: "#0d1b3d",
    fg: "#ffffff",
    muted: "#a9bbe4",
    accent: "#ffd23f",
    line: "rgba(255,255,255,0.18)",
    titleFamily: "var(--font-sans)",
    titleWeight: 700,
    titleTracking: "-0.035em",
  },
  slate: {
    label: "Slate",
    hint: "Muted grey, quiet and technical",
    bg: "#20232a",
    fg: "#e8eaf0",
    muted: "#9aa1b0",
    accent: "#5ecfa6",
    line: "rgba(255,255,255,0.12)",
    titleFamily: "var(--font-mono)",
    titleWeight: 500,
    titleTracking: "-0.01em",
  },
};

export const DECK_THEME_ORDER: DeckThemeName[] = [
  "ink",
  "paper",
  "editorial",
  "signal",
  "slate",
];

/**
 * Accents a deck can be tinted with, on top of its theme.
 *
 * A fixed set rather than a colour picker: the point of themes is that the
 * surface and the ink were chosen together, and an arbitrary accent is the one
 * value that can undo that. These are all legible on every theme's ground.
 */
export const DECK_ACCENTS: Array<{ id: string; label: string; value: string }> = [
  { id: "theme", label: "Theme", value: "" },
  { id: "blue", label: "Blue", value: "#3d7dff" },
  { id: "leaf", label: "Green", value: "#4ad2a0" },
  { id: "amber", label: "Amber", value: "#e0a04a" },
  { id: "rose", label: "Rose", value: "#f43f6e" },
  { id: "violet", label: "Violet", value: "#8b5cf6" },
];

/** Theme + scale as inline custom properties for one slide surface. */
export function deckVars(
  theme: DeckTheme,
  scale: number,
  accent?: string,
): React.CSSProperties {
  return {
    "--slide-bg": theme.bg,
    "--slide-fg": theme.fg,
    "--slide-muted": theme.muted,
    "--slide-accent": accent || theme.accent,
    "--slide-line": theme.line,
    "--slide-title-family": theme.titleFamily,
    "--slide-title-weight": String(theme.titleWeight),
    "--slide-title-tracking": theme.titleTracking,
    "--slide-scale": String(scale),
  } as React.CSSProperties;
}
