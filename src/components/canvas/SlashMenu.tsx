"use client";

/**
 * The `/` menu.
 *
 * Same ranking engine as ⌘K, positioned at the caret. It listens on the window
 * rather than owning focus, so the caret stays in the editor and the user can
 * keep typing to filter.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyMatch } from "@/lib/fuzzy";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { BLOCK_META } from "@/components/shell/CommandPalette";
import type { BlockType } from "@/lib/types";

const ORDER: BlockType[] = [
  "text",
  "table",
  "chart",
  "slides",
  "code",
  "bibliography",
];

export function SlashMenu({
  query,
  x,
  y,
  onSelect,
  onClose,
}: {
  query: string;
  x: number;
  y: number;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const scored = ORDER.map((type) => {
      const meta = BLOCK_META[type];
      const hit =
        fuzzyMatch(query, meta.label) ??
        fuzzyMatch(query, `${meta.label} ${meta.keywords} ${meta.hint}`);
      return hit ? { type, meta, score: hit.score } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    return scored.sort((a, b) => b.score - a.score);
  }, [query]);

  // Adjusting state during render (React's documented alternative to a
  // reset-in-effect) — the highlight snaps back to the top as the query
  // changes, without a second render pass.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActive(0);
  }

  // No matches means the user is typing prose, not picking a block.
  useEffect(() => {
    if (items.length === 0) onClose();
  }, [items.length, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % Math.max(items.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % Math.max(items.length, 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const hit = items[active];
        if (hit) onSelect(hit.type);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // Capture, so the editor's own keymap doesn't swallow Enter first.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [items, active, onSelect, onClose]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  if (items.length === 0) return null;

  const width = 268;
  const left = Math.min(
    x,
    (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16,
  );
  const flip =
    typeof window !== "undefined" && y + 260 > window.innerHeight && y > 300;

  return (
    <div
      ref={ref}
      className="anim-pop fixed z-50 overflow-hidden rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
      style={{
        left,
        top: flip ? undefined : y,
        bottom: flip ? window.innerHeight - y + 26 : undefined,
        width,
      }}
      role="listbox"
      aria-label="Insert block"
    >
      {items.map((item, i) => (
        <button
          key={item.type}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseMove={() => setActive(i)}
          onClick={() => onSelect(item.type)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-100",
            i === active ? "bg-surface-2" : "hover:bg-surface-2/60",
          )}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line text-fg-muted">
            <Icon name={item.meta.icon} size={12} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-fg">{item.meta.label}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {item.meta.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
