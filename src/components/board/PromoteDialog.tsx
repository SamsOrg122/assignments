"use client";

/**
 * Promote — board thinking becomes a real Library project.
 *
 * The mapping is opinionated because it's the useful part: a single text item
 * becomes a document that opens with that prose; a cluster of stickies becomes
 * an *outline* (each sticky a heading), which is what a wall of stickies
 * actually is. The promoted items are replaced by one live card, so the board
 * keeps its shape and the connection stays open in both directions.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Block, BoardItem, Project, ProjectKind } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { KINDS } from "@/lib/kinds";
import { uid, escapeHtml } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const CHOICES: ProjectKind[] = ["doc", "notes", "deck", "board"];

/** Sensible default for what a cluster *is*, from its shape. */
function suggestKind(items: BoardItem[]): ProjectKind {
  const stickies = items.filter((i) => i.kind === "sticky").length;
  const texts = items.filter((i) => i.kind === "text").length;
  if (stickies >= 3 && stickies >= texts) return "deck";
  if (stickies > texts) return "notes";
  return "doc";
}

function suggestName(items: BoardItem[]): string {
  const first = items.find((i) => "text" in i && i.text.trim());
  if (!first || !("text" in first)) return "Untitled";
  const line = first.text.split("\n")[0].trim();
  return line.length > 48 ? line.slice(0, 47) + "…" : line || "Untitled";
}

/** Turn the selected items into blocks for the chosen project kind. */
function toBlocks(items: BoardItem[], kind: ProjectKind, name: string): Block[] {
  // Reading order: top-to-bottom, then left-to-right — how the board looks.
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const texts = ordered
    .filter((i): i is Extract<BoardItem, { text: string }> => "text" in i)
    .map((i) => i.text.trim())
    .filter(Boolean);

  if (kind === "deck")
    return [
      {
        id: uid(),
        type: "slides",
        title: "Deck",
        slides: [
          { id: uid(), title: name, bullets: [texts[0] ?? ""] },
          ...texts.slice(1).map((t) => {
            const [head, ...rest] = t.split(/\n+/);
            return {
              id: uid(),
              title: head.slice(0, 60),
              bullets: rest.length ? rest : [t],
            };
          }),
        ],
      },
    ];

  if (kind === "board") return [];

  // Notes become an outline — each sticky is a heading with room under it.
  const html =
    kind === "notes"
      ? `<h2>${escapeHtml(name)}</h2>` +
        texts
          .map((t) => `<h3>${escapeHtml(t.split("\n")[0])}</h3><p></p>`)
          .join("")
      : `<h1>${escapeHtml(name)}</h1>` +
        texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("");

  return [{ id: uid(), type: "text", html }];
}

export function PromoteDialog({
  project,
  itemIds,
  onClose,
  onDone,
}: {
  project: Project;
  itemIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const promoteBoardItems = useProjects((s) => s.promoteBoardItems);
  const notify = useUI((s) => s.notify);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => project.board.filter((i) => itemIds.includes(i.id)),
    [project.board, itemIds],
  );

  const [kind, setKind] = useState<ProjectKind>(() => suggestKind(items));
  const [name, setName] = useState(() => suggestName(items));

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = () => {
    const title = name.trim() || "Untitled";
    const id = promoteBoardItems(
      project.id,
      itemIds,
      kind,
      title,
      toBlocks(items, kind, title),
    );
    if (!id) return;
    notify(`Promoted to “${title}”`);
    onDone();
    onClose();
    router.push(`/p/${id}`);
  };

  const cardCount = items.filter((i) => i.kind === "card").length;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Promote to a project"
    >
      <div className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="anim-pop relative w-full max-w-[420px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Icon name="promote" size={13} className="text-accent" />
          <span className="text-meta text-fg-subtle">Promote to a project</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="px-3 py-3">
          <label className="text-meta text-fg-subtle mb-1.5 block">Name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3.5 w-full rounded-sm border border-line bg-surface-2 px-2.5 py-2 text-[13px] text-fg outline-none focus:border-accent"
          />

          <label className="text-meta text-fg-subtle mb-1.5 block">As a</label>
          <div className="grid grid-cols-2 gap-1">
            {CHOICES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors duration-150",
                  kind === k
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-line-strong",
                )}
              >
                <Icon name={KINDS[k].icon} size={12} className="text-fg-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-fg">
                    {KINDS[k].label}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-3 font-mono text-[10px] leading-relaxed text-fg-subtle">
            {items.length} item{items.length === 1 ? "" : "s"}
            {cardCount ? ` (${cardCount} card${cardCount === 1 ? "" : "s"} ignored)` : ""} →{" "}
            {kind === "deck"
              ? "one slide per note"
              : kind === "notes"
                ? "an outline, one heading per note"
                : kind === "board"
                  ? "a fresh board"
                  : "a document"}
            . They&apos;re replaced on this board by a live card.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <button
            type="button"
            onClick={submit}
            className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            Promote
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
          <kbd className="kbd ml-auto">↵ to promote</kbd>
        </div>
      </div>
    </div>
  );
}
