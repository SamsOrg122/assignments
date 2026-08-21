"use client";

/**
 * The mark on the sign-in stage.
 *
 * A thin eight-point asterisk on a faint set of rules that run the whole
 * panel — the rules are what stop it reading as a logo dropped in the middle
 * of a void, because they tie it to the edges of the screen it sits on.
 *
 * Drawn rather than imported. At this size a raster would need a 2x and a 3x
 * export and would still soften on a 4K panel, and the whole effect depends
 * on the strokes staying hairline-crisp at any width.
 *
 * The animation is one very slow rotation plus a breath on the stroke ends.
 * Slow enough that nobody watching it can see it move, present enough that a
 * screenshot and the real thing are different objects. Reduced motion stops
 * both and leaves the mark exactly as drawn.
 */

import { cn } from "@/lib/cn";

export function Starburst({ className }: { className?: string }) {
  return (
    <div className={cn("starburst-stage", className)} aria-hidden="true">
      {/* The rules. Absolute so they reach the panel's edges rather than the
          mark's box, which is what makes the composition feel placed. */}
      <span className="starburst-rule starburst-rule-h" />
      <span className="starburst-rule starburst-rule-v" />
      <span className="starburst-rule starburst-rule-d" />

      <svg
        className="starburst-mark"
        viewBox="-120 -120 240 240"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="butt"
        role="presentation"
      >
        <g className="starburst-spin">
          {/* Long axes, then the four short diagonals — the proportion is the
              whole character of the mark. */}
          <path className="starburst-arm" d="M0 -112V112" />
          <path className="starburst-arm" d="M-92 0H92" />
          <path className="starburst-arm starburst-arm-short" d="M-45 -45L45 45" />
          <path className="starburst-arm starburst-arm-short" d="M45 -45L-45 45" />
        </g>
      </svg>
    </div>
  );
}
