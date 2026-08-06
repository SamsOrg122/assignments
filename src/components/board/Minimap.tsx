"use client";

/**
 * The minimap. Appears only when a board has grown past the point where you can
 * hold it in your head — below that it would be decoration, and decoration in a
 * corner is exactly the clutter the design rules out.
 *
 * It draws items as flat blocks (no text, no images) because at this size the
 * only thing readable is *shape*: where the clusters are and where you are
 * relative to them. Click or drag to move the viewport.
 */

import { useRef } from "react";
import type { BoardItem } from "@/lib/types";
import { isPositioned } from "@/lib/types";
import { cn } from "@/lib/cn";

const W = 168;
const H = 116;
const PAD = 10;

const TONE_FILL: Record<string, string> = {
  neutral: "var(--color-fg-subtle)",
  accent: "var(--color-accent)",
  mint: "var(--color-leaf)",
  warn: "#d8a33c",
};

export function Minimap({
  items,
  view,
  surface,
  onJump,
}: {
  items: BoardItem[];
  view: { x: number; y: number; scale: number };
  /** Size of the visible board area, in screen px. */
  surface: { width: number; height: number };
  /** Move the viewport so this world point is centred. */
  onJump: (world: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blocks = items.filter(isPositioned);
  if (blocks.length === 0) return null;

  // The world rect the map covers: everything on the board, plus whatever the
  // viewport currently shows, so "you are here" is always inside the frame.
  const viewWorld = {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    width: surface.width / view.scale,
    height: surface.height / view.scale,
  };
  const minX = Math.min(...blocks.map((i) => i.x), viewWorld.x);
  const minY = Math.min(...blocks.map((i) => i.y), viewWorld.y);
  const maxX = Math.max(
    ...blocks.map((i) => i.x + i.width),
    viewWorld.x + viewWorld.width,
  );
  const maxY = Math.max(
    ...blocks.map((i) => i.y + i.height),
    viewWorld.y + viewWorld.height,
  );

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const k = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const ox = PAD + ((W - PAD * 2) - spanX * k) / 2;
  const oy = PAD + ((H - PAD * 2) - spanY * k) / 2;

  const toMap = (x: number, y: number) => ({
    x: ox + (x - minX) * k,
    y: oy + (y - minY) * k,
  });

  const jumpFrom = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onJump({
      x: minX + (clientX - rect.left - ox) / k,
      y: minY + (clientY - rect.top - oy) / k,
    });
  };

  const vp = toMap(viewWorld.x, viewWorld.y);

  return (
    <div
      ref={ref}
      aria-label="Board overview"
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        jumpFrom(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) jumpFrom(e.clientX, e.clientY);
      }}
      className="relative cursor-pointer overflow-hidden rounded-md border border-line bg-surface/90 backdrop-blur"
      style={{ width: W, height: H }}
    >
      {blocks.map((i) => {
        const p = toMap(i.x, i.y);
        const tone = "tone" in i ? i.tone : "neutral";
        const frame = i.kind === "frame";
        return (
          <div
            key={i.id}
            className={cn(
              "absolute rounded-[1.5px]",
              frame ? "border" : "",
            )}
            style={{
              left: p.x,
              top: p.y,
              width: Math.max(2, i.width * k),
              height: Math.max(2, i.height * k),
              background: frame ? "transparent" : TONE_FILL[tone],
              borderColor: frame ? TONE_FILL[tone] : undefined,
              opacity: frame ? 0.5 : 0.75,
            }}
          />
        );
      })}

      <div
        className="pointer-events-none absolute rounded-[2px] border border-accent bg-accent/10"
        style={{
          left: vp.x,
          top: vp.y,
          width: viewWorld.width * k,
          height: viewWorld.height * k,
        }}
      />
    </div>
  );
}
