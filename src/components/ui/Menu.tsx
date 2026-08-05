"use client";

/**
 * Context menus.
 *
 * The thing that makes a canvas tool feel like a tool: right-click anything
 * and the actions for *that thing* are under the pointer, rather than hidden
 * in a top bar that has to hold every action for everything.
 *
 * One implementation, used by the Library, the sidebar, the board, the block
 * canvas and the message list — so the same gesture behaves identically
 * everywhere, and a new surface gets keyboard support, edge-flipping and
 * submenus for free.
 *
 *   const menu = useMenu();
 *   <li onContextMenu={(e) => menu.open(e, items)}>…</li>
 *   {menu.node}
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/cn";

export type MenuItem =
  | {
      kind: "item";
      label: string;
      icon?: IconName;
      /** Rendered right-aligned, e.g. "⌘D". Display only. */
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Shows a tick. For toggles and current-value markers. */
      checked?: boolean;
      onSelect: () => void;
    }
  | { kind: "submenu"; label: string; icon?: IconName; items: MenuItem[] }
  | { kind: "separator" }
  | { kind: "heading"; label: string };

const MENU_WIDTH = 216;
const ITEM_HEIGHT = 30;

interface Anchor {
  x: number;
  y: number;
  items: MenuItem[];
}

export function useMenu() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    if (!items.length) return;
    e.preventDefault();
    e.stopPropagation();
    setAnchor({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  const node = anchor ? (
    <MenuSurface x={anchor.x} y={anchor.y} items={anchor.items} onClose={close} />
  ) : null;

  return { open, close, node, isOpen: anchor !== null };
}

/* ── Surface ────────────────────────────────────────────── */

function MenuSurface({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [submenu, setSubmenu] = useState<number | null>(null);

  // Indices that can actually be focused — headings and separators can't.
  const selectable = items
    .map((item, i) => (item.kind === "item" || item.kind === "submenu" ? i : -1))
    .filter((i) => i >= 0);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // A menu pinned to a point in the document is wrong the moment the
    // document moves, so scrolling dismisses rather than trailing behind.
    const onScroll = () => onClose();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const move = (delta: number) => {
    const at = selectable.indexOf(active);
    const next =
      at === -1
        ? selectable[delta > 0 ? 0 : selectable.length - 1]
        : selectable[(at + delta + selectable.length) % selectable.length];
    setActive(next);
    setSubmenu(null);
  };

  const choose = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.kind === "submenu") {
      setSubmenu(index);
      return;
    }
    if (item.kind !== "item" || item.disabled) return;
    item.onSelect();
    onClose();
  };

  // Flip rather than overflow. The menu is measured from its own item count
  // so it never has to render off-screen first to find out it doesn't fit.
  const height = items.reduce(
    (h, item) => h + (item.kind === "separator" ? 9 : ITEM_HEIGHT),
    12,
  );
  const left =
    typeof window !== "undefined" && x + MENU_WIDTH > window.innerWidth - 8
      ? Math.max(8, x - MENU_WIDTH)
      : x;
  const top =
    typeof window !== "undefined" && y + height > window.innerHeight - 8
      ? Math.max(8, window.innerHeight - height - 8)
      : y;

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-orientation="vertical"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "ArrowRight") {
          if (items[active]?.kind === "submenu") {
            e.preventDefault();
            setSubmenu(active);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSubmenu(null);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose(active);
        }
      }}
      style={{ left, top, width: MENU_WIDTH }}
      className="anim-pop fixed z-[70] rounded-md border border-line-strong bg-surface p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)] outline-none"
    >
      {items.map((item, i) => {
        if (item.kind === "separator")
          return <span key={i} className="my-1 block h-px bg-line" />;

        if (item.kind === "heading")
          return (
            <span
              key={i}
              className="block px-2 pt-1.5 pb-1 text-[10.5px] text-fg-subtle"
            >
              {item.label}
            </span>
          );

        const isSub = item.kind === "submenu";
        return (
          <div key={i} className="relative">
            <button
              type="button"
              role="menuitem"
              disabled={item.kind === "item" && item.disabled}
              aria-haspopup={isSub || undefined}
              aria-expanded={isSub ? submenu === i : undefined}
              onMouseEnter={() => {
                setActive(i);
                setSubmenu(isSub ? i : null);
              }}
              onClick={() => choose(i)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[12.5px] transition-colors duration-100",
                active === i ? "bg-surface-3" : "",
                item.kind === "item" && item.danger
                  ? "text-danger"
                  : "text-fg-muted",
                item.kind === "item" && item.disabled
                  ? "cursor-not-allowed opacity-40"
                  : "hover:text-fg",
              )}
            >
              {item.icon ? (
                <Icon name={item.icon} size={12} className="shrink-0" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.kind === "item" && item.checked && (
                <Icon name="check" size={11} className="shrink-0 text-accent" />
              )}
              {item.kind === "item" && item.shortcut && (
                <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                  {item.shortcut}
                </span>
              )}
              {isSub && (
                <Icon
                  name="chevron-right"
                  size={11}
                  className="shrink-0 text-fg-subtle"
                />
              )}
            </button>

            {isSub && submenu === i && (
              <Submenu items={item.items} onPick={onClose} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A submenu, opened to the right of its parent row.
 *
 * Deliberately simple — one level deep. Nested menus past that are a place
 * things go to be lost.
 */
function Submenu({
  items,
  onPick,
}: {
  items: MenuItem[];
  onPick: () => void;
}) {
  return (
    <div
      role="menu"
      className="anim-pop absolute top-[-6px] left-full z-10 ml-0.5 max-h-[60vh] overflow-y-auto rounded-md border border-line-strong bg-surface p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]"
      style={{ width: MENU_WIDTH - 16 }}
    >
      {items.map((item, i) => {
        if (item.kind === "separator")
          return <span key={i} className="my-1 block h-px bg-line" />;
        if (item.kind !== "item") return null;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onPick();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[12.5px] transition-colors duration-100 hover:bg-surface-3",
              item.danger ? "text-danger" : "text-fg-muted hover:text-fg",
              item.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {item.icon ? (
              <Icon name={item.icon} size={12} className="shrink-0" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && (
              <Icon name="check" size={11} className="shrink-0 text-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────── */

export const separator: MenuItem = { kind: "separator" };

export const heading = (label: string): MenuItem => ({ kind: "heading", label });

export const item = (
  label: string,
  onSelect: () => void,
  extra: Partial<Extract<MenuItem, { kind: "item" }>> = {},
): MenuItem => ({ kind: "item", label, onSelect, ...extra });
