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
import type {
  DeckStyle,
  PeerState,
  Project,
  Slide,
  SlideLayout,
  SlidesBlock,
} from "@/lib/types";
import { DEFAULT_DECK_STYLE } from "@/lib/types";
import { DECK_THEMES, deckVars } from "@/lib/deck-themes";
import { DeckStylePanel } from "./DeckStylePanel";
import {
  SlideObjectsEditor,
  SlideObjectsView,
  balanceObjects,
  insertObject,
} from "./SlideObjects";
import { importPptxFile } from "@/lib/pptx";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";

/**
 * Layout is inferred from the slide's own shape rather than stored, so a slide
 * restyles itself as you edit it and there's no state to get out of sync.
 */
type Layout = "title" | "statement" | "bullets" | "split";

function layoutOf(slide: Slide, index: number): Layout {
  // An author's choice always beats the guess.
  if (slide.layout && slide.layout !== "auto") return slide.layout;
  const bullets = slide.bullets.filter((b) => b.trim());
  if (index === 0 && bullets.length <= 1) return "title";
  if (bullets.length === 0) return "statement";
  if (bullets.length === 1 && bullets[0].length > 90) return "statement";
  return bullets.length > 4 ? "split" : "bullets";
}

export function DeckEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const addBlock = useProjects((s) => s.addBlock);

  const deck = useMemo(
    () => project.blocks.find((b): b is SlidesBlock => b.type === "slides"),
    [project.blocks],
  );

  const notify = useUI((s) => s.notify);
  const [index, setIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [elementOpen, setElementOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  if (!deck) {
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
  }

  const slides = deck.slides;
  const clamped = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[clamped];

  const style = deck.style ?? DEFAULT_DECK_STYLE;

  const setStyle = (next: Partial<DeckStyle>) =>
    updateBlock<SlidesBlock>(project.id, deck.id, (b) => ({
      style: { ...DEFAULT_DECK_STYLE, ...b.style, ...next },
    }));

  /** Append an imported deck rather than replacing what's here. */
  const importDeck = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const imported = await importPptxFile(file);
      updateBlock<SlidesBlock>(project.id, deck.id, (b) => ({
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

  const patch = (slideId: string, next: Partial<Slide>) =>
    updateBlock<SlidesBlock>(project.id, deck.id, (b) => ({
      slides: b.slides.map((s) => (s.id === slideId ? { ...s, ...next } : s)),
    }));

  const addSlide = () => {
    const fresh: Slide = { id: uid(), title: "New slide", bullets: [""] };
    updateBlock<SlidesBlock>(project.id, deck.id, (b) => ({
      slides: [
        ...b.slides.slice(0, clamped + 1),
        fresh,
        ...b.slides.slice(clamped + 1),
      ],
    }));
    setIndex(clamped + 1);
  };

  const removeSlide = (id: string) =>
    updateBlock<SlidesBlock>(project.id, deck.id, (b) => ({
      slides: b.slides.length > 1 ? b.slides.filter((s) => s.id !== id) : b.slides,
    }));

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
              <button
                type="button"
                onClick={addSlide}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="plus" size={11} />
                <span className="hidden sm:inline">Slide</span>
              </button>
              <span className="relative">
                <button
                  type="button"
                  onClick={() => setStyleOpen((v) => !v)}
                  aria-pressed={styleOpen}
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-[11.5px] transition-colors duration-150",
                    styleOpen
                      ? "border-line-strong bg-surface-2 text-fg"
                      : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Icon name="type" size={11} />
                  <span className="hidden sm:inline">
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
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-[11.5px] transition-colors duration-150",
                    elementOpen
                      ? "border-line-strong bg-surface-2 text-fg"
                      : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Icon name="board" size={11} />
                  <span className="hidden sm:inline">Element</span>
                </button>
                {elementOpen && current && (
                  <div className="anim-pop absolute top-full right-0 z-40 mt-1.5 w-[168px] rounded-md border border-line-strong bg-surface p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]">
                    {(
                      [
                        ["text", "Text"],
                        ["rect", "Rectangle"],
                        ["ellipse", "Ellipse"],
                        ["line", "Line"],
                      ] as const
                    ).map(([kind, label]) => (
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
              <div
                className="relative aspect-[16/9] w-full max-w-[860px] overflow-hidden rounded-lg border border-line"
                style={{ containerType: "inline-size" }}
              >
                <SlideView
                  slide={current}
                  index={clamped}
                  style={style}
                  hideObjects
                  onChange={(next) => current && patch(current.id, next)}
                />
                {current && (
                  <div style={deckVars(DECK_THEMES[style.theme], style.scale, style.accent)} className="absolute inset-0">
                    <SlideObjectsEditor
                      slide={current}
                      onChange={(objects) => patch(current.id, { objects })}
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 flex w-full max-w-[860px] items-center gap-2">
                {current && (
                  <LayoutPicker
                    value={current.layout ?? "auto"}
                    inferred={layoutOf(current, clamped)}
                    onChange={(layout) => patch(current.id, { layout })}
                  />
                )}
                <span className="h-px flex-1 bg-line" />
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                  disabled={clamped === 0}
                  aria-label="Previous slide"
                  className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors enabled:hover:text-fg disabled:opacity-30"
                >
                  <Icon name="chevron-left" size={12} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIndex((i) => Math.min(i + 1, slides.length - 1))
                  }
                  disabled={clamped >= slides.length - 1}
                  aria-label="Next slide"
                  className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors enabled:hover:text-fg disabled:opacity-30"
                >
                  <Icon name="chevron-right" size={12} />
                </button>
              </div>

              {current && (
                <input
                  value={current.note ?? ""}
                  onChange={(e) => patch(current.id, { note: e.target.value })}
                  placeholder="Speaker note…"
                  className="mt-2 w-full max-w-[860px] rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-fg-muted outline-none placeholder:text-fg-subtle focus:border-accent"
                />
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  auto: "Automatic",
  title: "Title",
  statement: "Statement",
  bullets: "Bullets",
  split: "Two columns",
};

/**
 * Per-slide layout. "Automatic" is the default and stays honest — it shows
 * which layout the content is currently implying, so overriding is a decision
 * rather than a guess.
 */
function LayoutPicker({
  value,
  inferred,
  onChange,
}: {
  value: SlideLayout;
  inferred: Layout;
  onChange: (layout: SlideLayout) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11.5px] text-fg-subtle">Layout</span>
      <select
        value={value}
        aria-label="Slide layout"
        onChange={(e) => onChange(e.target.value as SlideLayout)}
        className="rounded-sm border border-line bg-surface px-1.5 py-1 text-[11.5px] text-fg-muted outline-none transition-colors hover:border-line-strong focus:border-accent"
      >
        {(Object.keys(LAYOUT_LABELS) as SlideLayout[]).map((key) => (
          <option key={key} value={key}>
            {key === "auto"
              ? `Automatic — ${LAYOUT_LABELS[inferred]}`
              : LAYOUT_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One slide, rendered with the layout its content implies and the deck's theme.
 *
 * Nothing here reads a colour or a face directly — every value comes from the
 * `--slide-*` custom properties the theme sets on the surface, so the same
 * markup renders as Ink, Paper or Signal without a branch.
 */
function SlideView({
  slide,
  index,
  style,
  onChange,
  readOnly = false,
  hideObjects = false,
}: {
  slide?: Slide;
  index: number;
  style: DeckStyle;
  onChange?: (next: Partial<Slide>) => void;
  readOnly?: boolean;
  /** The stage hides the static layer — the editor renders it interactively. */
  hideObjects?: boolean;
}) {
  const theme = DECK_THEMES[style.theme] ?? DECK_THEMES.ink;
  const vars = deckVars(theme, style.scale, style.accent);

  if (!slide)
    return <div className="size-full" style={{ background: theme.bg }} />;

  const layout = layoutOf(slide, index);
  const bullets = slide.bullets;
  const centred = style.align === "centre";

  const setBullets = (next: string[]) => onChange?.({ bullets: next });

  /** Scale folds into the clamp so the whole deck moves together. */
  const size = (min: number, fluid: string, max: number) =>
    `calc(clamp(${min}px, ${fluid}, ${max}px) * var(--slide-scale))`;

  const Title = (
    <Field
      value={slide.title}
      readOnly={readOnly}
      onChange={(title) => onChange?.({ title })}
      placeholder="Slide title"
      className={cn(
        "w-full bg-transparent outline-none",
        centred && "text-center",
      )}
      style={{
        color: "var(--slide-fg)",
        fontFamily: "var(--slide-title-family)",
        fontWeight: "var(--slide-title-weight)" as unknown as number,
        letterSpacing: "var(--slide-title-tracking)",
        fontSize:
          layout === "title"
            ? size(28, "5.2cqw", 60)
            : size(20, "3.2cqw", 34),
        lineHeight: layout === "title" ? 1.05 : 1.12,
      }}
    />
  );

  const Rule = style.rule ? (
    <span
      className={cn(
        "block h-px shrink-0",
        centred ? "mx-auto w-[12%]" : "w-[18%]",
      )}
      style={{ background: "var(--slide-accent)" }}
    />
  ) : null;

  const Bullets = (
    <ul
      className={cn(
        "space-y-[0.55em]",
        layout === "split" ? "columns-2 gap-8 [&>li]:break-inside-avoid" : "",
      )}
    >
      {bullets.map((b, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-[0.6em]",
            centred && layout !== "split" && "justify-center",
          )}
        >
          <span
            aria-hidden="true"
            className="mt-[0.62em] size-[0.28em] shrink-0 rounded-full"
            style={{ background: "var(--slide-accent)" }}
          />
          <Field
            value={b}
            readOnly={readOnly}
            placeholder="A point…"
            onChange={(v) => setBullets(bullets.map((x, j) => (j === i ? v : x)))}
            onEnter={() =>
              setBullets([...bullets.slice(0, i + 1), "", ...bullets.slice(i + 1)])
            }
            onEmptyBackspace={() =>
              bullets.length > 1 &&
              setBullets(bullets.filter((_, j) => j !== i))
            }
            className={cn(
              "w-full bg-transparent leading-relaxed outline-none",
              centred && layout !== "split" && "text-center",
            )}
            style={{
              color: "var(--slide-muted)",
              fontSize: size(12, "1.9cqw", 20),
            }}
          />
        </li>
      ))}
    </ul>
  );

  const chrome =
    style.numbers || style.footer?.trim() ? (
      <div
        className="pointer-events-none absolute inset-x-[7cqw] bottom-[3.5cqh] flex items-center justify-between"
        style={{
          color: "var(--slide-muted)",
          fontSize: size(7, "0.95cqw", 11),
        }}
      >
        <span className="truncate">{style.footer?.trim() ?? ""}</span>
        {style.numbers && <span className="tabular-nums">{index + 1}</span>}
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "relative flex size-full flex-col justify-center px-[7cqw] py-[6cqh]",
        centred && "items-center",
      )}
      style={{ ...vars, background: "var(--slide-bg)", containerType: "size" }}
    >
      <SlideSurface background={style.background} />
      {!hideObjects && <SlideObjectsView objects={slide.objects} />}
      {layout === "title" ? (
        <div className={cn("w-full", centred && "text-center")}>
          {Title}
          <div className={cn("mt-[2.5cqh]", centred ? "mx-auto max-w-[74%]" : "max-w-[62%]")}>
            {Bullets}
          </div>
          {Rule && <div className="mt-[4cqh]">{Rule}</div>}
        </div>
      ) : layout === "statement" ? (
        <div className={cn("w-full", centred ? "max-w-[80%]" : "max-w-[86%]")}>
          {Title}
          {Rule && <div className="mt-[2.5cqh]">{Rule}</div>}
          <div className="mt-[3cqh]">{Bullets}</div>
        </div>
      ) : (
        <div className="w-full">
          {Title}
          <span
            className="my-[3cqh] block h-px w-full"
            style={{
              background: style.rule
                ? "var(--slide-accent)"
                : "var(--slide-line)",
              opacity: style.rule ? 0.9 : 1,
            }}
          />
          <div className={cn(centred ? "mx-auto max-w-[92%]" : "max-w-[92%]")}>
            {Bullets}
          </div>
        </div>
      )}
      {chrome}
    </div>
  );
}

/**
 * The slide's surface treatment.
 *
 * Drawn from the theme's own accent and ink, so a texture can never introduce
 * a colour the theme didn't choose. Absolutely positioned behind everything
 * and non-interactive — a background that can take a click is a bug.
 */
function SlideSurface({ background }: { background?: DeckStyle["background"] }) {
  if (!background || background === "flat") return null;

  if (background === "grid")
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--slide-line) 1px, transparent 1px), linear-gradient(90deg, var(--slide-line) 1px, transparent 1px)",
          backgroundSize: "6cqw 6cqw",
          opacity: 0.5,
        }}
      />
    );

  if (background === "glow")
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 90% at 12% 0%, color-mix(in srgb, var(--slide-accent) 20%, transparent), transparent 62%)",
        }}
      />
    );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(120% 90% at 50% -20%, color-mix(in srgb, var(--slide-fg) 7%, transparent), transparent 60%)",
      }}
    />
  );
}

function Field({
  value,
  onChange,
  onEnter,
  onEmptyBackspace,
  placeholder,
  className,
  style,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
}) {
  if (readOnly)
    return (
      <div className={className} style={style}>
        {value || <span className="opacity-40">{placeholder}</span>}
      </div>
    );

  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      style={style}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        } else if (e.key === "Backspace" && value === "" && onEmptyBackspace) {
          e.preventDefault();
          onEmptyBackspace();
        }
      }}
      className={cn(className, "placeholder:opacity-40")}
    />
  );
}
