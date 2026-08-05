"use client";

/**
 * Scroll-linked motion.
 *
 * Writes transforms straight to the node inside a rAF rather than through
 * state: a scroll handler that re-renders React sixty times a second is the
 * usual reason "smooth" pages aren't. One passive listener, one frame
 * scheduled at a time, transform and opacity only — nothing here can trigger
 * layout.
 *
 * Animates nothing when the visitor has asked for less motion; the element
 * simply sits where the CSS put it.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

export interface ParallaxOptions {
  /**
   * Pixels of travel across the element's full pass through the viewport.
   * Positive drifts down (slower than the page), negative drifts up.
   */
  distance?: number;
  /** Extra scale at the midpoint, e.g. 0.06 for a 6% drift-in. */
  scale?: number;
}

export function useParallax<T extends HTMLElement>({
  distance = 60,
  scale = 0,
}: ParallaxOptions = {}) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;

    let frame = 0;
    let visible = false;

    const apply = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight || 1;

      // -1 just below the fold, 0 centred, 1 just above the top.
      const progress =
        1 - (rect.top + rect.height / 2) / (vh / 2 + rect.height / 2);
      const clamped = Math.max(-1, Math.min(1, progress));

      const y = clamped * distance;
      const s = 1 + (1 - Math.abs(clamped)) * scale;
      node.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    };

    const schedule = () => {
      if (!visible || frame) return;
      frame = requestAnimationFrame(apply);
    };

    // Only listen while the element is actually on screen. Ten parallax
    // elements all measuring on every scroll event is how this gets slow.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
      },
      { rootMargin: "10% 0px" },
    );
    io.observe(node);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      node.style.transform = "";
    };
  }, [distance, scale, reduced]);

  return ref;
}

/**
 * Tweens a number when it changes.
 *
 * For the estimator totals: a figure snapping to a new value reads as a
 * glitch, a short ease reads as the number being recalculated. Interrupting a
 * tween resumes from wherever it had got to, so dragging the slider stays
 * continuous instead of restarting on every step.
 */
export function useTweenedNumber(value: number, duration = 380): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const position = useRef(value);

  useEffect(() => {
    if (reduced) return;
    const from = position.current;
    if (from === value) return;

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic: quick to respond, settling rather than stopping dead.
      const next = from + (value - from) * (1 - Math.pow(1 - t, 3));
      position.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return reduced ? value : display;
}
