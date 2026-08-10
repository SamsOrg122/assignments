"use client";

/**
 * Point at a figure or a table.
 *
 * Opens on ⌘⇧R. Deliberately a list of what actually exists rather than a box
 * to type a number into: a number typed by hand is a number that stops being
 * true, and this is the feature that exists to stop that happening.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { figures, type Figure } from "@/lib/figures";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function RefPicker({
  projectId,
  x,
  y,
  onInsert,
  onClose,
}: {
  projectId: string;
  x: number;
  y: number;
  onInsert: (figure: Figure) => void;
  onClose: () => void;
}) {
  const blocks = useProjects(
    (s) => s.projects.find((p) => p.id === projectId)?.blocks,
  );
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => figures(blocks ?? []), [blocks]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        (f.caption ?? "").toLowerCase().includes(q),
    );
  }, [all, query]);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const width = 320;
  const left = Math.min(
    Math.max(8, x),
    (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16,
  );

  return (
    <div
      ref={ref}
      className="anim-pop fixed z-50 overflow-hidden rounded-md border border-line-strong bg-surface shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
      style={{ left, top: y, width }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((i) => (results.length ? (i + 1) % results.length : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) =>
            results.length ? (i - 1 + results.length) % results.length : 0,
          );
        } else if (e.key === "Enter") {
          e.preventDefault();
          const hit = results[active];
          if (hit) onInsert(hit);
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="link" size={11} className="text-fg-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Refer to a figure or table…"
          className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>

      {results.length === 0 ? (
        <p className="px-3 py-3 text-[12.5px] leading-relaxed text-fg-subtle">
          Nothing to point at yet. A picture, chart or table becomes a numbered
          figure as soon as it has something in it.
        </p>
      ) : (
        <ul className="max-h-[240px] overflow-y-auto py-1">
          {results.map((figure, i) => (
            <li key={figure.blockId}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onInsert(figure)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors duration-100",
                  i === active ? "bg-white/5" : "",
                )}
              >
                <span className="shrink-0 font-mono text-[11px] text-accent">
                  {figure.label}
                </span>
                <span className="min-w-0 truncate text-[12.5px] text-fg-muted">
                  {figure.caption || "no caption"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
