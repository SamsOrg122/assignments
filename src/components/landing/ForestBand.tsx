"use client";

/**
 * The forest.
 *
 * One full-bleed image, given the whole width and a slow parallax drift, so
 * the thing the money pays for gets a moment rather than a thumbnail. It sits
 * between the statement of intent and the mechanics of the impact section —
 * the pause between "why" and "how".
 *
 * Faded into the canvas at both edges: a photograph with hard horizontal seams
 * reads as a banner dropped onto the page, and the point is that it belongs
 * to it.
 */

import { Visual } from "./Visual";
import { ForestFallback } from "./mocks";
import { Leaf } from "./primitives";
import { useParallax } from "@/lib/use-parallax";
import { PRIMARY_CAUSE } from "@/lib/impact/config";

export function ForestBand() {
  // The image drifts up as you scroll past and eases back to its own scale at
  // the midpoint, so the band feels deeper than the page rather than pasted on.
  const ref = useParallax<HTMLDivElement>({ distance: -46, scale: 0.07 });

  return (
    <div className="relative h-[clamp(300px,48vw,560px)] overflow-hidden">
      <div ref={ref} className="absolute inset-[-8%] will-change-transform">
        <Visual
          id="impact-forest"
          className="absolute inset-0"
          imageClassName="opacity-95"
          sizes="100vw"
          fallback={<ForestFallback className="absolute inset-0" />}
        />
      </div>

      {/* Edge fades, top and bottom, into the canvas colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--color-canvas)_0%,transparent_28%,transparent_58%,var(--color-canvas)_100%)]"
      />

      <div className="absolute inset-x-0 bottom-0 px-5 pb-10 sm:px-8 sm:pb-14">
        <div className="mx-auto w-full max-w-[1240px]">
          <p className="flex items-center gap-2 text-[12.5px] text-leaf">
            <Leaf size={13} />
            {PRIMARY_CAUSE.name}
          </p>
          <p className="mt-2 max-w-[34ch] text-[clamp(18px,2.6vw,26px)] leading-[1.25] font-medium tracking-[-0.02em] text-fg text-balance">
            This is the part we can&apos;t design. So we pay for it instead.
          </p>
        </div>
      </div>
    </div>
  );
}
