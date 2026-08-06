"use client";

/**
 * The connector layer: one SVG stretched across the world, under the items.
 *
 * It sits *inside* the pan/zoom transform, so lines scale with everything else
 * and the routing maths never has to know about the viewport. The svg itself is
 * 1×1 with `overflow: visible` — a trick that gives an unbounded drawing
 * surface without picking an arbitrary canvas size for an infinite board.
 */

import { useMemo } from "react";
import type { BoardConnectorItem, BoardItem, BoardTone } from "@/lib/types";
import { routeConnector } from "@/lib/board-routing";

export const CONNECTOR_STROKE: Record<BoardTone, string> = {
  neutral: "var(--color-fg-subtle)",
  accent: "var(--color-accent)",
  mint: "var(--color-leaf)",
  warn: "#d8a33c",
};

export function Connectors({
  items,
  selection,
  layer,
  onSelect,
  onContextMenu,
  onEditLabel,
}: {
  items: BoardItem[];
  selection: string[];
  /**
   * Lines belong *under* the items — a connector crossing a sticky should pass
   * behind it. Labels belong on top, or they end up buried in the gap between
   * the two things they describe. So the same routing runs twice, once per
   * layer, rather than compromising on a single z-index for both.
   */
  layer: "lines" | "labels";
  onSelect: (id: string, additive: boolean) => void;
  onContextMenu: (e: React.MouseEvent, item: BoardConnectorItem) => void;
  onEditLabel: (item: BoardConnectorItem) => void;
}) {
  const byId = useMemo(() => {
    const map = new Map<string, BoardItem>();
    for (const i of items) map.set(i.id, i);
    return map;
  }, [items]);

  const routed = useMemo(
    () =>
      items
        .filter((i): i is BoardConnectorItem => i.kind === "connector")
        .flatMap((c) => {
          const from = byId.get(c.fromId);
          const to = byId.get(c.toId);
          if (!from || !to) return [];
          return [{ c, route: routeConnector(from, to, c.route) }];
        }),
    [items, byId],
  );

  if (!routed.length) return null;

  if (layer === "labels")
    return (
      <svg
        width={1}
        height={1}
        className="pointer-events-none absolute top-0 left-0"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {routed
          .filter(({ c }) => c.label)
          .map(({ c, route }) => (
            <LabelChip
              key={c.id}
              x={route.mid.x}
              y={route.mid.y}
              text={c.label ?? ""}
              onDoubleClick={() => onEditLabel(c)}
            />
          ))}
      </svg>
    );

  return (
    <svg
      width={1}
      height={1}
      className="absolute top-0 left-0"
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      {routed.map(({ c, route }) => {
        const selected = selection.includes(c.id);
        const stroke = CONNECTOR_STROKE[c.tone] ?? CONNECTOR_STROKE.neutral;
        return (
          <g key={c.id} className="pointer-events-auto">
            {/* A fat invisible copy of the path — 2px of line is impossible
                to hit with a pointer, so the hit target is its own shape. */}
            <path
              d={route.d}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(c.id, e.shiftKey);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEditLabel(c);
              }}
              onContextMenu={(e) => onContextMenu(e, c)}
            />
            <path
              d={route.d}
              fill="none"
              stroke={selected ? "var(--color-accent)" : stroke}
              strokeWidth={selected ? 2.5 : 1.75}
              strokeDasharray={c.dashed ? "6 5" : undefined}
              strokeLinecap="round"
              className="pointer-events-none"
              opacity={selected ? 1 : 0.85}
            />

            {(c.arrow === "end" || c.arrow === "both") && (
              <Head
                x={route.to.x}
                y={route.to.y}
                angle={route.endAngle}
                fill={selected ? "var(--color-accent)" : stroke}
              />
            )}
            {c.arrow === "both" && (
              <Head
                x={route.from.x}
                y={route.from.y}
                angle={
                  (Math.atan2(
                    route.from.y - route.to.y,
                    route.from.x - route.to.x,
                  ) *
                    180) /
                  Math.PI
                }
                fill={selected ? "var(--color-accent)" : stroke}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Head({
  x,
  y,
  angle,
  fill,
}: {
  x: number;
  y: number;
  angle: number;
  fill: string;
}) {
  return (
    <path
      d="M 0 0 L -9 -4.5 L -6.5 0 L -9 4.5 Z"
      fill={fill}
      className="pointer-events-none"
      transform={`translate(${x} ${y}) rotate(${angle})`}
    />
  );
}

/**
 * Labels are drawn as SVG rather than an HTML overlay so they travel with the
 * path under one transform. Width is estimated from the character count —
 * measuring text would mean a layout pass per frame while dragging.
 */
function LabelChip({
  x,
  y,
  text,
  onDoubleClick,
}: {
  x: number;
  y: number;
  text: string;
  onDoubleClick: () => void;
}) {
  const w = Math.max(26, text.length * 6.4 + 14);
  return (
    <g
      transform={`translate(${x - w / 2} ${y - 10})`}
      className="pointer-events-auto cursor-text"
      role="presentation"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      <rect
        width={w}
        height={20}
        rx={5}
        fill="var(--color-surface)"
        stroke="var(--color-line)"
      />
      <text
        x={w / 2}
        y={13.5}
        textAnchor="middle"
        fontSize={11}
        fill="var(--color-fg-muted)"
        style={{ fontFamily: "var(--font-sans, ui-sans-serif)" }}
      >
        {text}
      </text>
    </g>
  );
}
