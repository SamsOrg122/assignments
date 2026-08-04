"use client";

/**
 * Version history as a scrubbable timeline.
 *
 * Not a list of files and not a list of commits — a line showing the document
 * growing, which is the shape writing actually has. Dragging the scrubber
 * previews that moment in place; nothing is written until Restore, and the
 * restore itself records where you were, so scrubbing forward undoes it.
 */

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { htmlToText } from "@/lib/ai/context";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import type { Project, Snapshot } from "@/lib/types";

export function VersionTimeline({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const restoreSnapshot = useProjects((s) => s.restoreSnapshot);
  const notify = useUI((s) => s.notify);

  const history = useMemo(() => project.history ?? [], [project.history]);
  const [index, setIndex] = useState(Math.max(0, history.length - 1));

  const clamped = Math.min(index, Math.max(history.length - 1, 0));
  const entry: Snapshot | undefined = history[clamped];
  const isLatest = clamped === history.length - 1;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(history.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, history.length]);

  const maxWords = Math.max(1, ...history.map((h) => h.words));

  /** Text of the snapshot being previewed, for the diff-ish read-out. */
  const preview = useMemo(() => {
    if (!entry) return [];
    return entry.blocks
      .filter((b) => b.type === "text")
      .map((b) => htmlToText(b.html))
      .filter(Boolean);
  }, [entry]);

  const delta = entry && clamped > 0 ? entry.words - history[clamped - 1].words : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-5 print:hidden">
      <div
        className="anim-slide-up w-full max-w-[720px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)]"
        role="dialog"
        aria-label="Version timeline"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
          <Icon name="history" size={13} className="text-fg-subtle" />
          <span className="label-mono !text-fg-muted">Timeline</span>
          <span className="ml-auto font-mono text-[10px] text-fg-subtle">
            {history.length} version{history.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close timeline"
            className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {history.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12.5px] leading-relaxed text-fg-subtle">
            No history yet.
            <br />
            <span className="font-mono text-[10.5px]">
              Versions are captured as you write.
            </span>
          </p>
        ) : (
          <>
            {/* The growth curve — one bar per snapshot, height by word count. */}
            <div className="px-3 pt-3">
              <div className="flex h-[52px] items-end gap-[2px]">
                {history.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    title={`${h.words} words · ${timeOf(h.at)}`}
                    aria-label={`Version ${i + 1}, ${h.words} words`}
                    className="group/bar flex-1 rounded-t-[2px] transition-colors duration-100"
                    style={{
                      height: `${Math.max(4, (h.words / maxWords) * 100)}%`,
                      background:
                        i === clamped
                          ? "var(--color-accent)"
                          : "rgba(255,255,255,0.11)",
                    }}
                  />
                ))}
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, history.length - 1)}
                value={clamped}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-label="Scrub through versions"
                className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
              />
            </div>

            <div className="flex items-baseline gap-2 px-3 pt-2">
              <span className="text-[12.5px] text-fg">{entry?.label}</span>
              <span className="font-mono text-[10px] text-fg-subtle">
                {entry ? timeOf(entry.at) : ""} · {entry?.words.toLocaleString()} words
                {delta !== 0 && (
                  <span className={delta > 0 ? "text-accent" : "text-warn"}>
                    {" "}
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
              </span>
              {isLatest && (
                <span className="ml-auto font-mono text-[9.5px] text-fg-subtle">
                  current
                </span>
              )}
            </div>

            {/* A read-only look at that moment. */}
            <div className="mx-3 my-2.5 max-h-[132px] overflow-y-auto rounded-sm border border-line bg-canvas px-3 py-2.5">
              {preview.length === 0 ? (
                <p className="text-[12px] text-fg-subtle">Empty at this point.</p>
              ) : (
                preview.slice(0, 4).map((text, i) => (
                  <p
                    key={i}
                    className="mb-1.5 line-clamp-2 text-[12px] leading-relaxed text-fg-muted last:mb-0"
                  >
                    {text.slice(0, 200)}
                  </p>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
              <button
                type="button"
                disabled={isLatest || !entry}
                onClick={() => {
                  if (!entry) return;
                  restoreSnapshot(project.id, entry.id);
                  notify(`Restored ${timeOf(entry.at)}`);
                  onClose();
                }}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-[12.5px] font-medium transition-[filter] duration-150",
                  isLatest || !entry
                    ? "border border-line text-fg-subtle"
                    : "bg-accent text-white hover:brightness-110",
                )}
              >
                {isLatest ? "This is current" : "Restore this version"}
              </button>
              <kbd className="kbd">← →</kbd>
              <span className="ml-auto hidden font-mono text-[10px] text-fg-subtle sm:block">
                restoring keeps the current draft in history
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function timeOf(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
