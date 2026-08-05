"use client";

/**
 * Insert a citation at the caret.
 *
 * Opens on ⌘⇧C inside a text block. Search filters the project's sources with
 * the same fuzzy matcher as ⌘K; pasting a link, DOI or reference straight into
 * the box resolves it, adds it to the project, and cites it in one step — which
 * is the move that actually saves a student time.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { fuzzyMatch } from "@/lib/fuzzy";
import { describeInput, formatInline, resolveSource } from "@/lib/sources";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import type { CitationStyle, Source } from "@/lib/types";

export function CitePicker({
  projectId,
  x,
  y,
  onInsert,
  onClose,
}: {
  projectId: string;
  x: number;
  y: number;
  onInsert: (source: Source, label: string) => void;
  onClose: () => void;
}) {
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const addSource = useProjects((s) => s.addSource);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [resolving, setResolving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const style: CitationStyle = project?.citationStyle ?? "apa";
  const sources = useMemo(() => project?.sources ?? [], [project?.sources]);

  const results = useMemo(() => {
    if (!query.trim()) return sources;
    return sources
      .map((s) => {
        const hit =
          fuzzyMatch(query, s.title) ??
          fuzzyMatch(
            query,
            `${s.title} ${s.authors.map((a) => a.family).join(" ")} ${s.year ?? ""} ${s.container ?? ""}`,
          );
        return hit ? { source: s, score: hit.score } : null;
      })
      .filter((r): r is { source: Source; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.source);
  }, [sources, query]);

  // A pasted identifier is an "add and cite", not a search.
  const looksPasted =
    query.trim().length > 12 &&
    (/^https?:\/\//i.test(query.trim()) ||
      /\b10\.\d{4,9}\//.test(query) ||
      /^@\w+\s*\{/.test(query.trim()) ||
      /\(\d{4}\)/.test(query));

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

  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActive(0);
  }

  const cite = (source: Source) => onInsert(source, formatInline(source, style));

  const addAndCite = async () => {
    setResolving(true);
    try {
      const source = await resolveSource(query);
      addSource(projectId, source);
      cite(source);
    } catch {
      setResolving(false);
    }
  };

  const commit = () => {
    if (looksPasted && results.length === 0) return void addAndCite();
    const hit = results[active];
    if (hit) cite(hit);
    else if (query.trim()) void addAndCite();
  };

  const width = 340;
  const left = Math.min(
    x,
    (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16,
  );

  return (
    <div
      ref={ref}
      className="anim-pop fixed z-50 overflow-hidden rounded-md border border-line-strong bg-surface shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
      style={{ left, top: y, width }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((i) => (results.length ? (i + 1) % results.length : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) =>
            results.length ? (i - 1 + results.length) % results.length : 0,
          );
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-2.5">
        <Icon name="quote" size={12} className="shrink-0 text-fg-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sources, or paste a link / DOI…"
          aria-label="Cite a source"
          spellCheck={false}
          className="w-full bg-transparent py-2.5 text-[12.5px] text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>

      <div className="max-h-[220px] overflow-y-auto py-1">
        {resolving ? (
          <p className="anim-shimmer px-3 py-4 text-center text-[12px] text-fg-subtle">
            Resolving {describeInput(query)}…
          </p>
        ) : results.length > 0 ? (
          results.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseMove={() => setActive(i)}
              onClick={() => cite(s)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors duration-100",
                i === active ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <span className="w-full truncate text-[12.5px] text-fg">
                {s.title || s.raw?.slice(0, 60) || "Untitled"}
              </span>
              <span className="w-full truncate font-mono text-[10px] text-fg-subtle">
                {formatInline(s, style)}
                {s.container ? ` · ${s.container}` : ""}
              </span>
            </button>
          ))
        ) : query.trim() ? (
          <button
            type="button"
            onClick={() => void addAndCite()}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-surface-2"
          >
            <Icon name="plus" size={12} className="shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] text-fg">
                Add this {describeInput(query)} and cite it
              </span>
              <span className="block truncate font-mono text-[10px] text-fg-subtle">
                {query.trim().slice(0, 52)}
              </span>
            </span>
          </button>
        ) : (
          <p className="px-3 py-4 text-center text-[12px] text-fg-subtle">
            No sources yet — paste a link, DOI or reference.
          </p>
        )}
      </div>

    </div>
  );
}
