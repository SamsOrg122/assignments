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
import {
  align as alignRects,
  balance,
  distribute,
  snap,
  type Alignment,
  type Rect,
} from "@/lib/geometry";
import { uid } from "@/lib/factories";
import { imageFrom, prepareImage } from "@/lib/images";
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

  if (o.kind === "image")
    return (
      <div
        className="absolute overflow-hidden"
        style={{
          ...base,
          borderRadius: `${o.radius ?? 0}%`,
          border: o.border ? "1.5px solid var(--slide-fg)" : undefined,
          // An empty box beats a broken-image glyph while the picture is
          // still being chosen.
          background: o.src
            ? undefined
            : "color-mix(in srgb, var(--slide-fg) 8%, transparent)",
        }}
      >
        {o.src && (
          /* eslint-disable-next-line @next/next/no-img-element -- a data URL
             off the user's own disk; there is nothing for the optimiser to
             fetch, and it has to render inside a print/export path too. */
          <img
            src={o.src}
            alt={o.alt ?? ""}
            className="size-full"
            style={{ objectFit: o.fit ?? "cover" }}
          />
        )}
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

/**
 * Objects copied with ⌘C, kept for the session.
 *
 * A module-level array rather than the system clipboard: the system one holds
 * text, and hijacking it would fight the picture paste that also lives on this
 * stage. This way "copy these three shapes, go to slide 8, paste" works, which
 * is the only thing anyone actually wants from it.
 */
let objectClipboard: SlideObject[] = [];

/** Which corner a resize grip pulls. Same language as the board. */
const GRIPS = [
  ["nw", "-top-1.5 -left-1.5 cursor-nwse-resize"],
  ["ne", "-top-1.5 -right-1.5 cursor-nesw-resize"],
  ["sw", "-bottom-1.5 -left-1.5 cursor-nesw-resize"],
  ["se", "-bottom-1.5 -right-1.5 cursor-nwse-resize"],
] as const;

type Grip = (typeof GRIPS)[number][0];

type DragState =
  | {
      mode: "move";
      ids: string[];
      startX: number;
      startY: number;
      origins: Map<string, Rect>;
      moved: boolean;
    }
  | {
      mode: "resize";
      id: string;
      grip: Grip;
      startX: number;
      startY: number;
      origin: Rect;
      /** Width ÷ height in *percent* units, for the shift-lock. */
      aspect: number;
    }
  | { mode: "marquee"; startX: number; startY: number }
  | null;

const MIN_SIZE = 3;
const round = (n: number) => Math.round(n * 10) / 10;

export function SlideObjectsEditor({
  slide,
  onChange,
  stageRef,
}: {
  slide: Slide;
  onChange: (objects: SlideObject[]) => void;
  /**
   * The slide stage itself. Empty-space interactions — deselect, marquee —
   * are bound here rather than on this component's own root, because the root
   * has to let pointer events through to the title and bullets underneath it.
   * A layer that swallows every click makes the structured half of the slide
   * uneditable, which is a high price for a deselect.
   */
  stageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const objects = useMemo(() => slide.objects ?? [], [slide.objects]);
  const [selected, setSelected] = useState<string[]>([]);
  const [guides, setGuides] = useState<Array<{ axis: "x" | "y"; at: number }>>([]);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const chosen = useMemo(
    () => objects.filter((o) => selected.includes(o.id)),
    [objects, selected],
  );

  // Selection can't outlive its slide or its object.
  const [lastSlide, setLastSlide] = useState(slide.id);
  if (lastSlide !== slide.id) {
    setLastSlide(slide.id);
    setSelected([]);
    setEditingText(null);
  }

  const patch = useCallback(
    (id: string, next: Partial<SlideObject>) =>
      onChange(objects.map((o) => (o.id === id ? { ...o, ...next } : o))),
    [objects, onChange],
  );

  /** Apply a different patch to each of several objects, in one write. */
  const patchMany = useCallback(
    (next: Map<string, Partial<SlideObject>>) =>
      onChange(
        objects.map((o) => (next.has(o.id) ? { ...o, ...next.get(o.id) } : o)),
      ),
    [objects, onChange],
  );

  const toPct = useCallback((dxPx: number, dyPx: number) => {
    const host = hostRef.current?.getBoundingClientRect();
    if (!host || !host.width) return { dx: 0, dy: 0 };
    return { dx: (dxPx / host.width) * 100, dy: (dyPx / host.height) * 100 };
  }, []);

  const pointPct = useCallback((clientX: number, clientY: number) => {
    const host = hostRef.current?.getBoundingClientRect();
    if (!host || !host.width) return { x: 0, y: 0 };
    return {
      x: ((clientX - host.left) / host.width) * 100,
      y: ((clientY - host.top) / host.height) * 100,
    };
  }, []);

  /* ── The one drag loop ────────────────────────────────── */

  const drag = useRef<DragState>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const state = drag.current;
      if (!state) return;

      if (state.mode === "marquee") {
        const now = pointPct(e.clientX, e.clientY);
        const box = {
          x: Math.min(state.startX, now.x),
          y: Math.min(state.startY, now.y),
          width: Math.abs(now.x - state.startX),
          height: Math.abs(now.y - state.startY),
        };
        setMarquee(box);
        // Touched, not enclosed — a marquee that demands full containment
        // makes selecting a wide banner nearly impossible.
        setSelected(
          objects
            .filter(
              (o) =>
                o.x < box.x + box.width &&
                o.x + o.width > box.x &&
                o.y < box.y + box.height &&
                o.y + o.height > box.y,
            )
            .map((o) => o.id),
        );
        return;
      }

      const { dx, dy } = toPct(e.clientX - state.startX, e.clientY - state.startY);

      if (state.mode === "move") {
        state.moved = state.moved || Math.abs(dx) + Math.abs(dy) > 0.2;
        const lead = state.ids[0];
        const leadOrigin = state.origins.get(lead);
        if (!leadOrigin) return;

        // Snap the object under the pointer; everything else in the selection
        // rides the same corrected delta, so a group keeps its shape.
        const raw = { ...leadOrigin, x: leadOrigin.x + dx, y: leadOrigin.y + dy };
        const others = objects
          .filter((o) => !state.ids.includes(o.id))
          .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
        const snapped = snap(raw, others, { width: 100, height: 100 }, 1.4);
        setGuides(snapped.guides);

        const realDx = snapped.x - leadOrigin.x;
        const realDy = snapped.y - leadOrigin.y;
        const next = new Map<string, Partial<SlideObject>>();
        for (const id of state.ids) {
          const origin = state.origins.get(id);
          if (!origin) continue;
          next.set(id, {
            x: round(origin.x + realDx),
            y: round(origin.y + realDy),
          });
        }
        patchMany(next);
        return;
      }

      // Resize. Each grip moves two edges; the opposite corner stays put.
      const { grip, origin, aspect } = state;
      const west = grip === "nw" || grip === "sw";
      const north = grip === "nw" || grip === "ne";
      let width = Math.max(MIN_SIZE, origin.width + (west ? -dx : dx));
      let height = Math.max(MIN_SIZE, origin.height + (north ? -dy : dy));

      // Shift locks the proportions — the difference between cropping a
      // photograph and squashing it.
      if (e.shiftKey && aspect > 0) {
        if (width / aspect > height) height = width / aspect;
        else width = height * aspect;
      }

      patch(state.id, {
        width: round(width),
        height: round(height),
        x: round(west ? origin.x + origin.width - width : origin.x),
        y: round(north ? origin.y + origin.height - height : origin.y),
      });
    };

    const onUp = () => {
      drag.current = null;
      setGuides([]);
      setMarquee(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [objects, patch, patchMany, toPct, pointPct]);

  /* ── Empty space: deselect, or drag a marquee ─────────── */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // A click that landed on an object, a handle or the inspector has
      // already been dealt with by the component that owns it.
      if (target?.closest("[data-slide-object], [data-slide-inspector]")) return;
      // Clicking into the title or a bullet is editing the slide, not
      // arranging it — leave the caret alone and don't start a marquee.
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      setEditingText(null);
      if (!e.shiftKey) setSelected([]);
      if (typing) return;

      const start = pointPct(e.clientX, e.clientY);
      drag.current = { mode: "marquee", startX: start.x, startY: start.y };
    };

    stage.addEventListener("pointerdown", onPointerDown);
    return () => stage.removeEventListener("pointerdown", onPointerDown);
  }, [stageRef, pointPct]);

  /* ── Paste ────────────────────────────────────────────── */

  /**
   * One handler, one precedence: a picture on the clipboard wins, copied
   * shapes are the fallback. Two competing listeners — one for images, one
   * for objects — would race, and which one you got would depend on mount
   * order rather than on what you copied.
   *
   * Bound to the window rather than the stage because a slide has no text
   * cursor to aim with: after clicking an empty slide, focus is nowhere in
   * particular, and a stage-scoped listener would never fire.
   */
  const paste = useCallback(
    (extra: SlideObject[]) => {
      const top = Math.max(0, ...objects.map((o) => o.z));
      const copies = extra.map((o, i) => ({
        ...o,
        id: uid(),
        x: round(Math.min(o.x + 3, Math.max(0, 100 - o.width))),
        y: round(Math.min(o.y + 3, Math.max(0, 100 - o.height))),
        z: top + 1 + i,
      }));
      onChange([...objects, ...copies]);
      setSelected(copies.map((c) => c.id));
    },
    [objects, onChange],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;

      const file = imageFrom(e.clipboardData);
      if (file) {
        e.preventDefault();
        prepareImage(file).then(
          (image) => {
            const next = insertImageObject(objects, image);
            onChange(next);
            setSelected([next[next.length - 1].id]);
          },
          () => {},
        );
        return;
      }
      if (!objectClipboard.length) return;
      e.preventDefault();
      paste(objectClipboard);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [objects, onChange, paste]);

  /* ── Grabbing an object ───────────────────────────────── */

  const startMove = (e: React.PointerEvent, o: SlideObject) => {
    e.preventDefault();
    e.stopPropagation();
    // preventDefault suppresses the browser's focus-on-pointerdown, so take
    // focus explicitly — without it, arrow keys fall through to the deck's
    // slide navigation and "nudge the shape" becomes "next slide".
    (e.currentTarget as HTMLElement).focus();

    // Shift extends; grabbing something already selected drags the whole
    // selection; grabbing anything else replaces it.
    const ids = e.shiftKey
      ? selected.includes(o.id)
        ? selected.filter((id) => id !== o.id)
        : [...selected, o.id]
      : selected.includes(o.id)
        ? selected
        : [o.id];
    setSelected(ids);
    if (!ids.length) return;

    const origins = new Map<string, Rect>();
    for (const id of ids) {
      const item = objects.find((x) => x.id === id);
      if (item)
        origins.set(id, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        });
    }
    // The grabbed object leads, so snapping follows the pointer.
    drag.current = {
      mode: "move",
      ids: [o.id, ...ids.filter((id) => id !== o.id)],
      startX: e.clientX,
      startY: e.clientY,
      origins,
      moved: false,
    };
  };

  const startResize = (e: React.PointerEvent, o: SlideObject, grip: Grip) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      mode: "resize",
      id: o.id,
      grip,
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: o.x, y: o.y, width: o.width, height: o.height },
      aspect: o.height ? o.width / o.height : 0,
    };
  };

  /* ── Selection actions ────────────────────────────────── */

  const remove = useCallback(
    (ids: string[]) => {
      onChange(objects.filter((o) => !ids.includes(o.id)));
      setSelected([]);
    },
    [objects, onChange],
  );

  const duplicate = useCallback(
    (ids: string[]) => {
      const top = Math.max(0, ...objects.map((o) => o.z));
      const copies = objects
        .filter((o) => ids.includes(o.id))
        .map((o, i) => ({
          ...o,
          id: uid(),
          x: round(Math.min(o.x + 3, 100 - o.width)),
          y: round(Math.min(o.y + 3, 100 - o.height)),
          z: top + 1 + i,
        }));
      onChange([...objects, ...copies]);
      setSelected(copies.map((c) => c.id));
    },
    [objects, onChange],
  );

  const layer = useCallback(
    (ids: string[], dir: 1 | -1) => {
      const zs = objects.map((o) => o.z);
      const edge = dir === 1 ? Math.max(...zs, 0) : Math.min(...zs, 0);
      const next = new Map<string, Partial<SlideObject>>();
      ids.forEach((id, i) => next.set(id, { z: edge + dir * (i + 1) }));
      patchMany(next);
    },
    [objects, patchMany],
  );

  /** Alignment and distribution, through the geometry the board also uses. */
  const arrange = useCallback(
    (action: Alignment | "distributeX" | "distributeY") => {
      const rects: Rect[] = chosen.map((o) => ({
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      }));
      const placed =
        action === "distributeX"
          ? distribute(rects, "x")
          : action === "distributeY"
            ? distribute(rects, "y")
            : alignRects(rects, action);
      const next = new Map<string, Partial<SlideObject>>();
      chosen.forEach((o, i) =>
        next.set(o.id, { x: round(placed[i].x), y: round(placed[i].y) }),
      );
      patchMany(next);
    },
    [chosen, patchMany],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys handled here must not also reach the deck's slide navigation.
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    const step = e.shiftKey ? 5 : 1;

    if (mod && e.key.toLowerCase() === "d" && selected.length) {
      e.preventDefault();
      duplicate(selected);
    } else if (mod && e.key.toLowerCase() === "c" && selected.length) {
      objectClipboard = chosen.map((o) => ({ ...o }));
    } else if (mod) {
      return;
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      remove(selected);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelected([]);
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const next = new Map<string, Partial<SlideObject>>();
      for (const o of chosen)
        next.set(o.id, { x: round(o.x + dx), y: round(o.y + dy) });
      patchMany(next);
    }
  };

  return (
    <div
      ref={hostRef}
      // Transparent to the pointer: the title and bullets live underneath and
      // have to stay clickable. Objects opt back in one by one.
      className="pointer-events-none absolute inset-0"
    >
      {objects
        .slice()
        .sort((a, b) => a.z - b.z)
        .map((o) => (
          <div
            key={o.id}
            data-slide-object={o.kind}
            data-obj={o.kind}
            role="button"
            tabIndex={0}
            aria-label={`${o.kind} object`}
            aria-pressed={selected.includes(o.id)}
            onPointerDown={(e) => startMove(e, o)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (o.kind === "text") setEditingText(o.id);
            }}
            onKeyDown={onKeyDown}
            className={cn(
              "pointer-events-auto absolute cursor-grab outline-none",
              selected.includes(o.id) && "z-30",
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
                onKeyDown={(e) => e.stopPropagation()}
                className="absolute inset-0 resize-none bg-transparent outline-1 outline-accent"
                style={{
                  color: "var(--slide-fg)",
                  fontSize: `${o.textSize ?? 3}cqw`,
                  lineHeight: 1.25,
                }}
              />
            ) : (
              selected.includes(o.id) && (
                <>
                  <div className="pointer-events-none absolute -inset-px rounded-sm outline-1 outline-accent" />
                  {/* Only a lone object gets grips. Resizing several at once
                      from one corner is a promise the maths here doesn't
                      keep, and a grip that lies is worse than no grip. */}
                  {selected.length === 1 &&
                    GRIPS.map(([grip, cls]) => (
                      <button
                        key={grip}
                        type="button"
                        aria-label={`Resize ${grip}`}
                        onPointerDown={(e) => startResize(e, o, grip)}
                        className={cn(
                          "absolute size-3 touch-none rounded-full border border-accent bg-surface",
                          cls,
                        )}
                      />
                    ))}
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

      {marquee && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border border-accent bg-accent/10"
          style={{
            left: `${marquee.x}%`,
            top: `${marquee.y}%`,
            width: `${marquee.width}%`,
            height: `${marquee.height}%`,
          }}
        />
      )}

      {chosen.length > 0 && !editingText && (
        <ObjectInspector
          objects={chosen}
          onPatch={(next) => {
            const map = new Map<string, Partial<SlideObject>>();
            for (const o of chosen) map.set(o.id, next);
            patchMany(map);
          }}
          onLayer={(dir) => layer(selected, dir)}
          onArrange={arrange}
          onDuplicate={() => duplicate(selected)}
          onDelete={() => remove(selected)}
        />
      )}
    </div>
  );
}

/* ── Insertion ──────────────────────────────────────────── */

export function insertObject(
  objects: SlideObject[],
  // Pictures come in through `insertImageObject` — they need a file and their
  // own proportions, neither of which this can invent.
  kind: Exclude<SlideObject["kind"], "image">,
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

/** Slide aspect. Percent width and percent height are not the same length. */
const SLIDE_RATIO = 16 / 9;

/**
 * Place a picture, at its own proportions.
 *
 * Widths and heights on a slide are percentages of two different edges, so a
 * square photo in a 40×40 box comes out stretched. This solves for the height
 * that keeps the picture honest, then shrinks the box until it fits the slide
 * with room to breathe.
 */
export function insertImageObject(
  objects: SlideObject[],
  image: { src: string; width: number; height: number; name: string },
): SlideObject[] {
  const ratio = image.width && image.height ? image.width / image.height : 1.5;
  let width = 52;
  let height = (width * SLIDE_RATIO) / ratio;
  const MAX_HEIGHT = 64;
  if (height > MAX_HEIGHT) {
    width = (width * MAX_HEIGHT) / height;
    height = MAX_HEIGHT;
  }

  return [
    ...objects,
    {
      id: uid(),
      kind: "image",
      x: Math.round((100 - width) / 2),
      y: Math.round((100 - height) / 2),
      width: Math.round(width),
      height: Math.round(height),
      z: Math.max(0, ...objects.map((o) => o.z)) + 1,
      src: image.src,
      alt: image.name.replace(/\.[a-z0-9]+$/i, ""),
      fit: "cover",
      radius: 0,
    },
  ];
}

/* ── The adaptive inspector ─────────────────────────────── */

const ARRANGE: Array<[Alignment | "distributeX" | "distributeY", string, string]> = [
  ["left", "Align left", "M2 2v12M5 5h9M5 11h6"],
  ["centerX", "Align centres", "M8 1v14M4 5h8M5.5 11h5"],
  ["right", "Align right", "M14 2v12M2 5h9M5 11h6"],
  ["top", "Align top", "M2 2h12M5 5v9M11 5v6"],
  ["centerY", "Align middles", "M1 8h14M5 4v8M11 5.5v5"],
  ["bottom", "Align bottom", "M2 14h12M5 2v9M11 5v6"],
  ["distributeX", "Space evenly across", "M2 2v12M8 4v8M14 2v12"],
  ["distributeY", "Space evenly down", "M2 2h12M4 8h8M2 14h12"],
];

function ObjectInspector({
  objects,
  onPatch,
  onLayer,
  onArrange,
  onDuplicate,
  onDelete,
}: {
  /** The whole selection. Controls write the same value to all of it. */
  objects: SlideObject[];
  onPatch: (next: Partial<SlideObject>) => void;
  onLayer: (dir: 1 | -1) => void;
  onArrange: (action: Alignment | "distributeX" | "distributeY") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  // The first object stands for the selection in the controls. Showing a
  // blank whenever a group disagrees would mean every mixed selection loses
  // the ability to be set at all.
  const o = objects[0];
  const many = objects.length > 1;
  const uniform = (kind: SlideObject["kind"]) =>
    objects.every((x) => x.kind === kind);

  return (
    <div
      data-slide-inspector="true"
      className="anim-pop pointer-events-auto absolute top-2 right-2 z-40 w-[196px] rounded-md border border-line-strong bg-surface/95 p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <span className={cn("text-[10.5px] text-fg-subtle", !many && "capitalize")}>
          {many ? `${objects.length} selected` : o.kind}
        </span>
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            onClick={onDuplicate}
            aria-label="Duplicate"
            title="Duplicate (⌘D)"
            className="rounded-xs border border-line p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="copy" size={9} />
          </button>
          <button
            type="button"
            onClick={() => onLayer(1)}
            aria-label="Bring forward"
            title="Bring to front"
            className="rounded-xs border border-line p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="arrow-up" size={9} />
          </button>
          <button
            type="button"
            onClick={() => onLayer(-1)}
            aria-label="Send back"
            title="Send to back"
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

      {/* Align and distribute, from the same geometry the board uses — so
          "align left" cannot mean two different things in one app. */}
      {many && (
        <div className="mb-1.5 grid grid-cols-4 gap-0.5 border-b border-line pb-1.5">
          {ARRANGE.map(([action, label, d]) => (
            <button
              key={action}
              type="button"
              title={label}
              aria-label={label}
              disabled={action.startsWith("distribute") && objects.length < 3}
              onClick={() => onArrange(action)}
              className="grid h-6 place-items-center rounded-xs border border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg disabled:opacity-30"
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d={d} />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* A picture supplies its own colour, so the fill row would be a lie.
          What it needs instead is how it meets its box. */}
      {uniform("image") ? (
        <div className="flex gap-1">
          {(
            [
              ["cover", "Fill"],
              ["contain", "Fit"],
            ] as const
          ).map(([fit, label]) => (
            <button
              key={fit}
              type="button"
              aria-pressed={(o.fit ?? "cover") === fit}
              onClick={() => onPatch({ fit })}
              className={cn(
                "h-6 flex-1 rounded-xs border text-[10.5px] transition-colors",
                (o.fit ?? "cover") === fit
                  ? "border-accent text-fg"
                  : "border-line text-fg-subtle hover:border-line-strong",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
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
      )}

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

          {uniform("text") && (
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

          {uniform("image") && (
            <>
              <label className="mt-1.5 block">
                <span className="mb-0.5 flex justify-between text-[10px] text-fg-subtle">
                  Corners
                  <span className="font-mono">{o.radius ?? 0}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={o.radius ?? 0}
                  aria-label="Corner rounding"
                  onChange={(e) => onPatch({ radius: Number(e.target.value) })}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)]"
                />
              </label>
              <label className="mt-1.5 block">
                <span className="mb-0.5 block text-[10px] text-fg-subtle">
                  Alt text
                </span>
                <input
                  value={o.alt ?? ""}
                  disabled={many}
                  placeholder={many ? "One at a time" : "Describe the picture"}
                  onChange={(e) => onPatch({ alt: e.target.value })}
                  className="w-full rounded-xs border border-line bg-transparent px-1.5 py-1 font-mono text-[10px] text-fg-muted outline-none focus:border-line-strong"
                />
              </label>
            </>
          )}

          {!objects.some((x) => x.kind === "line") && (
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
