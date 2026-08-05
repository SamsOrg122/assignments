"use client";

/**
 * The Board — an infinite, pannable, zoomable canvas.
 *
 * Canvas base: a **custom transform layer**, not react-konva or tldraw.
 * The reason is the bridge. Board items aren't shapes — they're live React
 * components: an editable paragraph, a sticky you type into, and a project card
 * that renders a real preview of a Library project. react-konva rasterises to a
 * <canvas>, which would cost us DOM text editing, selection, accessibility and
 * every existing component; tldraw brings its own document model and chrome
 * that would fight both our store and the design language. A single
 * `translate/scale` on a container gives all of that for ~100 lines of pointer
 * maths, and the items stay ordinary DOM.
 *
 * World coordinates live in the document; pan/zoom is view state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardItem, BoardItemKind, PeerState, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";
import { BoardItemView } from "@/components/board/BoardItemView";
import { PromoteDialog } from "@/components/board/PromoteDialog";
import { Cursors } from "@/components/presence/Cursors";

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export function BoardEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const updateBoardItem = useProjects((s) => s.updateBoardItem);
  const addBoardItem = useProjects((s) => s.addBoardItem);
  const removeBoardItem = useProjects((s) => s.removeBoardItem);
  const raiseBoardItems = useProjects((s) => s.raiseBoardItems);
  const setViewport = useProjects((s) => s.setViewport);
  const notify = useUI((s) => s.notify);
  const openAI = useUI((s) => s.openAI);
  const router = useRouter();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>(
    () => project.viewport ?? { x: 0, y: 0, scale: 1 },
  );
  const [selection, setSelection] = useState<string[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  // Persist the viewport lazily — panning shouldn't thrash localStorage.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: Viewport) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(
        () => setViewport(project.id, next),
        400,
      );
    },
    [project.id, setViewport],
  );

  const items = useMemo(
    () => [...project.board].sort((a, b) => a.z - b.z),
    [project.board],
  );

  /** Screen point → world point. */
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      return {
        x: (clientX - left - view.x) / view.scale,
        y: (clientY - top - view.y) / view.scale,
      };
    },
    [view],
  );

  /* ── Pan & zoom ───────────────────────────────────────── */

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      setView((v) => {
        let next: Viewport;
        if (e.ctrlKey || e.metaKey) {
          // Pinch / ⌘-scroll zooms about the pointer, so the point under the
          // cursor stays put — the thing that makes zoom feel physical.
          const factor = Math.exp(-e.deltaY * 0.0022);
          const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
          const k = scale / v.scale;
          next = { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
        } else {
          next = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        }
        persist(next);
        return next;
      });
    };

    // Passive listeners can't preventDefault, and the page would scroll.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [persist]);

  const zoomBy = (factor: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const px = (rect?.width ?? 0) / 2;
    const py = (rect?.height ?? 0) / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      const next = { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      persist(next);
      return next;
    });
  };

  const fitToContent = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || items.length === 0) return;
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.width));
    const maxY = Math.max(...items.map((i) => i.y + i.height));
    const pad = 80;
    const scale = clamp(
      Math.min(rect.width / (maxX - minX + pad * 2), rect.height / (maxY - minY + pad * 2)),
      MIN_SCALE,
      1.4,
    );
    const next = {
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
    };
    setView(next);
    persist(next);
  }, [items, persist]);

  /* ── Surface interaction: pan on drag, marquee with shift ─ */

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.surface)
      return;

    const marqueeMode = e.shiftKey;
    const start = { x: e.clientX, y: e.clientY };
    const origin = { ...view };
    const world = toWorld(e.clientX, e.clientY);
    if (!marqueeMode) setSelection([]);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (marqueeMode) {
        const w = toWorld(ev.clientX, ev.clientY);
        setMarquee({ x0: world.x, y0: world.y, x1: w.x, y1: w.y });
      } else {
        setView({
          ...origin,
          x: origin.x + (ev.clientX - start.x),
          y: origin.y + (ev.clientY - start.y),
        });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setMarquee((m) => {
        if (m) {
          const [x0, x1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
          const [y0, y1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
          setSelection(
            items
              .filter(
                (i) =>
                  i.x + i.width > x0 &&
                  i.x < x1 &&
                  i.y + i.height > y0 &&
                  i.y < y1,
              )
              .map((i) => i.id),
          );
        } else {
          setView((v) => {
            persist(v);
            return v;
          });
        }
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ── Item drag ────────────────────────────────────────── */

  const dragItem = (item: BoardItem, e: React.PointerEvent) => {
    e.stopPropagation();
    const ids = selection.includes(item.id) ? selection : [item.id];
    if (!selection.includes(item.id)) setSelection(ids);
    raiseBoardItems(project.id, ids);

    const start = toWorld(e.clientX, e.clientY);
    const origins = new Map(
      items.filter((i) => ids.includes(i.id)).map((i) => [i.id, { x: i.x, y: i.y }]),
    );

    const onMove = (ev: PointerEvent) => {
      const now = toWorld(ev.clientX, ev.clientY);
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      for (const [id, origin] of origins)
        updateBoardItem(project.id, id, {
          x: Math.round(origin.x + dx),
          y: Math.round(origin.y + dy),
        });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ── Adding ───────────────────────────────────────────── */

  const addAtCentre = (kind: BoardItemKind, extra?: { projectId?: string }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const centre = toWorld(
      (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
      (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    );
    const id = addBoardItem(
      project.id,
      kind,
      { x: Math.round(centre.x - 90), y: Math.round(centre.y - 60) },
      extra,
    );
    setSelection([id]);
    return id;
  };

  /* ── Keyboard ─────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never steal keys from an item being edited.
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA"
      )
        return;

      if ((e.key === "Backspace" || e.key === "Delete") && selection.length) {
        e.preventDefault();
        for (const id of selection) removeBoardItem(project.id, id);
        setSelection([]);
        notify(`${selection.length} removed`);
      } else if (e.key.toLowerCase() === "p" && selection.length && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPromoting(true);
      } else if (e.key === "Escape") {
        setSelection([]);
      } else if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        fitToContent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, project.id, removeBoardItem, notify, fitToContent]);

  const peersByItem = useMemo(() => {
    const map = new Map<string, PeerState[]>();
    for (const p of peers) {
      if (!p.activeBlockId) continue;
      map.set(p.activeBlockId, [...(map.get(p.activeBlockId) ?? []), p]);
    }
    return map;
  }, [peers]);

  return (
    <>
      <ProjectTopBar
        project={project}
        peers={peers}
        tools={
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            {(
              [
                ["text", "text", "Text"],
                ["sticky", "sticky", "Sticky note"],
                ["image", "image", "Image"],
              ] as const
            ).map(([kind, icon, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => addAtCentre(kind)}
                title={label}
                aria-label={label}
                className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name={icon} size={13} />
              </button>
            ))}
            <DropInMenu
              projects={useProjects.getState().projects.filter((p) => p.id !== project.id)}
              onPick={(id) => addAtCentre("card", { projectId: id })}
            />
          </span>
        }
      />

      <main className="relative flex-1 overflow-hidden">
        <div
          ref={surfaceRef}
          data-surface="true"
          onPointerDown={onSurfacePointerDown}
          className="absolute inset-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
          style={{
            // The dot grid lives in screen space and is offset by the pan, so
            // it reads as the world moving rather than a static texture.
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.075) 1px, transparent 1px)",
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            }}
          >
            {items.map((item) => (
              <BoardItemView
                key={item.id}
                projectId={project.id}
                item={item}
                selected={selection.includes(item.id)}
                peers={peersByItem.get(item.id) ?? []}
                onPointerDown={(e) => dragItem(item, e)}
                onOpen={
                  item.kind === "card"
                    ? () => router.push(`/p/${item.projectId}`)
                    : undefined
                }
              />
            ))}

            {marquee && (
              <div
                className="pointer-events-none absolute border border-accent bg-accent/10"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
          </div>

          <Cursors peers={peers} />
        </div>

        {/* Selection actions — the bridge lives here. */}
        {selection.length > 0 && (
          <div className="anim-slide-up pointer-events-auto absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface/95 px-2.5 py-2 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur">
              <span className="font-mono text-[10px] text-fg-subtle">
                {selection.length} selected
              </span>
              <span className="h-4 w-px bg-line" />
              <button
                type="button"
                onClick={() => setPromoting(true)}
                className="flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition-[filter] duration-150 hover:brightness-110"
              >
                <Icon name="promote" size={11} />
                Promote to project
                <kbd className="kbd !border-white/20 !bg-white/15 !text-white/80">P</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  const first = items.find((i) => i.id === selection[0]);
                  const text = items
                    .filter((i) => selection.includes(i.id))
                    .map((i) => ("text" in i ? i.text : ""))
                    .filter(Boolean)
                    .join("\n");
                  openAI({
                    projectId: project.id,
                    blockId: first?.id ?? "",
                    blockType: "text",
                    selectionText: text,
                    anchor: { x: window.innerWidth / 2, y: 160 },
                  });
                }}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="sparkle" size={11} />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => {
                  for (const id of selection) removeBoardItem(project.id, id);
                  setSelection([]);
                }}
                aria-label="Delete selected"
                className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-150 hover:text-danger"
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute right-4 bottom-5 z-20 flex items-center gap-1 rounded-md border border-line bg-surface/90 p-1 backdrop-blur">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.25)}
            aria-label="Zoom out"
            className="rounded-xs p-1.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="minus" size={12} />
          </button>
          <button
            type="button"
            onClick={fitToContent}
            title="Fit to content (⌘0)"
            className="min-w-[46px] font-mono text-[10px] text-fg-muted transition-colors hover:text-fg"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="Zoom in"
            className="rounded-xs p-1.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="plus" size={12} />
          </button>
        </div>

        {items.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="text-center text-[13px] text-fg-subtle">
              An empty board.
              <br />
              <span className="font-mono text-[11px]">
                Add a sticky from the top bar · drag to pan · ⌘-scroll to zoom
              </span>
            </p>
          </div>
        )}
      </main>

      {promoting && (
        <PromoteDialog
          project={project}
          itemIds={selection}
          onClose={() => setPromoting(false)}
          onDone={() => setSelection([])}
        />
      )}
    </>
  );
}

function DropInMenu({
  projects,
  onPick,
}: {
  projects: Project[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Drop in a project"
        aria-label="Drop in a project"
        className="flex items-center gap-1 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
      >
        <Icon name="board" size={12} />
        Drop in
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute top-full right-0 z-40 mt-1.5 max-h-[260px] w-[240px] overflow-y-auto rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]">
            {projects.length === 0 ? (
              <p className="px-2 py-3 text-center text-[12px] text-fg-subtle">
                Nothing else in the library yet.
              </p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(p.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="truncate text-[12.5px] text-fg">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </span>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
