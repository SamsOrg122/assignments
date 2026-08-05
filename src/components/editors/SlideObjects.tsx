"use client";

/**
 * The free-form layer on a slide: text, shapes and lines over the structured
 * content, Canva-style — but hard to make ugly, because fills are theme
 * *roles* rather than free colours. Restyling the deck re-inks every shape.
 *
 * Coordinates are percentages of the slide, so the same object sits in the
 * same place on the thumbnail, the stage and the projector.
 *
 * The inspector is adaptive: it exists only while an object is selected, and
 * its advanced half (numbers, rotation) sits behind the presets (fills,
 * layer, balance). No permanent chrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Slide, SlideObject, SlideObjectFill } from "@/lib/types";
import { balance, snap, type Rect } from "@/lib/geometry";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const FILLS: Array<[SlideObjectFill, string]> = [
  ["accent", "Accent"],
  ["fg", "Ink"],
  ["muted", "Muted"],
  ["surface", "Surface"],
  ["none", "None"],
];

const FILL_VAR: Record<SlideObjectFill, string> = {
  accent: "var(--slide-accent)",
  fg: "var(--slide-fg)",
  muted: "var(--slide-muted)",
  surface: "color-mix(in srgb, var(--slide-fg) 8%, transparent)",
  none: "transparent",
};

/* ── Static rendering (thumbnails, presenting) ──────────── */

export function SlideObjectsView({ objects }: { objects?: SlideObject[] }) {
  if (!objects?.length) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {objects
        .slice()
        .sort((a, b) => a.z - b.z)
        .map((o) => (
          <ObjectShape key={o.id} object={o} />
        ))}
    </div>
  );
}

function ObjectShape({ object: o }: { object: SlideObject }) {
  const fill = FILL_VAR[o.fill ?? "accent"];
  const base: React.CSSProperties = {
    left: `${o.x}%`,
    top: `${o.y}%`,
    width: `${o.width}%`,
    height: `${o.height}%`,
    opacity: o.opacity ?? 1,
    transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
  };

  if (o.kind === "text")
    return (
      <div
        className="absolute flex items-center whitespace-pre-wrap"
        style={{
          ...base,
          color: fill === "transparent" ? "var(--slide-fg)" : fill,
          fontSize: `${o.textSize ?? 3}cqw`,
          lineHeight: 1.25,
        }}
      >
        {o.text || " "}
      </div>
    );

  if (o.kind === "line")
    return (
      <div className="absolute" style={base}>
        <div
          className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 rounded-full"
          style={{ background: fill }}
        />
      </div>
    );

  return (
    <div
      className={cn("absolute", o.kind === "ellipse" && "rounded-full")}
      style={{
        ...base,
        background: fill,
        borderRadius: o.kind === "ellipse" ? "50%" : 6,
        border: o.border
          ? "1.5px solid var(--slide-fg)"
          : undefined,
      }}
    />
  );
}

/* ── Interactive layer (the stage) ──────────────────────── */

export function SlideObjectsEditor({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (objects: SlideObject[]) => void;
}) {
  const objects = useMemo(() => slide.objects ?? [], [slide.objects]);
  const [selected, setSelected] = useState<string | null>(null);
  const [guides, setGuides] = useState<Array<{ axis: "x" | "y"; at: number }>>([]);
  const [editingText, setEditingText] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const current = objects.find((o) => o.id === selected) ?? null;

  // Selection can't outlive its slide or its object.
  const [lastSlide, setLastSlide] = useState(slide.id);
  if (lastSlide !== slide.id) {
    setLastSlide(slide.id);
    setSelected(null);
    setEditingText(null);
  }

  const patch = useCallback(
    (id: string, next: Partial<SlideObject>) =>
      onChange(objects.map((o) => (o.id === id ? { ...o, ...next } : o))),
    [objects, onChange],
  );

  /* Drag / resize, in percent space. */
  const dragState = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: Rect;
  } | null>(null);

  const toPct = (dxPx: number, dyPx: number) => {
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return { dx: 0, dy: 0 };
    return { dx: (dxPx / host.width) * 100, dy: (dyPx / host.height) * 100 };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const { dx, dy } = toPct(e.clientX - drag.startX, e.clientY - drag.startY);
      const others = objects
        .filter((o) => o.id !== drag.id)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));

      if (drag.mode === "move") {
        const raw = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy };
        const snapped = snap(raw, others, { width: 100, height: 100 }, 1.4);
        setGuides(snapped.guides);
        patch(drag.id, {
          x: Math.round(snapped.x * 10) / 10,
          y: Math.round(snapped.y * 10) / 10,
        });
      } else {
        patch(drag.id, {
          width: Math.max(3, Math.round((drag.origin.width + dx) * 10) / 10),
          height: Math.max(3, Math.round((drag.origin.height + dy) * 10) / 10),
        });
      }
    };
    const onUp = () => {
      dragState.current = null;
      setGuides([]);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [objects, patch]);

  const startDrag = (
    e: React.PointerEvent,
    o: SlideObject,
    mode: "move" | "resize",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // preventDefault suppresses the browser's focus-on-pointerdown, so take
    // focus explicitly — without it, arrow keys fall through to the deck's
    // slide navigation and "nudge the shape" becomes "next slide".
    (e.currentTarget as HTMLElement).focus();
    setSelected(o.id);
    dragState.current = {
      id: o.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: o.x, y: o.y, width: o.width, height: o.height },
    };
  };

  const remove = (id: string) => {
    onChange(objects.filter((o) => o.id !== id));
    setSelected(null);
  };

  const reorder = (id: string, dir: 1 | -1) => {
    const zs = objects.map((o) => o.z);
    const top = Math.max(...zs, 0);
    const bottom = Math.min(...zs, 0);
    patch(id, { z: dir === 1 ? top + 1 : bottom - 1 });
  };

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      onPointerDown={() => {
        setSelected(null);
        setEditingText(null);
      }}
    >
      {objects
        .slice()
        .sort((a, b) => a.z - b.z)
        .map((o) => (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            data-obj={o.kind}
            aria-label={`${o.kind} object`}
            onPointerDown={(e) => startDrag(e, o, "move")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (o.kind === "text") setEditingText(o.id);
            }}
            onKeyDown={(e) => {
              // Keys handled here must not also reach the deck's navigation.
              e.stopPropagation();
              const step = e.shiftKey ? 5 : 1;
              if (e.key === "Backspace" || e.key === "Delete") remove(o.id);
              else if (e.key === "ArrowLeft") patch(o.id, { x: o.x - step });
              else if (e.key === "ArrowRight") patch(o.id, { x: o.x + step });
              else if (e.key === "ArrowUp") patch(o.id, { y: o.y - step });
              else if (e.key === "ArrowDown") patch(o.id, { y: o.y + step });
              else return;
              e.preventDefault();
            }}
            className={cn(
              "absolute cursor-grab outline-none",
              selected === o.id && "z-30",
            )}
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              width: `${o.width}%`,
              height: `${o.height}%`,
            }}
          >
            <div className="pointer-events-none absolute inset-0">
              <ObjectShape object={{ ...o, x: 0, y: 0, width: 100, height: 100 }} />
            </div>

            {editingText === o.id ? (
              <textarea
                autoFocus
                value={o.text ?? ""}
                aria-label="Text content"
                onChange={(e) => patch(o.id, { text: e.target.value })}
                onBlur={() => setEditingText(null)}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute inset-0 resize-none bg-transparent outline-1 outline-accent"
                style={{
                  color: "var(--slide-fg)",
                  fontSize: `${o.textSize ?? 3}cqw`,
                  lineHeight: 1.25,
                }}
              />
            ) : (
              selected === o.id && (
                <>
                  <div className="pointer-events-none absolute -inset-px rounded-sm outline-1 outline-accent" />
                  <button
                    type="button"
                    aria-label="Resize"
                    onPointerDown={(e) => startDrag(e, o, "resize")}
                    className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-full border border-accent bg-surface"
                  />
                </>
              )
            )}
          </div>
        ))}

      {/* Snap guides — they exist only while something is snapping. */}
      {guides.map((g, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute bg-accent/70"
          style={
            g.axis === "x"
              ? { left: `${g.at}%`, top: 0, bottom: 0, width: 1 }
              : { top: `${g.at}%`, left: 0, right: 0, height: 1 }
          }
        />
      ))}

      {current && !editingText && (
        <ObjectInspector
          object={current}
          onPatch={(next) => patch(current.id, next)}
          onLayer={(dir) => reorder(current.id, dir)}
          onDelete={() => remove(current.id)}
        />
      )}
    </div>
  );
}

/* ── Insertion ──────────────────────────────────────────── */

export function insertObject(
  objects: SlideObject[],
  kind: SlideObject["kind"],
): SlideObject[] {
  const top = Math.max(0, ...objects.map((o) => o.z));
  const fresh: SlideObject =
    kind === "text"
      ? {
          id: uid(),
          kind,
          x: 34,
          y: 42,
          width: 32,
          height: 12,
          z: top + 1,
          fill: "fg",
          text: "Text",
          textSize: 3,
        }
      : kind === "line"
        ? { id: uid(), kind, x: 30, y: 48, width: 40, height: 4, z: top + 1, fill: "accent" }
        : {
            id: uid(),
            kind,
            x: 38,
            y: 36,
            width: 24,
            height: kind === "ellipse" ? 24 : 18,
            z: top + 1,
            fill: "accent",
            opacity: 0.9,
          };
  return [...objects, fresh];
}

/* ── The adaptive inspector ─────────────────────────────── */

function ObjectInspector({
  object: o,
  onPatch,
  onLayer,
  onDelete,
}: {
  object: SlideObject;
  onPatch: (next: Partial<SlideObject>) => void;
  onLayer: (dir: 1 | -1) => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);

  return (
    <div
      className="anim-pop absolute top-2 right-2 z-40 w-[196px] rounded-md border border-line-strong bg-surface/95 p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-[10.5px] text-fg-subtle capitalize">{o.kind}</span>
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            onClick={() => onLayer(1)}
            aria-label="Bring forward"
            title="Bring forward"
            className="rounded-xs border border-line p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="arrow-up" size={9} />
          </button>
          <button
            type="button"
            onClick={() => onLayer(-1)}
            aria-label="Send back"
            title="Send back"
            className="rounded-xs border border-line p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="chevron-down" size={9} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete object"
            className="rounded-xs border border-line p-1 text-fg-subtle transition-colors hover:text-danger"
          >
            <Icon name="trash" size={9} />
          </button>
        </span>
      </div>

      {/* Fills are roles: the theme inks them, so restyle stays safe. */}
      <div className="flex gap-1">
        {FILLS.map(([fill, label]) => (
          <button
            key={fill}
            type="button"
            title={label}
            aria-label={`${label} fill`}
            aria-pressed={(o.fill ?? "accent") === fill}
            onClick={() => onPatch({ fill })}
            className={cn(
              "h-6 flex-1 rounded-xs border transition-colors",
              (o.fill ?? "accent") === fill
                ? "border-accent"
                : "border-line hover:border-line-strong",
            )}
            style={{
              background:
                fill === "none"
                  ? "repeating-linear-gradient(45deg, transparent, transparent 3px, var(--color-line) 3px, var(--color-line) 4px)"
                  : FILL_VAR[fill],
            }}
          />
        ))}
      </div>

      <label className="mt-2 block">
        <span className="mb-0.5 flex justify-between text-[10px] text-fg-subtle">
          Opacity
          <span className="font-mono">{Math.round((o.opacity ?? 1) * 100)}%</span>
        </span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={o.opacity ?? 1}
          aria-label="Opacity"
          onChange={(e) => onPatch({ opacity: Number(e.target.value) })}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)]"
        />
      </label>

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="mt-1.5 flex w-full items-center gap-1 text-[10.5px] text-fg-subtle transition-colors hover:text-fg"
      >
        <Icon
          name="chevron-right"
          size={9}
          className={cn("transition-transform", more && "rotate-90")}
        />
        More
      </button>

      {more && (
        <div className="anim-slide-up mt-1.5 border-t border-line pt-1.5">
          <label className="block">
            <span className="mb-0.5 flex justify-between text-[10px] text-fg-subtle">
              Rotation
              <span className="font-mono">{o.rotation ?? 0}°</span>
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={o.rotation ?? 0}
              aria-label="Rotation"
              onChange={(e) => onPatch({ rotation: Number(e.target.value) })}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)]"
            />
          </label>

          {o.kind === "text" && (
            <label className="mt-1.5 block">
              <span className="mb-0.5 flex justify-between text-[10px] text-fg-subtle">
                Text size
                <span className="font-mono">{o.textSize ?? 3}</span>
              </span>
              <input
                type="range"
                min={1.5}
                max={8}
                step={0.25}
                value={o.textSize ?? 3}
                aria-label="Text size"
                onChange={(e) => onPatch({ textSize: Number(e.target.value) })}
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)]"
              />
            </label>
          )}

          {o.kind !== "line" && (
            <label className="mt-1.5 flex items-center justify-between text-[10.5px] text-fg-subtle">
              Border
              <input
                type="checkbox"
                checked={o.border ?? false}
                aria-label="Border"
                onChange={(e) => onPatch({ border: e.target.checked })}
                className="accent-[var(--color-accent)]"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** "Make this slide balanced" — the shared geometry, applied to the layer. */
export function balanceObjects(objects: SlideObject[]): SlideObject[] {
  const rects = objects.map((o) => ({
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
  }));
  const placed = balance(rects, { width: 100, height: 100 }, 10);
  return objects.map((o, i) => ({
    ...o,
    x: Math.round(placed[i].x * 10) / 10,
    y: Math.round(placed[i].y * 10) / 10,
  }));
}
