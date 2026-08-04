"use client";

import { useRef, useState } from "react";
import type { SlidesBlock as SlidesBlockModel, Slide } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function SlidesBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: SlidesBlockModel;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const count = block.slides.length;
  // Clamped rather than corrected in an effect: deleting the last slide should
  // not cost an extra render pass to notice.
  const clamped = Math.min(index, Math.max(count - 1, 0));
  const slide = block.slides[clamped];

  const patch = (slideId: string, next: Partial<Slide>) =>
    updateBlock<SlidesBlockModel>(projectId, block.id, (b) => ({
      slides: b.slides.map((s) => (s.id === slideId ? { ...s, ...next } : s)),
    }));

  const addSlide = () => {
    const fresh: Slide = { id: uid(), title: "New slide", bullets: [""] };
    updateBlock<SlidesBlockModel>(projectId, block.id, (b) => ({
      slides: [
        ...b.slides.slice(0, clamped + 1),
        fresh,
        ...b.slides.slice(clamped + 1),
      ],
    }));
    setIndex(clamped + 1);
  };

  const removeSlide = () => {
    if (count <= 1 || !slide) return;
    updateBlock<SlidesBlockModel>(projectId, block.id, (b) => ({
      slides: b.slides.filter((s) => s.id !== slide.id),
    }));
    setIndex(Math.max(clamped - 1, 0));
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
        <span className="label-mono">
          Slide {clamped + 1} / {count}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={addSlide}
            className="flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-[11px] text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={10} />
            Slide
          </button>
          <button
            type="button"
            onClick={removeSlide}
            disabled={count <= 1}
            aria-label="Delete slide"
            className="rounded-sm border border-line p-1 text-fg-subtle transition-colors duration-150 enabled:hover:border-line-strong enabled:hover:text-danger disabled:opacity-40"
          >
            <Icon name="trash" size={11} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label="Slide deck — use arrow keys to move"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, count - 1));
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
        }}
        className="relative aspect-[16/9] max-h-[420px] w-full overflow-hidden bg-canvas"
      >
        {/* The whole deck slides as one strip — cheap, and it reads as a deck. */}
        <div
          className="flex h-full transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${clamped * 100}%)` }}
        >
          {block.slides.map((s) => (
            <article
              key={s.id}
              className="flex h-full w-full shrink-0 flex-col justify-center px-8 py-8 sm:px-14"
              aria-hidden={s.id !== slide?.id}
            >
              <input
                value={s.title}
                onChange={(e) => patch(s.id, { title: e.target.value })}
                aria-label="Slide title"
                className="mb-4 w-full bg-transparent text-[22px] leading-tight font-medium tracking-[-0.025em] text-fg outline-none sm:text-[30px]"
              />
              <ul className="space-y-1.5">
                {s.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[9px] size-1 shrink-0 rounded-full bg-accent"
                    />
                    <input
                      value={bullet}
                      aria-label={`Bullet ${i + 1}`}
                      placeholder="Add a point…"
                      onChange={(e) =>
                        patch(s.id, {
                          bullets: s.bullets.map((b, j) =>
                            j === i ? e.target.value : b,
                          ),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          patch(s.id, {
                            bullets: [
                              ...s.bullets.slice(0, i + 1),
                              "",
                              ...s.bullets.slice(i + 1),
                            ],
                          });
                        } else if (
                          e.key === "Backspace" &&
                          bullet === "" &&
                          s.bullets.length > 1
                        ) {
                          e.preventDefault();
                          patch(s.id, {
                            bullets: s.bullets.filter((_, j) => j !== i),
                          });
                        }
                      }}
                      className="w-full bg-transparent text-[14px] leading-relaxed text-fg-muted outline-none placeholder:text-fg-subtle sm:text-[15px]"
                    />
                  </li>
                ))}
              </ul>
              {s.note && (
                <p className="mt-6 font-mono text-[10px] text-fg-subtle">
                  note · {s.note}
                </p>
              )}
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={clamped === 0}
          aria-label="Previous slide"
          className="absolute top-1/2 left-2 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/80 text-fg-muted backdrop-blur transition-colors duration-150 enabled:hover:text-fg disabled:opacity-0"
        >
          <Icon name="chevron-left" size={13} />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, count - 1))}
          disabled={clamped >= count - 1}
          aria-label="Next slide"
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/80 text-fg-muted backdrop-blur transition-colors duration-150 enabled:hover:text-fg disabled:opacity-0"
        >
          <Icon name="chevron-right" size={13} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-line py-2">
        {block.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === clamped}
            className={cn(
              "h-1 rounded-full transition-[width,background-color] duration-200",
              i === clamped ? "w-5 bg-fg-muted" : "w-1.5 bg-line-strong hover:bg-fg-subtle",
            )}
          />
        ))}
      </div>
    </div>
  );
}
