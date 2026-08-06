/**
 * Connector geometry: where a line leaves one item and where it arrives at
 * another.
 *
 * "Smart routing" here means one specific thing — the line picks the *facing*
 * sides. Two stickies side by side get a horizontal link between their inner
 * edges; stack them and the same connector flips to vertical on its own. That
 * is the whole difference between a diagram that survives being rearranged and
 * one you have to redraw every time you move a box.
 *
 * Pure functions over rects, deliberately: the board renders them, the minimap
 * ignores them, and neither needs a DOM to know where a line goes.
 */

import type { Rect } from "./geometry";
import type { ConnectorRoute } from "./types";

export type Side = "left" | "right" | "top" | "bottom";

export interface Anchor {
  x: number;
  y: number;
  side: Side;
}

export interface Route {
  /** SVG path data. */
  d: string;
  from: Anchor;
  to: Anchor;
  /** Where a label sits, and where the click target is thickest. */
  mid: { x: number; y: number };
  /** Direction of travel at the arrow head, in degrees. */
  endAngle: number;
}

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

function pointOn(r: Rect, side: Side): { x: number; y: number } {
  const c = centre(r);
  switch (side) {
    case "left":
      return { x: r.x, y: c.y };
    case "right":
      return { x: r.x + r.width, y: c.y };
    case "top":
      return { x: c.x, y: r.y };
    case "bottom":
      return { x: c.x, y: r.y + r.height };
  }
}

/**
 * Choose the pair of facing sides. Whichever axis separates the two rects more
 * wins, which is what makes the choice stable: a small wobble while dragging
 * can't flip the line, but actually moving a box past the other one does.
 */
export function facingSides(a: Rect, b: Rect): [Side, Side] {
  const ca = centre(a);
  const cb = centre(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;

  // Compare the gap, not the centre distance: wide boxes that overlap
  // horizontally should link top-to-bottom even if their centres are far apart.
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));

  if (gapX >= gapY)
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

const isHorizontal = (s: Side) => s === "left" || s === "right";

/** Outward normal, used to push control points away from the box. */
function normal(side: Side): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
  }
}

export function routeConnector(
  from: Rect,
  to: Rect,
  style: ConnectorRoute,
): Route {
  const [sa, sb] = facingSides(from, to);
  const a: Anchor = { ...pointOn(from, sa), side: sa };
  const b: Anchor = { ...pointOn(to, sb), side: sb };

  if (style === "straight") {
    return {
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      from: a,
      to: b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      endAngle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }

  if (style === "elbow") {
    // One bend, on the axis the anchors leave by. Two-bend routes look tidier
    // in a diagramming tool with a real router; with a single midpoint the
    // line stays predictable, which matters more while you're dragging.
    const pts = isHorizontal(sa)
      ? [
          { x: (a.x + b.x) / 2, y: a.y },
          { x: (a.x + b.x) / 2, y: b.y },
        ]
      : [
          { x: a.x, y: (a.y + b.y) / 2 },
          { x: b.x, y: (a.y + b.y) / 2 },
        ];
    const d = `M ${a.x} ${a.y} L ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${b.x} ${b.y}`;
    const last = pts[1];
    return {
      d,
      from: a,
      to: b,
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      endAngle: (Math.atan2(b.y - last.y, b.x - last.x) * 180) / Math.PI,
    };
  }

  // Curve: control points pushed along each anchor's normal, scaled to the
  // distance so short links stay taut and long ones bow gently.
  const na = normal(sa);
  const nb = normal(sb);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const pull = Math.min(140, Math.max(40, dist * 0.4));
  const c1 = { x: a.x + na.x * pull, y: a.y + na.y * pull };
  const c2 = { x: b.x + nb.x * pull, y: b.y + nb.y * pull };

  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
    from: a,
    to: b,
    // Midpoint of a cubic at t = 0.5 — the average of the eight-way blend.
    mid: {
      x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
      y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
    },
    endAngle: (Math.atan2(b.y - c2.y, b.x - c2.x) * 180) / Math.PI,
  };
}
