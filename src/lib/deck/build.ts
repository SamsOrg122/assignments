/**
 * What is visible at a given point in a slide's build.
 *
 * A build is a slide shown in pieces, and the only thing that has to be right
 * is the arithmetic: how many presses a slide takes, and what is on screen
 * after each one. Both the presenting view and the presenter's second screen
 * read these functions, which is what stops the two disagreeing about where
 * the deck is — the failure that makes a presenter stop and apologise.
 */

import type { Slide, SlideObject } from "../types";

/** How many extra presses this slide takes before moving on. Zero for none. */
export function buildSteps(slide: Slide): number {
  const mode = slide.build ?? "none";
  if (mode === "none") return 0;

  const bullets = mode === "bullets" || mode === "both" ? slide.bullets.length : 0;
  const objects =
    mode === "objects" || mode === "both"
      ? // Step 0 is "already there", so the count is the highest numbered step.
        Math.max(0, ...(slide.objects ?? []).map((o) => o.step ?? 0))
      : 0;

  // A bullet build numbers its bullets 1…n and an object build uses whatever
  // numbers the objects carry; together, the slide takes as many presses as
  // the longer of the two.
  return Math.max(bullets, objects);
}

/** Bullets visible at `step`. Before the build starts, none of them are. */
export function visibleBullets(slide: Slide, step: number): string[] {
  const mode = slide.build ?? "none";
  if (mode !== "bullets" && mode !== "both") return slide.bullets;
  return slide.bullets.slice(0, Math.max(0, step));
}

/** Whether an object is on screen yet. */
export function objectVisible(
  slide: Slide,
  object: SlideObject,
  step: number,
): boolean {
  const mode = slide.build ?? "none";
  if (mode !== "objects" && mode !== "both") return true;
  return (object.step ?? 0) <= step;
}

/** Objects on screen at `step`, in draw order. */
export const visibleObjects = (slide: Slide, step: number): SlideObject[] =>
  (slide.objects ?? []).filter((o) => objectVisible(slide, o, step));

/**
 * Where the next press lands.
 *
 * The one rule worth stating: a press advances the build before it advances
 * the slide, and going back goes to the *end* of the previous slide's build
 * rather than its start — otherwise stepping back one press to re-read a
 * bullet replays the whole slide, which nobody has ever wanted.
 */
export function advance(
  slides: Slide[],
  index: number,
  step: number,
  direction: 1 | -1,
): { index: number; step: number } {
  const here = slides[index];
  if (!here) return { index, step: 0 };

  if (direction === 1) {
    if (step < buildSteps(here)) return { index, step: step + 1 };
    if (index >= slides.length - 1) return { index, step };
    return { index: index + 1, step: 0 };
  }

  if (step > 0) return { index, step: step - 1 };
  if (index === 0) return { index, step: 0 };
  const previous = slides[index - 1];
  return { index: index - 1, step: buildSteps(previous) };
}

/** Total presses to get from the start to the end, for a progress reading. */
export const totalSteps = (slides: Slide[]): number =>
  slides.reduce((n, slide) => n + 1 + buildSteps(slide), 0);

/** How far in we are, counted the same way. */
export function stepsSoFar(slides: Slide[], index: number, step: number): number {
  let n = 0;
  for (let i = 0; i < index; i++) n += 1 + buildSteps(slides[i]);
  return n + step;
}
