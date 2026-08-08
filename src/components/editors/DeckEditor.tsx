"use client";

/**
 * The Presenting editor.
 *
 * Opinionated by design: you pick a *layout*, not a font size. Every layout is
 * already set — type scale, measure, spacing — so the deck looks composed
 * without anyone choosing anything. "Beautiful deck fast", not a formatting
 * surface.
 */

import { useMemo, useRef, useState } from "react";
import type { PeerState, Project, SlidesBlock } from "@/lib/types";
import { SlideView } from "@/components/slides/SlideView";
import {
  DeckTools,
  SlideBar,
  SlideStage,
  SpeakerNote,
  useDeck,
} from "@/components/slides/DeckWorkbench";
import { importPptxFile } from "@/lib/pptx";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";


/**
 * The presenting editor: a deck, plus what only a whole project has.
 *
 * Split in two so the deck hook can be called unconditionally. Finding the
 * slides block can fail — a Deck project with no deck in it — and a hook after
 * that check would be a hook that sometimes doesn't run.
 */
export function DeckEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const addBlock = useProjects((s) => s.addBlock);
  const block = useMemo(
    () => project.blocks.find((b): b is SlidesBlock => b.type === "slides"),
    [project.blocks],
  );

  if (!block)
    return (
      <>
        <ProjectTopBar project={project} peers={peers} />
        <main className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <p className="text-[13.5px] text-fg-muted">
              This deck has no slides block yet.
            </p>
            <button
              type="button"
              onClick={() => addBlock(project.id, "slides")}
              className="mt-3 text-[13px] text-accent transition-opacity hover:opacity-80"
            >
              Add one
            </button>
          </div>
        </main>
      </>
    );

  return <DeckStage project={project} peers={peers} block={block} />;
}

function DeckStage({
  project,
  peers,
  block,
}: {
  project: Project;
  peers: PeerState[];
  block: SlidesBlock;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const notify = useUI((s) => s.notify);
  const deck = useDeck(project.id, block);
  const { slides, style, index: clamped, current, setIndex, addSlide, removeSlide } = deck;

  const [presenting, setPresenting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  /** Append an imported deck rather than replacing what's here. */
  const importDeck = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const imported = await importPptxFile(file);
      updateBlock<SlidesBlock>(project.id, block.id, (b) => ({
        slides: [...b.slides, ...imported.slides],
      }));
      setIndex(slides.length);
      notify(
        `Imported ${imported.slideCount} slide${imported.slideCount === 1 ? "" : "s"}` +
          (imported.skipped.length ? ` — ${imported.skipped.join(", ")} not carried over` : ""),
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not read that file",
      );
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <>
      {!presenting && (
        <ProjectTopBar
          project={project}
          peers={peers}
          tools={
            // Icons-only below sm: five labelled buttons don't fit a phone,
            // and a scroll container here would clip the panels that anchor
            // to these buttons.
            <span className="flex shrink-0 items-center gap-1">
              <DeckTools deck={deck} />

              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="download" size={11} />
                <span className="hidden sm:inline">
                  {importing ? "Reading…" : "Import .pptx"}
                </span>
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".pptx"
                className="sr-only"
                aria-label="Import a PowerPoint file"
                onChange={(e) => void importDeck(e.target.files?.[0])}
              />

              <button
                type="button"
                onClick={() => setPresenting(true)}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="play" size={11} />
                <span className="hidden sm:inline">Present</span>
              </button>
            </span>
          }
        />
      )}

      <main
        className={cn(
          "flex flex-1 overflow-hidden",
          presenting ? "bg-black" : "flex-col lg:flex-row",
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight")
            setIndex((i) => Math.min(i + 1, slides.length - 1));
          if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
          if (e.key === "Escape") setPresenting(false);
        }}
        tabIndex={-1}
      >
        {presenting ? (
          <button
            type="button"
            onClick={() =>
              setIndex((i) => (i + 1 < slides.length ? i + 1 : (setPresenting(false), i)))
            }
            className="grid size-full place-items-center"
            aria-label="Next slide"
          >
            <div className="aspect-[16/9] w-full max-w-[1100px]">
              {/* Keyed on the slide so React remounts it and the entry
                  animation actually replays on every advance. */}
              <div
                key={current?.id ?? clamped}
                className={
                  style.transition === "rise"
                    ? "anim-slide-up size-full"
                    : style.transition === "none"
                      ? "size-full"
                      : "anim-fade size-full"
                }
              >
                <SlideView slide={current} index={clamped} style={style} readOnly />
              </div>
            </div>
          </button>
        ) : (
          <>
            {/* Filmstrip */}
            <aside className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-line p-3 lg:w-[188px] lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0">
              {slides.map((s, i) => (
                <div key={s.id} className="group/thumb relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === clamped}
                    className={cn(
                      "aspect-[16/9] w-[148px] overflow-hidden rounded-sm border text-left transition-colors duration-150 lg:w-full",
                      i === clamped
                        ? "border-accent"
                        : "border-line hover:border-line-strong",
                    )}
                  >
                    <div className="pointer-events-none size-full origin-top-left scale-[0.22]" style={{ width: "455%", height: "455%" }}>
                      <SlideView slide={s} index={i} style={style} readOnly />
                    </div>
                  </button>
                  <span className="absolute top-1 left-1 rounded-xs bg-black/60 px-1 font-mono text-[9px] text-fg-subtle">
                    {i + 1}
                  </span>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlide(s.id)}
                      aria-label={`Delete slide ${i + 1}`}
                      className="absolute top-1 right-1 rounded-xs bg-black/60 p-0.5 text-fg-subtle opacity-0 transition-opacity group-hover/thumb:opacity-100 hover:text-danger"
                    >
                      <Icon name="x" size={9} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addSlide}
                className="flex aspect-[16/9] w-[148px] shrink-0 items-center justify-center gap-1.5 rounded-sm border border-dashed border-line text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg lg:w-full"
              >
                <Icon name="plus" size={11} />
                Slide
              </button>
            </aside>

            {/* Stage */}
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto p-5 sm:p-8">
              <div className="w-full max-w-[860px]">
                <SlideStage deck={deck} />
              </div>

              <div className="mt-3 w-full max-w-[860px] space-y-2">
                <SlideBar deck={deck} />
                <SpeakerNote deck={deck} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
