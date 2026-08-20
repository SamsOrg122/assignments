/**
 * What a project's avatar can be.
 *
 * The `glyph` field has always been a single string, and it stays one — so
 * every store, backup, and share link that already carries it keeps working.
 * What changed is the vocabulary: a plain string is drawn as-is (a shape, an
 * emoji), and a string of the form `~motif-color` names one of the animated
 * marks below. The tilde is the whole encoding — no character anyone would
 * type as an icon starts with one, so old values can never be misread as new
 * ones.
 *
 * This file is data and parsing only, importable from anywhere (the share
 * sanitizer runs outside React). The drawing lives in `components/ui/Avatar`.
 */

export const AVATAR_MOTIFS = [
  "pixels",
  "pulse",
  "orbit",
  "spark",
  "wave",
  "ring",
] as const;
export type AvatarMotif = (typeof AVATAR_MOTIFS)[number];

/** Named rather than hex in the stored string, so a palette tweak later
 *  recolors everyone's existing avatars instead of stranding them. */
export const AVATAR_COLORS = {
  blue: "#5b8dff",
  green: "#55c07d",
  amber: "#e8a34b",
  pink: "#ef7bae",
  violet: "#9d7bff",
  red: "#ff7062",
  teal: "#3fbdb0",
  slate: "#8a93a6",
} as const;
export type AvatarColor = keyof typeof AVATAR_COLORS;

export const AVATAR_COLOR_ORDER = Object.keys(AVATAR_COLORS) as AvatarColor[];

/** The still marks: the original sidebar glyphs, then a wider shelf. */
export const AVATAR_SHAPES = [
  "◆", "◇", "▲", "△", "■", "□", "●", "○", "✳", "✦", "▸", "§",
  "★", "☆", "❖", "♥", "☾", "⚑", "♪", "∞", "†", "❋", "◉", "⌘",
];

/** Emoji, for people who want the fridge-magnet version. Kept to subjects a
 *  student's library actually has, not a full picker. */
export const AVATAR_EMOJI = [
  "📚", "📝", "📌", "🧠", "💡", "🚀", "🎯", "🎨",
  "🎬", "🎵", "📊", "📈", "🧪", "🔬", "🧬", "💻",
  "🤖", "🌍", "🌱", "🔥", "⚡", "⭐", "🌙", "☕",
  "🍕", "🏀", "⚽", "🎮", "📷", "✈️", "🏛️", "🏆",
];

export interface AnimatedAvatar {
  motif: AvatarMotif;
  color: AvatarColor;
}

/** The `~motif-color` reading of a glyph, or null when it is a plain mark. */
export function parseAvatar(glyph: string | undefined | null): AnimatedAvatar | null {
  if (!glyph || glyph[0] !== "~") return null;
  const dash = glyph.indexOf("-");
  if (dash < 0) return null;
  const motif = glyph.slice(1, dash) as AvatarMotif;
  const color = glyph.slice(dash + 1) as AvatarColor;
  if (!AVATAR_MOTIFS.includes(motif)) return null;
  if (!(color in AVATAR_COLORS)) return null;
  return { motif, color };
}

export function encodeAvatar(motif: AvatarMotif, color: AvatarColor): string {
  return `~${motif}-${color}`;
}

/**
 * A glyph from outside — a share link, a backup — reduced to something safe
 * to store and draw. A valid animated code passes whole; anything else is
 * clipped to the length a real mark needs (an emoji with a variation
 * selector is three UTF-16 units, a flag would be four).
 */
export function sanitizeGlyph(raw: unknown, fallback = "◇"): string {
  if (typeof raw !== "string" || !raw) return fallback;
  if (parseAvatar(raw)) return raw;
  const clipped = raw.slice(0, 4);
  // A tilde that didn't parse is a code from a future version — better the
  // fallback than four letters of gibberish in the sidebar.
  return clipped[0] === "~" ? fallback : clipped;
}
