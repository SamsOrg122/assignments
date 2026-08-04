"use client";

/**
 * The Presenting editor.
 *
 * Opinionated by design: you pick a *layout*, not a font size. Every layout is
 * already set — type scale, measure, spacing — so the deck looks composed
 * without anyone choosing anything. "Beautiful deck fast", not a formatting
 * surface.
 */

import { useMemo, useState } from "react";
import type { PeerState, Project, Slide, SlidesBlock } from "@/lib/types";
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

  const [index, setIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);

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
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={addSlide}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="plus" size={11} />
                Slide
              </button>
              <button
                type="button"
                onClick={() => setPresenting(true)}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="play" size={11} />
                Present
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
              <SlideView slide={current} index={clamped} readOnly />
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
                      <SlideView slide={s} index={i} readOnly />
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
              <div className="aspect-[16/9] w-full max-w-[860px] overflow-hidden rounded-lg border border-line">
                <SlideView
                  slide={current}
                  index={clamped}
                  onChange={(next) => current && patch(current.id, next)}
                />
              </div>

              <div className="mt-3 flex w-full max-w-[860px] items-center gap-2">
                <span className="label-mono">
                  {clamped + 1} / {slides.length} ·{" "}
                  {current ? layoutOf(current, clamped) : "—"}
                </span>
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

/**
 * One slide, rendered with the layout its content implies. All four layouts
 * share the same scale and margins so a deck reads as one object.
 */
function SlideView({
  slide,
  index,
  onChange,
  readOnly = false,
}: {
  slide?: Slide;
  index: number;
  onChange?: (next: Partial<Slide>) => void;
  readOnly?: boolean;
}) {
  if (!slide) return <div className="size-full bg-canvas" />;

  const layout = layoutOf(slide, index);
  const bullets = slide.bullets;

  const setBullets = (next: string[]) => onChange?.({ bullets: next });

  const Title = (
    <Field
      value={slide.title}
      readOnly={readOnly}
      onChange={(title) => onChange?.({ title })}
      placeholder="Slide title"
      className={cn(
        "w-full bg-transparent font-medium tracking-[-0.03em] text-fg outline-none",
        layout === "title"
          ? "text-[clamp(28px,5.2cqw,60px)] leading-[1.05]"
          : "text-[clamp(20px,3.2cqw,34px)] leading-[1.1]",
      )}
    />
  );

  const Bullets = (
    <ul
      className={cn(
        "space-y-[0.55em]",
        layout === "split" ? "columns-2 gap-8 [&>li]:break-inside-avoid" : "",
      )}
    >
      {bullets.map((b, i) => (
        <li key={i} className="flex items-start gap-[0.6em]">
          <span
            aria-hidden="true"
            className="mt-[0.62em] size-[0.28em] shrink-0 rounded-full bg-accent"
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
            className="w-full bg-transparent text-[clamp(12px,1.9cqw,20px)] leading-relaxed text-fg-muted outline-none"
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="flex size-full flex-col justify-center bg-canvas px-[7cqw] py-[6cqh]"
      style={{ containerType: "size" }}
    >
      {layout === "title" ? (
        <>
          <p className="mb-[2cqh] font-mono text-[clamp(8px,1.1cqw,12px)] tracking-[0.08em] text-fg-subtle uppercase">
            {new Date(0).getUTCFullYear() ? "" : ""}
            Assignments
          </p>
          {Title}
          <div className="mt-[2.5cqh] max-w-[62%]">{Bullets}</div>
          <span className="mt-[4cqh] h-px w-[18%] bg-accent" />
        </>
      ) : layout === "statement" ? (
        <div className="max-w-[86%]">
          {Title}
          <div className="mt-[3cqh]">{Bullets}</div>
        </div>
      ) : (
        <>
          {Title}
          <span className="my-[3cqh] h-px w-full bg-line" />
          <div className="max-w-[92%]">{Bullets}</div>
        </>
      )}
    </div>
  );
}

function Field({
  value,
  onChange,
  onEnter,
  onEmptyBackspace,
  placeholder,
  className,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  if (readOnly)
    return (
      <div className={cn(className, "truncate-none")}>
        {value || <span className="text-fg-subtle">{placeholder}</span>}
      </div>
    );

  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        } else if (e.key === "Backspace" && value === "" && onEmptyBackspace) {
          e.preventDefault();
          onEmptyBackspace();
        }
      }}
      className={cn(className, "placeholder:text-fg-subtle")}
    />
  );
}
