"use client";

/**
 * Find & replace, as a small floating panel.
 *
 * Contextual by the house rule: it exists only while summoned (⌘F), regex
 * sits behind one disclosure, and the whole thing is four controls. The
 * match count updates live so "did that pattern hit anything" is answered
 * before anything is changed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { countMatches, replaceAll } from "@/lib/find-replace";
import { useUI } from "@/lib/ui-store";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function FindReplace({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const setBlocks = useProjects((s) => s.setBlocks);
  const snapshot = useProjects((s) => s.snapshot);
  const notify = useUI((s) => s.notify);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [more, setMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(
    () => countMatches(project.blocks, query, { regex, caseSensitive }),
    [project.blocks, query, regex, caseSensitive],
  );

  const run = () => {
    if (!matches) return;
    // A bulk rewrite deserves its own point on the timeline first.
    snapshot(project.id, `Before replacing “${query}”`);
    const result = replaceAll(project.blocks, query, replacement, {
      regex,
      caseSensitive,
    });
    setBlocks(project.id, result.blocks);
    notify(
      `Replaced ${result.replaced} occurrence${result.replaced === 1 ? "" : "s"}`,
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Find and replace"
      className="anim-pop fixed top-16 right-4 z-50 w-[300px] rounded-md border border-line-strong bg-surface p-2.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] print:hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={query}
          placeholder="Find"
          aria-label="Find"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
        />
        <span
          className={cn(
            "shrink-0 font-mono text-[10.5px] tabular-nums",
            query && !matches ? "text-fg-subtle" : "text-fg-muted",
          )}
        >
          {query ? matches : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close find and replace"
          className="shrink-0 rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={10} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={replacement}
          placeholder="Replace with"
          aria-label="Replace with"
          spellCheck={false}
          onChange={(e) => setReplacement(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={run}
          disabled={!matches}
          className={cn(
            "shrink-0 rounded-sm px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            matches
              ? "bg-accent text-on-accent hover:brightness-110"
              : "border border-line text-fg-subtle",
          )}
        >
          Replace all
        </button>
      </div>

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="mt-1.5 flex items-center gap-1 text-[10.5px] text-fg-subtle transition-colors hover:text-fg"
      >
        <Icon
          name="chevron-right"
          size={9}
          className={cn("transition-transform", more && "rotate-90")}
        />
        Options
      </button>

      {more && (
        <div className="anim-slide-up mt-1.5 flex items-center gap-4 border-t border-line pt-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={regex}
              onChange={(e) => setRegex(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Regular expression
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Match case
          </label>
        </div>
      )}

      <p className="mt-1.5 text-[10px] leading-relaxed text-fg-subtle">
        Prose only; tables and slides are untouched. A snapshot lands on the
        timeline before anything changes.
      </p>
    </div>
  );
}
