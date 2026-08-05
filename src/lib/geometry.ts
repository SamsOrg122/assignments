/**
 * Alignment, distribution and snapping, as pure geometry.
 *
 * Shared by the slide stage and the board on purpose: "align left" must mean
 * exactly the same thing in both places, and the only way to guarantee that
 * is for both to call the same function. Everything works on plain rects in
 * whatever unit the caller uses — percent on slides, world pixels on boards.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Alignment =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom";

/** New positions that align every rect within the group's bounding box. */
export function align(rects: Rect[], edge: Alignment): Rect[] {
  if (rects.length < 2) return rects;
  const box = bounds(rects);
  return rects.map((r) => {
    switch (edge) {
      case "left":
        return { ...r, x: box.x };
      case "right":
        return { ...r, x: box.x + box.width - r.width };
      case "centerX":
        return { ...r, x: box.x + (box.width - r.width) / 2 };
      case "top":
        return { ...r, y: box.y };
      case "bottom":
        return { ...r, y: box.y + box.height - r.height };
      case "centerY":
        return { ...r, y: box.y + (box.height - r.height) / 2 };
    }
  });
}

/** Even gaps along an axis, first and last kept in place. */
export function distribute(rects: Rect[], axis: "x" | "y"): Rect[] {
  if (rects.length < 3) return rects;
  const order = rects
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (axis === "x" ? a.r.x - b.r.x : a.r.y - b.r.y));

  const first = order[0].r;
  const last = order[order.length - 1].r;
  const span =
    axis === "x"
      ? last.x + last.width - first.x
      : last.y + last.height - first.y;
  const content = order.reduce(
    (n, { r }) => n + (axis === "x" ? r.width : r.height),
    0,
  );
  const gap = (span - content) / (order.length - 1);

  const out = [...rects];
  let cursor = axis === "x" ? first.x : first.y;
  for (const { r, i } of order) {
    out[i] = axis === "x" ? { ...r, x: cursor } : { ...r, y: cursor };
    cursor += (axis === "x" ? r.width : r.height) + gap;
  }
  return out;
}

export function bounds(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}

/* ── Snapping ───────────────────────────────────────────── */

export interface SnapResult {
  x: number;
  y: number;
  /** Guide lines to draw, in the same unit as the rects. */
  guides: Array<{ axis: "x" | "y"; at: number }>;
}

/**
 * Snap a moving rect to a container's centre lines and to other rects' edges
 * and centres. Returns the adjusted position plus the guides that earned it —
 * the guides *are* the feedback, so they only exist when something snapped.
 */
export function snap(
  moving: Rect,
  others: Rect[],
  container: { width: number; height: number },
  threshold: number,
): SnapResult {
  const targetsX = [
    container.width / 2 - moving.width / 2, // centred in the container
    ...others.flatMap((o) => [
      o.x, // left edges align
      o.x + o.width - moving.width, // right edges align
      o.x + o.width / 2 - moving.width / 2, // centres align
    ]),
  ];
  const targetsY = [
    container.height / 2 - moving.height / 2,
    ...others.flatMap((o) => [
      o.y,
      o.y + o.height - moving.height,
      o.y + o.height / 2 - moving.height / 2,
    ]),
  ];

  let x = moving.x;
  let y = moving.y;
  const guides: SnapResult["guides"] = [];

  let bestX = threshold;
  for (const t of targetsX) {
    const d = Math.abs(moving.x - t);
    if (d < bestX) {
      bestX = d;
      x = t;
    }
  }
  let bestY = threshold;
  for (const t of targetsY) {
    const d = Math.abs(moving.y - t);
    if (d < bestY) {
      bestY = d;
      y = t;
    }
  }

  if (x !== moving.x) guides.push({ axis: "x", at: x + moving.width / 2 });
  if (y !== moving.y) guides.push({ axis: "y", at: y + moving.height / 2 });

  return { x, y, guides };
}

/**
 * "Make this slide balanced": lay N rects on a tidy grid inside the
 * container, preserving each rect's size. Deterministic, so applying it
 * twice changes nothing — a balance button that jiggles is worse than none.
 */
export function balance(
  rects: Rect[],
  container: { width: number; height: number },
  margin: number,
): Rect[] {
  if (!rects.length) return rects;
  const cols = Math.ceil(Math.sqrt(rects.length));
  const rowCount = Math.ceil(rects.length / cols);
  const cellW = (container.width - margin * 2) / cols;
  const cellH = (container.height - margin * 2) / rowCount;

  // Keep reading order: sort by current position, place left-to-right.
  const order = rects
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);

  const out = [...rects];
  order.forEach(({ r, i }, n) => {
    const col = n % cols;
    const row = Math.floor(n / cols);
    out[i] = {
      ...r,
      x: margin + col * cellW + (cellW - r.width) / 2,
      y: margin + row * cellH + (cellH - r.height) / 2,
    };
  });
  return out;
}
