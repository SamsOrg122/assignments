"use client";

/**
 * The landscape, the wordmark over it, and the scroll hint.
 *
 * One job beyond rendering those three: the parallax. Five layers move at
 * five rates as the page scrolls — the far ridge barely, the framing pines
 * most — and the wordmark moves faster than any of them while fading out. That
 * difference in rate is the entire illusion of depth; without it this is a
 * picture with text on top.
 *
 * ── HOW THE SCROLL HANDLER STAYS CHEAP ─────────────────────────────────
 * A scroll listener that writes to the DOM on every event fires far more often
 * than the screen refreshes, and each write is a style recalculation. So the
 * work is coalesced into one `requestAnimationFrame` per frame with a latch,
 * and everything it writes is a `transform` or an `opacity` — the two
 * properties a browser can change without touching layout or paint.
 *
 * The layers are found by id rather than by ref because they live inside
 * `Landscape`, which is a drawing and has no business exposing five refs
 * upward to satisfy the component that happens to scroll it.
 */

import { useEffect, useRef } from "react";
import { Logo } from "@/components/ui/Logo";

/** How much of the scroll each layer takes. Further away moves less. */
const RATES: Record<string, number> = {
  "tg-sun": 0.03,
  "tg-far": 0.06,
  "tg-mid": 0.11,
  "tg-near": 0.17,
  "tg-fg": 0.22,
};

export function GlassHero({ children }: { children?: React.ReactNode }) {
  const hero = useRef<HTMLElement>(null);
  const wordmark = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Somebody who asked for less motion gets a still picture. The landscape
    // is still the landscape; it simply does not slide.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Object.keys(RATES)
      .map((id) => [document.getElementById(id), RATES[id]] as const)
      .filter((pair): pair is readonly [HTMLElement, number] => Boolean(pair[0]));

    let queued = false;
    const draw = () => {
      queued = false;
      const y = window.scrollY;
      for (const [node, rate] of layers)
        node.setAttribute("transform", `translate(0 ${(y * rate).toFixed(1)})`);

      const mark = wordmark.current;
      const tall = hero.current?.offsetHeight ?? 1;
      if (mark) {
        mark.style.transform = `translate(-50%, calc(-50% + ${(y * 0.28).toFixed(1)}px))`;
        // Gone by 60% of the hero's height, so it has finished fading before
        // the sheet's top edge reaches it rather than sliding under it.
        mark.style.opacity = String(Math.max(0, 1 - y / (tall * 0.6)).toFixed(2));
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    draw();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="hero" id="top" ref={hero}>
      {children}
      <div className="vignette" />
      <div
        ref={wordmark}
        className="absolute top-[44%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[0.22em] whitespace-nowrap"
        style={{
          font: "300 clamp(60px, 9.4vw, 128px)/1 var(--font-display), Georgia, serif",
          letterSpacing: "-0.015em",
          // Not white. The sky is daylight in the light theme and night in the
          // dark one, so the ink follows it — see `--hero-ink` in globals.css.
          color: "var(--hero-ink)",
          textShadow: "0 6px 44px rgba(30,16,70,.28)",
          willChange: "transform",
        }}
      >
        <Logo
          size={1}
          className="!h-[0.58em] !w-[0.58em] drop-shadow-[0_6px_30px_rgba(30,16,70,0.4)]"
        />
        <span>Tougather</span>
      </div>

      <div className="scrollhint absolute bottom-[78px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[12.5px] tracking-[0.06em]"
        style={{ color: "var(--hero-ink-soft)" }}>
        <span>scroll</span>
        <i />
      </div>
    </section>
  );
}
