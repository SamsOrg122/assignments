"use client";

/**
 * The deck's model, and how a slide reveals itself.
 *
 * Two settings that look small and are not. The master is the difference
 * between "put the logo on forty slides" and "put the logo on the deck", and
 * the build is the difference between a room reading ahead and a room
 * listening. Both are per-deck, both are two clicks, and neither opens a
 * separate editor — a master you have to go somewhere else to change is a
 * master nobody changes.
 *
 * "Take this slide's shapes as the master" is the honest way to build one
 * without a second canvas: arrange a slide until it looks right, then promote
 * what is on it. The shapes stay on that slide too, so nothing disappears —
 * the slide is simply told to stop inheriting, and it looks identical.
 */

import { useState } from "react";
import type { SlideBuild, SlidesBlock } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { buildSteps } from "@/lib/deck/build";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const BUILD_LABELS: Record<SlideBuild, string> = {
  none: "All at once",
  bullets: "A bullet at a time",
  objects: "Shape by shape",
  both: "Bullets, then shapes",
};

export function MasterPanel({
  projectId,
  block,
  index,
}: {
  projectId: string;
  block: SlidesBlock;
  index: number;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const notify = useUI((s) => s.notify);
  const [open, setOpen] = useState(false);

  const slide = block.slides[index];
  const master = block.master;

  const setMaster = (next: Partial<NonNullable<SlidesBlock["master"]>>) =>
    updateBlock<SlidesBlock>(projectId, block.id, (b) => ({
      master: { ...b.master, ...next },
    }));

  const setSlide = (next: Partial<(typeof block.slides)[number]>) =>
    updateBlock<SlidesBlock>(projectId, block.id, (b) => ({
      slides: b.slides.map((s, i) => (i === index ? { ...s, ...next } : s)),
    }));

  const steps = slide ? buildSteps(slide) : 0;

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        aria-label="Deck model and build"
        className={cn(
          "flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] transition-colors duration-150",
          open
            ? "border-line-strong text-fg"
            : "text-fg-subtle hover:border-line-strong hover:text-fg",
        )}
      >
        <Icon name="frame" size={11} />
        <span className="hidden sm:inline">Model</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute top-full right-0 z-50 mt-1.5 w-[280px] rounded-md border border-line bg-surface-2 p-3 shadow-lg">
            <p className="text-meta text-fg-subtle mb-2">The whole deck</p>

            <label className="mb-2 block">
              <span className="mb-1 block text-[11.5px] text-fg-subtle">
                Footer on every slide
              </span>
              <input
                value={master?.footer ?? ""}
                onChange={(e) => setMaster({ footer: e.target.value })}
                placeholder="Module code, your name, the date"
                className="w-full rounded-sm border border-line bg-surface px-2 py-1 text-[12.5px] text-fg outline-none focus:border-accent"
              />
            </label>

            <label className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-muted">
              <input
                type="checkbox"
                checked={Boolean(master?.numbers)}
                onChange={(e) => setMaster({ numbers: e.target.checked })}
              />
              Slide numbers
            </label>

            <button
              type="button"
              onClick={() => {
                if (!slide?.objects?.length) {
                  notify("This slide has no shapes to take.");
                  return;
                }
                setMaster({ objects: slide.objects });
                // The slide keeps its shapes and stops inheriting, so it looks
                // exactly as it did a second ago.
                setSlide({ bare: true });
                notify(
                  `${slide.objects.length} shape${slide.objects.length === 1 ? "" : "s"} are now on every slide`,
                );
              }}
              className="mb-1 w-full rounded-sm border border-line px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              Take this slide&apos;s shapes as the model
            </button>
            {master?.objects?.length ? (
              <button
                type="button"
                onClick={() => {
                  setMaster({ objects: [] });
                  notify("The model's shapes are gone; slides keep their own.");
                }}
                className="w-full rounded-sm border border-line px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
              >
                Clear the model&apos;s {master.objects.length} shape
                {master.objects.length === 1 ? "" : "s"}
              </button>
            ) : null}

            <div className="my-3 border-t border-line" />

            <p className="text-meta text-fg-subtle mb-2">This slide</p>

            <label className="mb-2 block">
              <span className="mb-1 block text-[11.5px] text-fg-subtle">
                Reveal
              </span>
              <select
                value={slide?.build ?? "none"}
                onChange={(e) => setSlide({ build: e.target.value as SlideBuild })}
                className="w-full rounded-sm border border-line bg-surface px-2 py-1 text-[12.5px] text-fg outline-none focus:border-accent"
              >
                {(Object.keys(BUILD_LABELS) as SlideBuild[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {BUILD_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            {steps > 0 && (
              <p className="mb-2 text-[11.5px] leading-relaxed text-fg-subtle">
                {steps} extra press{steps === 1 ? "" : "es"} before this slide
                moves on. Thumbnails and exports always show it whole.
              </p>
            )}

            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              <input
                type="checkbox"
                checked={Boolean(slide?.bare)}
                onChange={(e) => setSlide({ bare: e.target.checked })}
              />
              Ignore the model on this slide
            </label>
          </div>
        </>
      )}
    </span>
  );
}
