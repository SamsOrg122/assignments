/**
 * What each event colour looks like on the grid.
 *
 * Muted fills with a solid left edge, matching the reference: the block reads
 * as a surface, the edge carries the hue, and six of them can sit in one
 * column without shouting. Fixed rgba values rather than theme tokens because
 * an event's colour is the user's choice, not the theme's — "the red one" has
 * to stay the red one in light mode.
 */

import type { EventColor } from "@/lib/agenda/model";

export const SWATCH: Record<EventColor, string> = {
  slate: "#8fa1b3",
  red: "#e06c5f",
  gold: "#c9a35a",
  blue: "#6c9fe0",
  green: "#79b791",
  purple: "#a98fd6",
};

export function blockStyle(color: EventColor): React.CSSProperties {
  const hue = SWATCH[color];
  return {
    background: `color-mix(in srgb, ${hue} 16%, transparent)`,
    borderLeft: `3px solid ${hue}`,
  };
}
