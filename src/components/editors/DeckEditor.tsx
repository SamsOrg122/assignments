"use client";

/**
 * The Presenting editor.
 *
 * Opinionated by design: you pick a *layout*, not a font size. Every layout is
 * already set — type scale, measure, spacing — so the deck looks composed
 * without anyone choosing anything. "Beautiful deck fast", not a formatting
 * surface.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PeerState, Project, SlidesBlock } from "@/lib/types";
import { SlideView } from "@/components/slides/SlideView";
import {
  DeckTools,
  SlideBar,
  SlideStage,
  SpeakerNote,
  useDeck,
} from "@/components/slides/DeckWorkbench";
import { insertSlidePiece } from "@/lib/kit/insert";
import { advance } from "@/lib/deck/build";
import { usePresenterChannel } from "@/lib/deck/use-presenter";
import { buildPptx } from "@/lib/deck/pptx-write";
import { importPptxFile } from "@/lib/pptx";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { cn } from "@/lib/cn";
import { lookStyle } from "@/lib/looks";
import { Icon } from "@/components/ui/Icon";
import { MasterPanel } from "@/components/slides/MasterPanel";
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

  /**
   * Where the build has got to on the current slide.
   *
   * Held against the slide's id rather than reset by an effect, so moving to
   * another slide *derives* a step of zero instead of rendering the old one
   * for a frame first. Clicking a thumbnail shows that slide whole, which is
   * what anyone expects.
   */
  const [built, setBuilt] = useState<{ id: string; step: number }>({
    id: "",
    step: 0,
  });
  const step = built.id === current?.id ? built.step : 0;

  // This window is the authority on where the deck is; the presenter window
  // asks it to move. See `lib/deck/channel.ts` for why only one side decides.
  const presenter = usePresenterChannel({
    key: block.id,
    slides,
    index: clamped,
    step,
    presenting,
    onMove: (to) => {
      if (typeof to === "number") {
        setIndex(to);
        setBuilt({ id: slides[to]?.id ?? "", step: 0 });
        return;
      }
      go(to);
    },
  });

  /** One press. The build moves before the slide does — see `lib/deck/build`. */
  const go = (direction: 1 | -1) => {
    const next = advance(slides, clamped, step, direction);
    setIndex(next.index);
    setBuilt({ id: slides[next.index]?.id ?? "", step: next.step });
    return next;
  };

  // Held in a ref so the window listener below stays mounted across every
  // move; written in an effect, because a ref is not a render value.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  /**
   * While presenting, the keys belong to the window rather than to an element.
   *
   * A handler on the stage only fires once something inside it has focus, and
   * the one thing a presenter will not do is click the slide before pressing
   * the arrow key — least of all with a room watching. A remote clicker sends
   * exactly these keys and has no way to focus anything at all.
   */
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        goRef.current(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goRef.current(-1);
      } else if (event.key === "Escape") {
        setPresenting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);

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
              <DeckTools
                deck={deck}
                onInsertSlide={(piece) =>
                  insertSlidePiece(project.id, block.id, piece, deck.index)
                }
              />

              <MasterPanel
                projectId={project.id}
                block={block}
                index={clamped}
              />

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
                onClick={() => {
                  const name = `${project.name || "Deck"}.pptx`;
                  const bytes = buildPptx(block, project.name || "Deck");
                  const url = URL.createObjectURL(
                    new Blob([bytes as BlobPart], {
                      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = name;
                  a.style.display = "none";
                  document.body.appendChild(a);
                  a.click();
                  requestAnimationFrame(() => {
                    a.remove();
                    URL.revokeObjectURL(url);
                  });
                  notify(`Saved ${name}`);
                }}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="download" size={11} />
                <span className="hidden sm:inline">Export .pptx</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!presenter.open())
                    notify("Your browser blocked the second window — allow pop-ups for this site.");
                  else setPresenting(true);
                }}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="users" size={11} />
                <span className="hidden sm:inline">Presenter view</span>
              </button>

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
          !presenting && lookStyle(project.look) && "look-page",
        )}
        style={presenting ? undefined : lookStyle(project.look)}
        onKeyDown={(e) => {
          // Presenting listens on the window instead — see the effect above.
          if (presenting) return;
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        tabIndex={-1}
      >
        {presenting ? (
          <button
            type="button"
            onClick={() => {
              const before = { index: clamped, step };
              const next = go(1);
              // Only leave the deck when the last press had nowhere left to
              // go: clicking through a build should never drop out of it.
              if (next.index === before.index && next.step === before.step)
                setPresenting(false);
            }}
            className="grid size-full place-items-center"
            aria-label="Next slide"
          >
            <div className="aspect-[16/9] w-full max-w-[1100px]">
              {/* Keyed on the slide so React remounts it and the entry
                  animation actually replays on every advance. */}
              <div
                key={`${current?.id ?? clamped}`}
                className={
                  style.transition === "rise"
                    ? "anim-slide-up size-full"
                    : style.transition === "none"
                      ? "size-full"
                      : "anim-fade size-full"
                }
              >
                <SlideView
                  slide={current}
                  index={clamped}
                  style={style}
                  master={block.master}
                  step={step}
                  readOnly
                />
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
