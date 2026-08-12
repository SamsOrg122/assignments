"use client";

/**
 * A deck, wherever it lives.
 *
 * A slides block inside a document used to be a different, much poorer
 * program than a deck in its own project: no theme, no layouts, no free-form
 * layer, no pictures. Nothing about a document makes those wrong — the only
 * reason they were missing is that the in-document block was written twice.
 *
 * So the deck is one thing now: one hook that owns the operations, one stage
 * that draws and edits a slide, one row of tools. The presenting editor adds a
 * filmstrip, a `.pptx` import and a Present button around it; the block adds
 * nothing. Both are the same deck.
 */

import { useMemo, useRef, useState } from "react";
import type {
  DeckStyle,
  Slide,
  SlidesBlock as SlidesBlockModel,
} from "@/lib/types";
import { DEFAULT_DECK_STYLE } from "@/lib/types";
import { DECK_THEMES, deckVars } from "@/lib/deck-themes";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { uid } from "@/lib/factories";
import { imageFrom, pickImage, prepareImage } from "@/lib/images";
import {
  SlideObjectsEditor,
  balanceObjects,
  insertImageObject,
  insertObject,
} from "@/components/editors/SlideObjects";
import { DeckStylePanel } from "@/components/editors/DeckStylePanel";
import { LayoutPicker, SlideView, layoutOf } from "./SlideView";
import { addPiece, useKit, type KitImage, type KitPiece } from "@/lib/kit";
import { imageObject, kitImage } from "@/lib/kit/insert";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

/* ── The operations, once ───────────────────────────────── */

export interface Deck {
  slides: Slide[];
  style: DeckStyle;
  index: number;
  current: Slide | undefined;
  setIndex: (next: number | ((i: number) => number)) => void;
  patch: (slideId: string, next: Partial<Slide>) => void;
  setStyle: (next: Partial<DeckStyle>) => void;
  setSlides: (next: (slides: Slide[]) => Slide[]) => void;
  addSlide: () => void;
  removeSlide: (id: string) => void;
  /** Pick, drop or paste a picture onto the current slide. */
  placeImage: (file: File | Blob | null) => Promise<void>;
  /** The deck's model, drawn behind every slide that hasn't opted out. */
  master: SlidesBlockModel["master"];
  /** Slide count, so the model can number them. */
  total: number;
}

export function useDeck(projectId: string, block: SlidesBlockModel): Deck {
  const updateBlock = useProjects((s) => s.updateBlock);
  const notify = useUI((s) => s.notify);
  const [index, setIndex] = useState(0);

  const slides = block.slides;
  // Clamped rather than corrected in an effect: deleting the last slide should
  // not cost an extra render pass to notice.
  const clamped = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[clamped];
  const style = block.style ?? DEFAULT_DECK_STYLE;

  const master = block.master;

  return useMemo(() => {
    const setSlides = (next: (list: Slide[]) => Slide[]) =>
      updateBlock<SlidesBlockModel>(projectId, block.id, (b) => ({
        slides: next(b.slides),
      }));

    const patch = (slideId: string, changes: Partial<Slide>) =>
      setSlides((list) =>
        list.map((s) => (s.id === slideId ? { ...s, ...changes } : s)),
      );

    return {
      slides,
      style,
      index: clamped,
      current,
      setIndex,
      patch,
      setSlides,
      master,
      total: slides.length,

      setStyle: (next) =>
        updateBlock<SlidesBlockModel>(projectId, block.id, (b) => ({
          style: { ...DEFAULT_DECK_STYLE, ...b.style, ...next },
        })),

      addSlide: () => {
        const fresh: Slide = { id: uid(), title: "New slide", bullets: [""] };
        setSlides((list) => [
          ...list.slice(0, clamped + 1),
          fresh,
          ...list.slice(clamped + 1),
        ]);
        setIndex(clamped + 1);
      },

      removeSlide: (id) =>
        setSlides((list) =>
          list.length > 1 ? list.filter((s) => s.id !== id) : list,
        ),

      placeImage: async (file) => {
        if (!current) return;
        try {
          const image = file ? await prepareImage(file) : await pickImage();
          if (!image) return;
          // Read fresh through `setSlides` rather than from the captured
          // slide: this lands after an await, by which time the slide may
          // have gained objects a captured array wouldn't know about.
          setSlides((list) =>
            list.map((s) =>
              s.id === current.id
                ? { ...s, objects: insertImageObject(s.objects ?? [], image) }
                : s,
            ),
          );
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : "That picture couldn't be read.",
          );
        }
      },
    };
  }, [projectId, block.id, slides, style, clamped, current, master, updateBlock, notify]);
}

/* ── The stage ──────────────────────────────────────────── */

/**
 * One slide, editable: the themed layout underneath, the free-form layer over
 * it, and a picture landing wherever it is dropped.
 *
 * The objects layer is transparent to the pointer so the title and bullets
 * underneath stay clickable — see `SlideObjects` for why that is not optional.
 */
export function SlideStage({ deck, className }: { deck: Deck; className?: string }) {
  const [dropping, setDropping] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const { current, style, index, patch, placeImage, master, total } = deck;

  return (
    <div
      ref={stageRef}
      data-stage="true"
      className={cn(
        "relative aspect-[16/9] w-full overflow-hidden rounded-lg border transition-colors duration-150",
        dropping ? "border-accent" : "border-line",
        className,
      )}
      style={{ containerType: "inline-size" }}
      // Drop a photo anywhere on the slide and it lands as an object. Paste is
      // handled inside the objects layer, which has to weigh a picture against
      // copied shapes anyway.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        const file = imageFrom(e.dataTransfer);
        setDropping(false);
        if (!file) return;
        e.preventDefault();
        void placeImage(file);
      }}
    >
      <SlideView
        slide={current}
        index={index}
        style={style}
        master={master}
        total={total}
        hideObjects
        onChange={(next) => current && patch(current.id, next)}
      />
      {current && (
        <div
          style={deckVars(DECK_THEMES[style.theme], style.scale, style.accent, style.font)}
          className="pointer-events-none absolute inset-0"
        >
          <SlideObjectsEditor
            slide={current}
            stageRef={stageRef}
            onChange={(objects) => patch(current.id, { objects })}
          />
        </div>
      )}
    </div>
  );
}

/* ── The tools ──────────────────────────────────────────── */

const ELEMENTS = [
  ["text", "Text"],
  ["rect", "Rectangle"],
  ["ellipse", "Ellipse"],
  ["line", "Line"],
] as const;

/**
 * Add a slide, restyle the deck, drop in an element.
 *
 * `compact` drops the labels for the row that sits inside a document, where
 * the block is narrow and the words would wrap. It changes nothing about what
 * is on offer — a deck in a document can do everything a deck can do.
 */
export function DeckTools({
  deck,
  compact = false,
  onInsertSlide,
}: {
  deck: Deck;
  compact?: boolean;
  /** A saved slide was chosen from the kit. */
  onInsertSlide?: (piece: KitPiece) => void;
}) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [elementOpen, setElementOpen] = useState(false);
  const { current, style, patch, setStyle, addSlide, placeImage } = deck;

  // Selected whole and filtered here: a filter inside the selector hands
  // React a new array every render, which zustand reads as a change.
  const assets = useKit((s) => s.assets);
  const kitPictures = useMemo(
    () => assets.filter((a): a is KitImage => a.kind === "image"),
    [assets],
  );
  const kitSlides = useMemo(
    () =>
      assets.filter((a): a is KitPiece => a.kind === "piece" && a.of === "slide"),
    [assets],
  );

  const button = cn(
    "flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg",
  );

  return (
    <>
      <button
        type="button"
        onClick={addSlide}
        aria-label="Add a slide"
        className={button}
      >
        <Icon name="plus" size={11} />
        <span className={compact ? "sr-only" : "hidden sm:inline"}>Slide</span>
      </button>

      <span className="relative">
        <button
          type="button"
          onClick={() => setStyleOpen((v) => !v)}
          aria-pressed={styleOpen}
          aria-label={`Deck style — ${DECK_THEMES[style.theme].label}`}
          className={cn(
            "flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-[11.5px] transition-colors duration-150",
            styleOpen
              ? "border-line-strong bg-surface-2 text-fg"
              : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
          )}
        >
          <Icon name="type" size={11} />
          <span className={compact ? "sr-only" : "hidden sm:inline"}>
            {DECK_THEMES[style.theme].label}
          </span>
        </button>
        {styleOpen && (
          <DeckStylePanel
            style={style}
            onChange={setStyle}
            onClose={() => setStyleOpen(false)}
          />
        )}
      </span>

      <span className="relative">
        <button
          type="button"
          onClick={() => setElementOpen((v) => !v)}
          aria-pressed={elementOpen}
          aria-label="Element"
          className={cn(
            "flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-[11.5px] transition-colors duration-150",
            elementOpen
              ? "border-line-strong bg-surface-2 text-fg"
              : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
          )}
        >
          <Icon name="board" size={11} />
          <span className={compact ? "sr-only" : "hidden sm:inline"}>Element</span>
        </button>
        {elementOpen && current && (
          <div className="anim-pop absolute top-full right-0 z-40 mt-1.5 w-[168px] rounded-md border border-line-strong bg-surface p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]">
            {ELEMENTS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  patch(current.id, {
                    objects: insertObject(current.objects ?? [], kind),
                  });
                  setElementOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setElementOpen(false);
                void placeImage(null);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="image" size={11} />
              Picture
            </button>

            {/* The kit, reachable from where elements are added rather than
                from a panel of its own — a saved slide and a rectangle are the
                same kind of answer to "put something here". */}
            {kitPictures.length > 0 && (
              <>
                <span className="my-1 block h-px bg-line" />
                {kitPictures.map((picture) => (
                  <button
                    key={picture.id}
                    type="button"
                    onClick={() => {
                      setElementOpen(false);
                      void kitImage(
                        picture.id,
                        picture.name,
                        picture.width,
                        picture.height,
                      ).then((image) => {
                        if (!image) return;
                        patch(current.id, {
                          objects: [
                            ...(current.objects ?? []),
                            imageObject(
                              image.src,
                              image.width,
                              image.height,
                              picture.name,
                            ),
                          ],
                        });
                      });
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <Icon name="group" size={11} />
                    <span className="truncate">{picture.name}</span>
                  </button>
                ))}
              </>
            )}

            {kitSlides.length > 0 && (
              <>
                <span className="my-1 block h-px bg-line" />
                {kitSlides.map((piece) => (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => {
                      setElementOpen(false);
                      onInsertSlide?.(piece);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <Icon name="slides" size={11} />
                    <span className="truncate">{piece.name}</span>
                  </button>
                ))}
              </>
            )}
            {(current.objects?.length ?? 0) > 1 && (
              <>
                <span className="my-1 block h-px bg-line" />
                <button
                  type="button"
                  onClick={() => {
                    patch(current.id, {
                      objects: balanceObjects(current.objects ?? []),
                    });
                    setElementOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="grip" size={11} />
                  Balance layout
                </button>
              </>
            )}
          </div>
        )}
      </span>
    </>
  );
}

/** Layout, position in the deck, and the way through it. */
export function SlideBar({ deck }: { deck: Deck }) {
  const { current, slides, index, setIndex, patch, removeSlide } = deck;
  const notify = useUI((s) => s.notify);

  return (
    <div className="flex w-full items-center gap-2">
      {current && (
        <LayoutPicker
          value={current.layout ?? "auto"}
          inferred={layoutOf(current, index)}
          onChange={(layout) => patch(current.id, { layout })}
        />
      )}
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[10.5px] text-fg-subtle tabular-nums">
        {index + 1} / {slides.length}
      </span>
      <button
        type="button"
        onClick={() => setIndex((i) => Math.max(i - 1, 0))}
        disabled={index === 0}
        aria-label="Previous slide"
        className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors enabled:hover:text-fg disabled:opacity-30"
      >
        <Icon name="chevron-left" size={12} />
      </button>
      <button
        type="button"
        onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
        disabled={index >= slides.length - 1}
        aria-label="Next slide"
        className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors enabled:hover:text-fg disabled:opacity-30"
      >
        <Icon name="chevron-right" size={12} />
      </button>
      <button
        type="button"
        onClick={() => {
          if (!current) return;
          addPiece("slide", current, current.title || "Slide");
          notify("Slide saved to your kit");
        }}
        aria-label="Save this slide to your kit"
        title="Save this slide to your kit"
        className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
      >
        <Icon name="group" size={12} />
      </button>
      <button
        type="button"
        onClick={() => current && removeSlide(current.id)}
        disabled={slides.length <= 1}
        aria-label="Delete slide"
        className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors enabled:hover:border-danger/60 enabled:hover:text-danger disabled:opacity-30"
      >
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

/** The speaker note, which is part of the deck rather than of the slide. */
export function SpeakerNote({ deck }: { deck: Deck }) {
  const { current, patch } = deck;
  if (!current) return null;
  return (
    <input
      value={current.note ?? ""}
      onChange={(e) => patch(current.id, { note: e.target.value })}
      placeholder="Speaker note…"
      aria-label="Speaker note"
      className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-fg-muted outline-none placeholder:text-fg-subtle focus:border-accent"
    />
  );
}
