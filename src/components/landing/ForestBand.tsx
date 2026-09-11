"use client";

/**
 * The forest.
 *
 * One full-bleed image, given the whole width and a slow parallax drift, so
 * the thing the money pays for gets a moment rather than a thumbnail. It sits
 * between the statement of intent and the mechanics of the impact section —
 * the pause between "why" and "how".
 *
 * ── IT USED TO FADE AND NOW IT HAS EDGES ───────────────────────────────
 * On the near-black page this bled into the canvas top and bottom, on the
 * reasoning that "a photograph with hard horizontal seams reads as a banner
 * dropped onto the page". That was right then and it is wrong on the sheet.
 * The fade ran to `--color-canvas`, which is now a pale lilac, so seventy per
 * cent of the band dissolved into the page and what was left was a dark stripe
 * floating in a gap — which is precisely the banner it was trying not to be.
 *
 * So it is an object instead: inset, with the same radius the cards have, on
 * the sheet like everything else. It is the one dark surface on the page, and
 * that is the point of it — a moment of somewhere else, between the statement
 * of intent and the mechanics.
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
    <div className="relative mx-auto h-[clamp(280px,42vw,480px)] w-[min(1240px,calc(100%-40px))] overflow-hidden rounded-[28px] shadow-[0_30px_70px_-40px_rgba(20,10,40,0.5)]">
      <div ref={ref} className="absolute inset-[-8%] will-change-transform">
        <Visual
          id="impact-forest"
          className="absolute inset-0"
          imageClassName="opacity-95"
          sizes="100vw"
          fallback={<ForestFallback className="absolute inset-0" />}
        />
      </div>

      {/* One shade over the lower half instead of a fade at both ends: the
          text below needs a ground, and the picture needs none. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_45%,rgba(8,10,14,0.72)_100%)]"
      />

      <div className="absolute inset-x-0 bottom-0 px-5 pb-10 sm:px-8 sm:pb-14">
        <div className="mx-auto w-full max-w-[1240px]">
          <p className="flex items-center gap-2 text-[12.5px] text-[#7fe3b8]">
            <Leaf size={13} />
            {PRIMARY_CAUSE.name}
          </p>
          <p className="display mt-2 max-w-[34ch] text-[clamp(19px,2.7vw,28px)] leading-[1.24] text-white text-balance">
            This is the part we can&apos;t design. So we pay for it instead.
          </p>
        </div>
      </div>
    </div>
  );
}
