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
 *
 * Alignment, distribution and snapping come from `lib/geometry`, which the
 * slide stage also calls. "Align left" is the same function in both places, so
 * it can't mean two different things.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BoardConnectorItem,
  BoardItem,
  BoardItemKind,
  BoardTone,
  PeerState,
  Project,
} from "@/lib/types";
import { BOARD_TONES, isPositioned } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useMenu, type MenuItem } from "@/components/ui/Menu";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import {
  align as alignRects,
  distribute as distributeRects,
  snap,
  type Alignment,
  type Rect,
} from "@/lib/geometry";
import { routeConnector } from "@/lib/board-routing";
import { uid } from "@/lib/factories";
import { stampTemplate, type BoardTemplate } from "@/lib/board-templates";
import { ProjectTopBar } from "./ProjectTopBar";
import { BoardItemView, type Grip } from "@/components/board/BoardItemView";
import { PromoteDialog } from "@/components/board/PromoteDialog";
import { Connectors } from "@/components/board/Connectors";
import { Minimap } from "@/components/board/Minimap";
import { ArrangeMenu } from "@/components/board/ArrangeMenu";
import { TemplateGallery } from "@/components/board/TemplateGallery";
import { Cursors } from "@/components/presence/Cursors";

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const MIN_SIZE = 60;
/** Below this the minimap is decoration; above it, it's orientation. */
const MAP_THRESHOLD = 8;

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/** Connector mode: off, armed, or holding the first endpoint. */
type ConnectState = { from: string | null } | null;

const TONE_LABEL: Record<BoardTone, string> = {
  neutral: "Neutral",
  accent: "Accent",
  mint: "Mint",
  warn: "Warn",
};

export function BoardEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const updateBoardItem = useProjects((s) => s.updateBoardItem);
  const patchBoardItems = useProjects((s) => s.patchBoardItems);
  const addBoardItem = useProjects((s) => s.addBoardItem);
  const addBoardItems = useProjects((s) => s.addBoardItems);
  const removeBoardItems = useProjects((s) => s.removeBoardItems);
  const raiseBoardItems = useProjects((s) => s.raiseBoardItems);
  const lowerBoardItems = useProjects((s) => s.lowerBoardItems);
  const groupBoardItems = useProjects((s) => s.groupBoardItems);
  const ungroupBoardItems = useProjects((s) => s.ungroupBoardItems);
  const setViewport = useProjects((s) => s.setViewport);
  const notify = useUI((s) => s.notify);
  const openAI = useUI((s) => s.openAI);
  const router = useRouter();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>(
    () => project.viewport ?? { x: 0, y: 0, scale: 1 },
  );
  const [selection, setSelection] = useState<string[]>([]);
  const menu = useMenu();
  const [promoting, setPromoting] = useState(false);
  const [templating, setTemplating] = useState(false);
  const [connect, setConnect] = useState<ConnectState>(null);
  const [labelling, setLabelling] = useState<string | null>(null);
  const [guides, setGuides] = useState<Array<{ axis: "x" | "y"; at: number }>>(
    [],
  );
  const [mapOn, setMapOn] = useState(true);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
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

  /** Frames always sit under everything; the rest stack by z. */
  const items = useMemo(
    () =>
      [...project.board].sort(
        (a, b) =>
          (a.kind === "frame" ? 0 : 1) - (b.kind === "frame" ? 0 : 1) ||
          a.z - b.z,
      ),
    [project.board],
  );
  const blocks = useMemo(() => items.filter(isPositioned), [items]);

  const byId = useMemo(() => {
    const map = new Map<string, BoardItem>();
    for (const i of project.board) map.set(i.id, i);
    return map;
  }, [project.board]);

  /**
   * Selecting one member of a group selects all of it. Done at the edge rather
   * than inside every action, so nothing downstream has to remember groups
   * exist.
   */
  const expandGroups = useCallback(
    (ids: string[]) => {
      const groups = new Set(
        ids.map((id) => byId.get(id)?.groupId).filter(Boolean),
      );
      if (!groups.size) return ids;
      const out = new Set(ids);
      for (const i of project.board)
        if (i.groupId && groups.has(i.groupId)) out.add(i.id);
      return [...out];
    },
    [byId, project.board],
  );

  const select = useCallback(
    (ids: string[]) => setSelection(expandGroups(ids)),
    [expandGroups],
  );

  const selected = useMemo(
    () => selection.map((id) => byId.get(id)).filter(Boolean) as BoardItem[],
    [selection, byId],
  );

  /**
   * Screen point → world point, read through a ref rather than the render
   * closure. Keyboard handlers are bound once and would otherwise convert
   * against whatever the viewport was when they were bound — "add a sticky"
   * after a pan would land it off-screen.
   */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
    // One place where the viewport reaches the document. Every zoom, pan and
    // fit just moves local state; this watches the result and writes it once
    // things settle, so no handler has to remember to persist.
    persist(view);
  }, [view, persist]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.scale,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.scale,
    };
  }, []);

  const centreWorld = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return toWorld(
      (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
      (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    );
  }, [toWorld]);

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
        return next;
      });
    };

    // Passive listeners can't preventDefault, and the page would scroll.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [persist]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSurfaceSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomBy = (factor: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const px = (rect?.width ?? 0) / 2;
    const py = (rect?.height ?? 0) / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const fitToContent = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || blocks.length === 0) return;
    const minX = Math.min(...blocks.map((i) => i.x));
    const minY = Math.min(...blocks.map((i) => i.y));
    const maxX = Math.max(...blocks.map((i) => i.x + i.width));
    const maxY = Math.max(...blocks.map((i) => i.y + i.height));
    const pad = 80;
    const scale = clamp(
      Math.min(
        rect.width / (maxX - minX + pad * 2),
        rect.height / (maxY - minY + pad * 2),
      ),
      MIN_SCALE,
      1.4,
    );
    const next = {
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
    };
    setView(next);
  }, [blocks]);

  const jumpTo = useCallback(
    (world: { x: number; y: number }) => {
      setView((v) => ({
        ...v,
        x: surfaceSize.width / 2 - world.x * v.scale,
        y: surfaceSize.height / 2 - world.y * v.scale,
      }));
    },
    [surfaceSize],
  );

  /* ── Arrange (shared geometry) ────────────────────────── */

  const movable = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => byId.get(id))
        .filter(
          (i): i is Exclude<BoardItem, BoardConnectorItem> =>
            !!i && isPositioned(i) && !i.locked,
        ),
    [byId],
  );

  const applyRects = (
    subjects: Array<{ id: string }>,
    next: Rect[],
  ) => {
    const patches: Record<string, Partial<BoardItem>> = {};
    subjects.forEach((s, n) => {
      patches[s.id] = { x: Math.round(next[n].x), y: Math.round(next[n].y) };
    });
    patchBoardItems(project.id, patches);
  };

  const doAlign = (edge: Alignment) => {
    const subjects = movable(selection);
    if (subjects.length < 2) return;
    applyRects(subjects, alignRects(subjects.map(toRect), edge));
    notify(`Aligned ${subjects.length} items`);
  };

  const doDistribute = (axis: "x" | "y") => {
    const subjects = movable(selection);
    if (subjects.length < 3) return;
    applyRects(subjects, distributeRects(subjects.map(toRect), axis));
    notify("Spaced evenly");
  };

  const setLocked = useCallback(
    (ids: string[], locked: boolean) => {
      const patches: Record<string, Partial<BoardItem>> = {};
      for (const id of ids) patches[id] = { locked };
      patchBoardItems(project.id, patches);
      notify(locked ? "Locked" : "Unlocked");
    },
    [notify, patchBoardItems, project.id],
  );

  const setTone = (ids: string[], tone: BoardTone) => {
    const patches: Record<string, Partial<BoardItem>> = {};
    for (const id of ids) {
      const item = byId.get(id);
      if (item && "tone" in item) patches[id] = { tone };
    }
    patchBoardItems(project.id, patches);
  };

  /* ── Connectors ───────────────────────────────────────── */

  const connectPair = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const exists = project.board.some(
        (i) =>
          i.kind === "connector" &&
          ((i.fromId === fromId && i.toId === toId) ||
            (i.fromId === toId && i.toId === fromId)),
      );
      if (exists) return;
      addBoardItem(project.id, "connector", { x: 0, y: 0 }, { fromId, toId });
    },
    [addBoardItem, project.board, project.id],
  );

  const pickConnect = (id: string) => {
    if (!connect) return;
    // The store write happens here, not inside a setState updater: React may
    // run an updater more than once, and a side effect in there creates the
    // connector twice.
    if (connect.from) connectPair(connect.from, id);
    // Stay armed on the item just reached, so a→b→c is one click each.
    setConnect({ from: id });
  };

  const connectSelection = () => {
    // Reading order, so "connect these five" produces the chain you'd draw.
    const chain = movable(selection).sort(
      (a, b) => a.y - b.y || a.x - b.x,
    );
    if (chain.length < 2) return;
    for (let i = 0; i < chain.length - 1; i++)
      connectPair(chain[i].id, chain[i + 1].id);
    notify(`${chain.length - 1} connectors added`);
  };

  /* ── Templates ────────────────────────────────────────── */

  const stamp = (template: BoardTemplate) => {
    // Land beside what's already there, never on top of it. Dropping a kanban
    // board through someone's existing notes is the kind of "helpful" that
    // costs ten minutes of untangling.
    const at = blocks.length
      ? {
          x: Math.max(...blocks.map((i) => i.x + i.width)) + 160,
          y: Math.min(...blocks.map((i) => i.y)),
        }
      : (() => {
          const c = centreWorld();
          return { x: c.x - 600, y: c.y - 260 };
        })();
    const created = stampTemplate(template, at);
    addBoardItems(project.id, created);
    setTemplating(false);
    setSelection([]);
    notify(`${template.name} added`);

    // Frame what was just stamped. Computed from `created` rather than by
    // re-measuring the board, because the store write hasn't reached this
    // component yet — fitting here would fit to the *previous* contents.
    const placed = created.filter(isPositioned);
    const minX = Math.min(...placed.map((i) => i.x));
    const minY = Math.min(...placed.map((i) => i.y));
    const maxX = Math.max(...placed.map((i) => i.x + i.width));
    const maxY = Math.max(...placed.map((i) => i.y + i.height));
    const pad = 90;
    const scale = clamp(
      Math.min(
        (surfaceSize.width || 900) / (maxX - minX + pad * 2),
        (surfaceSize.height || 600) / (maxY - minY + pad * 2),
      ),
      MIN_SCALE,
      1.2,
    );
    const next = {
      scale,
      x: (surfaceSize.width || 900) / 2 - ((minX + maxX) / 2) * scale,
      y: (surfaceSize.height || 600) / 2 - ((minY + maxY) / 2) * scale,
    };
    setView(next);
  };

  /* ── Context menus ────────────────────────────────────── */

  const boardItemMenu = (item: BoardItem): MenuItem[] => {
    const ids = selection.includes(item.id)
      ? selection
      : expandGroups([item.id]);
    const many = ids.length > 1;
    const anyLocked = ids.some((id) => byId.get(id)?.locked);
    const anyGrouped = ids.some((id) => byId.get(id)?.groupId);

    const out: MenuItem[] = [];

    if (item.kind === "card")
      out.push({
        kind: "item",
        label: "Open project",
        icon: "arrow-right",
        onSelect: () => router.push(`/p/${item.projectId}`),
      });

    if (item.kind === "connector") {
      out.push(
        {
          kind: "item",
          label: item.label ? "Edit label" : "Add label",
          icon: "text",
          onSelect: () => setLabelling(item.id),
        },
        {
          kind: "submenu",
          label: "Route",
          icon: "link",
          items: (["curve", "elbow", "straight"] as const).map((route) => ({
            kind: "item" as const,
            label: route[0].toUpperCase() + route.slice(1),
            checked: item.route === route,
            onSelect: () => updateBoardItem(project.id, item.id, { route }),
          })),
        },
        {
          kind: "submenu",
          label: "Arrows",
          icon: "arrow-right",
          items: (
            [
              ["end", "One way"],
              ["both", "Both ways"],
              ["none", "No arrow"],
            ] as const
          ).map(([arrow, label]) => ({
            kind: "item" as const,
            label,
            checked: item.arrow === arrow,
            onSelect: () => updateBoardItem(project.id, item.id, { arrow }),
          })),
        },
        {
          kind: "item",
          label: item.dashed ? "Solid line" : "Dashed line",
          icon: "minus",
          onSelect: () =>
            updateBoardItem(project.id, item.id, { dashed: !item.dashed }),
        },
      );
    } else {
      out.push(
        {
          kind: "item",
          label: "Connect from here",
          icon: "link",
          shortcut: "C",
          onSelect: () => {
            setConnect({ from: item.id });
            notify("Click another item to connect");
          },
        },
        {
          kind: "item",
          label: "Bring to front",
          icon: "arrow-up",
          onSelect: () => raiseBoardItems(project.id, ids),
        },
        {
          kind: "item",
          label: many ? `Duplicate ${ids.length} items` : "Duplicate",
          icon: "copy",
          shortcut: "⌘D",
          onSelect: () => duplicate(ids),
        },
      );
    }

    if ("tone" in item)
      out.push({
        kind: "submenu",
        label: "Colour",
        icon: "sticky",
        items: BOARD_TONES.map((tone) => ({
          kind: "item" as const,
          label: TONE_LABEL[tone],
          checked: item.tone === tone,
          onSelect: () => setTone(ids, tone),
        })),
      });

    out.push({ kind: "separator" });

    if (item.kind !== "connector") {
      if (many && !anyGrouped)
        out.push({
          kind: "item",
          label: `Group ${ids.length} items`,
          icon: "group",
          shortcut: "⌘G",
          onSelect: () => {
            groupBoardItems(project.id, ids);
            notify("Grouped");
          },
        });
      if (anyGrouped)
        out.push({
          kind: "item",
          label: "Ungroup",
          icon: "group",
          shortcut: "⌘⇧G",
          onSelect: () => ungroupBoardItems(project.id, ids),
        });
      out.push(
        {
          kind: "item",
          label: anyLocked ? "Unlock" : "Lock",
          icon: anyLocked ? "unlock" : "lock",
          shortcut: "⌘L",
          onSelect: () => setLocked(ids, !anyLocked),
        },
        {
          kind: "item",
          label: many
            ? `Promote ${ids.length} into a project`
            : "Promote to project",
          icon: "promote",
          shortcut: "P",
          onSelect: () => {
            select(ids);
            setPromoting(true);
          },
        },
        { kind: "separator" },
      );
    }

    out.push({
      kind: "item",
      label: many ? `Delete ${ids.length} items` : "Delete",
      icon: "trash",
      danger: true,
      shortcut: "⌫",
      onSelect: () => {
        removeBoardItems(project.id, ids);
        setSelection([]);
      },
    });

    return out;
  };

  const surfaceMenu = (world: { x: number; y: number }): MenuItem[] => [
    {
      kind: "item",
      label: "Add a sticky",
      icon: "sticky",
      shortcut: "N",
      onSelect: () => addAt("sticky", world),
    },
    {
      kind: "item",
      label: "Add text",
      icon: "text",
      onSelect: () => addAt("text", world),
    },
    {
      kind: "item",
      label: "Add a frame",
      icon: "frame",
      shortcut: "F",
      onSelect: () => addAt("frame", world),
    },
    {
      kind: "item",
      label: "Add an image",
      icon: "image",
      onSelect: () => addAt("image", world),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Start from a template…",
      icon: "board",
      onSelect: () => setTemplating(true),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Select all",
      icon: "focus",
      shortcut: "⌘A",
      onSelect: () => select(blocks.map((i) => i.id)),
    },
    {
      kind: "item",
      label: "Fit to content",
      icon: "focus",
      shortcut: "⌘0",
      onSelect: fitToContent,
    },
  ];

  /**
   * Everything a marquee touched. Frames are excluded when they aren't the
   * only thing caught: dragging a box over a section means "these notes", not
   * "this section and everything in it", and including the frame would make
   * the next drag move the whole board.
   */
  const selectWithin = useCallback(
    (box: { x0: number; y0: number; x1: number; y1: number }) => {
      const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
      const [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
      const hit = blocks.filter(
        (i) =>
          i.x + i.width > x0 && i.x < x1 && i.y + i.height > y0 && i.y < y1,
      );
      const withoutFrames = hit.filter((i) => i.kind !== "frame");
      select((withoutFrames.length ? withoutFrames : hit).map((i) => i.id));
    },
    [blocks, select],
  );

  /* ── Surface interaction: pan on drag, marquee with shift ─ */

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    if (
      e.target !== e.currentTarget &&
      !(e.target as HTMLElement).dataset.surface
    )
      return;
    if (e.button !== 0) return;

    const marqueeMode = e.shiftKey;
    const start = { x: e.clientX, y: e.clientY };
    const origin = { ...view };
    const world = toWorld(e.clientX, e.clientY);
    if (!marqueeMode) setSelection([]);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // The live rect is tracked here rather than read back out of state on
    // pointerup: deciding what a marquee caught is a side effect, and side
    // effects don't belong in a setState updater.
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;

    const onMove = (ev: PointerEvent) => {
      if (marqueeMode) {
        const w = toWorld(ev.clientX, ev.clientY);
        box = { x0: world.x, y0: world.y, x1: w.x, y1: w.y };
        setMarquee(box);
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
      setMarquee(null);
      if (box) selectWithin(box);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ── Item drag ────────────────────────────────────────── */

  const dragItem = (item: BoardItem, e: React.PointerEvent) => {
    e.stopPropagation();

    // Shift is two gestures, told apart by whether the pointer moves.
    // A shift-*click* extends the selection — the gesture everyone brings from
    // Figma. A shift-*drag* is a marquee, even when it starts on top of
    // something: a frame covers the notes inside it, so requiring a marquee to
    // begin on empty canvas would make the notes in a frame unselectable as a
    // group.
    if (e.shiftKey) {
      const group = expandGroups([item.id]);
      const from = toWorld(e.clientX, e.clientY);
      const start = { x: e.clientX, y: e.clientY };
      let box: { x0: number; y0: number; x1: number; y1: number } | null = null;

      const onMove = (ev: PointerEvent) => {
        if (
          !box &&
          Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4
        )
          return;
        const w = toWorld(ev.clientX, ev.clientY);
        box = { x0: from.x, y0: from.y, x1: w.x, y1: w.y };
        setMarquee(box);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setMarquee(null);
        if (box) selectWithin(box);
        else
          setSelection((s) =>
            s.includes(item.id)
              ? s.filter((id) => !group.includes(id))
              : [...new Set([...s, ...group])],
          );
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return;
    }

    const ids = selection.includes(item.id)
      ? selection
      : expandGroups([item.id]);
    if (!selection.includes(item.id)) setSelection(ids);
    if (item.locked) return;

    const moving = movable(ids);
    // A frame carries whatever it contains — that's what makes it a section
    // rather than a rectangle you drew behind things.
    const carried = new Map(moving.map((i) => [i.id, i]));
    for (const f of moving)
      if (f.kind === "frame")
        for (const other of blocks)
          if (
            !carried.has(other.id) &&
            !other.locked &&
            other.x + other.width / 2 > f.x &&
            other.x + other.width / 2 < f.x + f.width &&
            other.y + other.height / 2 > f.y &&
            other.y + other.height / 2 < f.y + f.height
          )
            carried.set(other.id, other);

    if (!carried.size) return;
    raiseBoardItems(
      project.id,
      moving.filter((i) => i.kind !== "frame").map((i) => i.id),
    );

    const start = toWorld(e.clientX, e.clientY);
    const origins = new Map(
      [...carried.values()].map((i) => [i.id, { x: i.x, y: i.y }]),
    );
    // Snap the grabbed item against everything that isn't coming along.
    const others = blocks
      .filter((i) => !carried.has(i.id))
      .slice(0, 240)
      .map(toRect);
    const grabbed = toRect(item);
    const threshold = 7 / view.scale;

    const onMove = (ev: PointerEvent) => {
      const now = toWorld(ev.clientX, ev.clientY);
      let dx = now.x - start.x;
      let dy = now.y - start.y;

      const moved = { ...grabbed, x: grabbed.x + dx, y: grabbed.y + dy };
      const s = snap(moved, others, null, threshold);
      dx += s.x - moved.x;
      dy += s.y - moved.y;
      setGuides(s.guides);

      const patches: Record<string, Partial<BoardItem>> = {};
      for (const [id, origin] of origins)
        patches[id] = {
          x: Math.round(origin.x + dx),
          y: Math.round(origin.y + dy),
        };
      patchBoardItems(project.id, patches);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setGuides([]);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ── Item resize ──────────────────────────────────────── */

  const resizeItem = (item: BoardItem, e: React.PointerEvent, grip: Grip) => {
    const start = toWorld(e.clientX, e.clientY);
    const o = toRect(item);
    const min = item.kind === "frame" ? 140 : MIN_SIZE;

    const onMove = (ev: PointerEvent) => {
      const now = toWorld(ev.clientX, ev.clientY);
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      let { x, y, width, height } = o;

      if (grip === "ne" || grip === "se") width = Math.max(min, o.width + dx);
      if (grip === "nw" || grip === "sw") {
        width = Math.max(min, o.width - dx);
        x = o.x + (o.width - width);
      }
      if (grip === "se" || grip === "sw") height = Math.max(min, o.height + dy);
      if (grip === "ne" || grip === "nw") {
        height = Math.max(min, o.height - dy);
        y = o.y + (o.height - height);
      }

      updateBoardItem(project.id, item.id, {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
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

  const addAt = useCallback(
    (
      kind: BoardItemKind,
      world: { x: number; y: number },
      extra?: { projectId?: string },
    ) => {
      const id = addBoardItem(
        project.id,
        kind,
        {
          x: Math.round(world.x - (kind === "frame" ? 280 : 90)),
          y: Math.round(world.y - (kind === "frame" ? 210 : 60)),
        },
        extra,
      );
      setSelection([id]);
      return id;
    },
    [addBoardItem, project.id],
  );

  const addAtCentre = useCallback(
    (kind: BoardItemKind, extra?: { projectId?: string }) =>
      addAt(kind, centreWorld(), extra),
    [addAt, centreWorld],
  );

  const duplicate = useCallback(
    (ids: string[]) => {
      const copies: BoardItem[] = [];
      const now = Date.now();
      for (const id of ids) {
        const source = byId.get(id);
        if (!source || source.kind === "connector") continue;
        // Offset the copy so it doesn't land exactly on the original, and drop
        // its group and its comment thread — a duplicate inherits the shape,
        // not the conversation.
        copies.push({
          ...source,
          id: uid(),
          x: source.x + 24,
          y: source.y + 24,
          z: now + copies.length,
          groupId: undefined,
          comments: undefined,
        });
      }
      if (!copies.length) return;
      addBoardItems(project.id, copies);
      setSelection(copies.map((c) => c.id));
    },
    [addBoardItems, byId, project.id],
  );

  /* ── Keyboard ─────────────────────────────────────────── */

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const patches: Record<string, Partial<BoardItem>> = {};
      for (const i of movable(selection))
        patches[i.id] = { x: i.x + dx, y: i.y + dy };
      patchBoardItems(project.id, patches);
    },
    [movable, patchBoardItems, project.id, selection],
  );

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

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key.startsWith("Arrow") && selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudge(
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        );
      } else if ((e.key === "Backspace" || e.key === "Delete") && selection.length) {
        e.preventDefault();
        removeBoardItems(project.id, selection);
        notify(`${selection.length} removed`);
        setSelection([]);
      } else if (mod && key === "a") {
        e.preventDefault();
        select(blocks.map((i) => i.id));
      } else if (mod && key === "d" && selection.length) {
        e.preventDefault();
        duplicate(selection);
      } else if (mod && key === "g" && selection.length > 1) {
        e.preventDefault();
        if (e.shiftKey) ungroupBoardItems(project.id, selection);
        else {
          groupBoardItems(project.id, selection);
          notify("Grouped");
        }
      } else if (mod && key === "l" && selection.length) {
        e.preventDefault();
        setLocked(selection, !selected.some((i) => i.locked));
      } else if (mod && e.key === "0") {
        e.preventDefault();
        fitToContent();
      } else if (mod) {
        return;
      } else if (key === "p" && selection.length) {
        e.preventDefault();
        setPromoting(true);
      } else if (key === "c") {
        e.preventDefault();
        setConnect((c) => (c ? null : { from: selection[0] ?? null }));
      } else if (key === "f") {
        e.preventDefault();
        addAtCentre("frame");
      } else if (key === "n") {
        e.preventDefault();
        addAtCentre("sticky");
      } else if (e.key === "Escape") {
        if (connect) setConnect(null);
        else setSelection([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Every action is listed rather than suppressed: the handler is rebound on
    // each render, which costs one add/removeEventListener pair and removes a
    // whole family of stale-closure bugs (nudging a selection that has since
    // changed, adding an item at a viewport you've already panned away from).
  }, [
    selection,
    selected,
    blocks,
    connect,
    project.id,
    nudge,
    duplicate,
    select,
    setLocked,
    addAtCentre,
    fitToContent,
    groupBoardItems,
    ungroupBoardItems,
    removeBoardItems,
    notify,
  ]);

  const peersByItem = useMemo(() => {
    const map = new Map<string, PeerState[]>();
    for (const p of peers) {
      if (!p.activeBlockId) continue;
      map.set(p.activeBlockId, [...(map.get(p.activeBlockId) ?? []), p]);
    }
    return map;
  }, [peers]);

  const labelTarget = labelling
    ? (byId.get(labelling) as BoardConnectorItem | undefined)
    : undefined;
  const labelAt = useMemo(() => {
    if (!labelTarget) return null;
    const from = byId.get(labelTarget.fromId);
    const to = byId.get(labelTarget.toId);
    if (!from || !to) return null;
    return routeConnector(from, to, labelTarget.route).mid;
  }, [labelTarget, byId]);

  const guideSpan = useMemo(() => {
    if (!blocks.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...blocks.map((i) => i.x)) - 400;
    const y = Math.min(...blocks.map((i) => i.y)) - 400;
    return {
      x,
      y,
      w: Math.max(...blocks.map((i) => i.x + i.width)) - x + 400,
      h: Math.max(...blocks.map((i) => i.y + i.height)) - y + 400,
    };
  }, [blocks]);

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
                ["frame", "frame", "Frame"],
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
            <button
              type="button"
              onClick={() => setConnect((c) => (c ? null : { from: null }))}
              title="Connect items (C)"
              aria-label="Connect items"
              aria-pressed={!!connect}
              className={cnBtn(!!connect)}
            >
              <Icon name="link" size={13} />
            </button>
            <button
              type="button"
              onClick={() => setTemplating(true)}
              className="flex items-center gap-1 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              <Icon name="board" size={12} />
              Template
            </button>
            <DropInMenu
              projects={useProjects
                .getState()
                .projects.filter((p) => p.id !== project.id)}
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
          onContextMenu={(e) => {
            if (
              e.target !== e.currentTarget &&
              !(e.target as HTMLElement).dataset.surface
            )
              return;
            menu.open(e, surfaceMenu(toWorld(e.clientX, e.clientY)));
          }}
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
            <Connectors
              items={items}
              selection={selection}
              layer="lines"
              onSelect={(id, additive) =>
                setSelection((s) =>
                  additive ? [...new Set([...s, id])] : [id],
                )
              }
              onContextMenu={(e, item) => {
                setSelection([item.id]);
                menu.open(e, boardItemMenu(item));
              }}
              onEditLabel={(item) => setLabelling(item.id)}
            />

            {items.map((item) =>
              item.kind === "connector" ? null : (
                <BoardItemView
                  key={item.id}
                  projectId={project.id}
                  item={item}
                  selected={selection.includes(item.id)}
                  connecting={!!connect}
                  peers={peersByItem.get(item.id) ?? []}
                  onPointerDown={(e) => dragItem(item, e)}
                  onResize={(e, grip) => resizeItem(item, e, grip)}
                  onConnectPick={() => pickConnect(item.id)}
                  onContextMenu={(e) => {
                    // Right-clicking an unselected item selects it first, so
                    // the menu always acts on what's under the pointer.
                    if (!selection.includes(item.id)) select([item.id]);
                    menu.open(e, boardItemMenu(item));
                  }}
                  onOpen={
                    item.kind === "card"
                      ? () => router.push(`/p/${item.projectId}`)
                      : undefined
                  }
                />
              ),
            )}

            <Connectors
              items={items}
              selection={selection}
              layer="labels"
              onSelect={(id, additive) =>
                setSelection((s) =>
                  additive ? [...new Set([...s, id])] : [id],
                )
              }
              onContextMenu={(e, item) => {
                setSelection([item.id]);
                menu.open(e, boardItemMenu(item));
              }}
              onEditLabel={(item) => setLabelling(item.id)}
            />

            {/* Alignment guides — they exist only while something is snapped,
                which is what makes them read as feedback and not decoration. */}
            {guides.map((g, n) => (
              <div
                key={n}
                className="pointer-events-none absolute bg-accent"
                style={
                  g.axis === "x"
                    ? {
                        left: g.at,
                        top: guideSpan.y,
                        width: 1 / view.scale,
                        height: guideSpan.h,
                      }
                    : {
                        left: guideSpan.x,
                        top: g.at,
                        height: 1 / view.scale,
                        width: guideSpan.w,
                      }
                }
              />
            ))}

            {labelTarget && labelAt && (
              <input
                autoFocus
                defaultValue={labelTarget.label ?? ""}
                aria-label="Connector label"
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  updateBoardItem(project.id, labelTarget.id, {
                    label: e.target.value.trim() || undefined,
                  });
                  setLabelling(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setLabelling(null);
                }}
                className="absolute z-30 w-[128px] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-accent bg-surface px-1.5 py-1 text-center text-[11px] text-fg outline-none"
                style={{ left: labelAt.x, top: labelAt.y }}
              />
            )}

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

        {connect && (
          <div className="anim-slide-up pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
            <p className="flex items-center gap-2 rounded-full border border-accent bg-surface/95 px-3 py-1.5 text-[12px] text-fg backdrop-blur">
              <Icon name="link" size={11} className="text-accent" />
              {connect.from
                ? "Click the item to connect to. Escape to stop."
                : "Click an item to start a connection. Escape to stop."}
            </p>
          </div>
        )}

        {/* Selection actions — the bridge lives here. */}
        {selection.length > 0 && (
          <div className="anim-slide-up pointer-events-auto absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface/95 px-2.5 py-2 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur">
              <span className="font-mono text-[10px] text-fg-subtle">
                {selection.length} selected
              </span>
              <span className="h-4 w-px bg-line" />

              <ArrangeMenu
                count={selection.length}
                grouped={selected.some((i) => i.groupId)}
                locked={selected.some((i) => i.locked)}
                onAlign={doAlign}
                onDistribute={doDistribute}
                onGroup={() => {
                  groupBoardItems(project.id, selection);
                  notify("Grouped");
                }}
                onUngroup={() => ungroupBoardItems(project.id, selection)}
                onLock={(locked) => setLocked(selection, locked)}
                onRaise={() => raiseBoardItems(project.id, selection)}
                onLower={() => lowerBoardItems(project.id, selection)}
              />

              {selection.length > 1 && (
                <button
                  type="button"
                  onClick={connectSelection}
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  <Icon name="link" size={11} />
                  Connect
                </button>
              )}

              <button
                type="button"
                onClick={() => setPromoting(true)}
                className="flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
              >
                <Icon name="promote" size={11} />
                Promote to project
                <kbd className="kbd !border-white/20 !bg-white/15 !text-white/80">
                  P
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  const first = selected[0];
                  const text = selected
                    .map((i) =>
                      "text" in i ? i.text : i.kind === "frame" ? i.title : "",
                    )
                    .filter(Boolean)
                    .join("\n");
                  openAI({
                    projectId: project.id,
                    blockId: first?.id ?? "",
                    blockType: "board",
                    selectionText: text,
                    selectionIds: selection,
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
                  removeBoardItems(project.id, selection);
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

        {/* Viewport controls: overview and zoom, bottom-right. */}
        <div className="absolute right-4 bottom-5 z-20 flex flex-col items-end gap-2">
          {mapOn && blocks.length >= MAP_THRESHOLD && (
            <Minimap
              items={items}
              view={view}
              surface={surfaceSize}
              onJump={jumpTo}
            />
          )}
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface/90 p-1 backdrop-blur">
            {blocks.length >= MAP_THRESHOLD && (
              <button
                type="button"
                onClick={() => setMapOn((v) => !v)}
                aria-label="Toggle board overview"
                aria-pressed={mapOn}
                className={
                  mapOn
                    ? "rounded-xs p-1.5 text-accent"
                    : "rounded-xs p-1.5 text-fg-subtle transition-colors hover:text-fg"
                }
              >
                <Icon name="map" size={12} />
              </button>
            )}
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
        </div>

        {items.length === 0 && (
          <div className="absolute inset-0 grid place-items-center overflow-y-auto p-6">
            <div className="text-center">
              <p className="text-[13px] text-fg-subtle">
                An empty board. Start from a layout, or just drop a sticky.
              </p>
              <div className="mt-5 flex justify-center">
                <TemplateGallery onPick={stamp} />
              </div>
              <p className="mt-5 font-mono text-[11px] text-fg-subtle">
                N sticky · F frame · C connect · drag to pan · ⌘-scroll to zoom
              </p>
            </div>
          </div>
        )}
      </main>

      {menu.node}
      {promoting && (
        <PromoteDialog
          project={project}
          itemIds={selection}
          onClose={() => setPromoting(false)}
          onDone={() => setSelection([])}
        />
      )}
      {templating && (
        <Dialog
          title="Board templates"
          description="Each one lands as real items you can edit, move and delete."
          width={780}
          onClose={() => setTemplating(false)}
        >
          <TemplateGallery onPick={stamp} />
        </Dialog>
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

const toRect = (i: { x: number; y: number; width: number; height: number }): Rect => ({
  x: i.x,
  y: i.y,
  width: i.width,
  height: i.height,
});

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const cnBtn = (on: boolean) =>
  on
    ? "rounded-sm border border-accent bg-accent-soft p-1.5 text-accent"
    : "rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg";
