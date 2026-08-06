"use client";

/**
 * The input meter.
 *
 * Deliberately a *meter*, not a hero graphic: thin ticks at editor scale, sat
 * inline next to the words the way a level readout sits in a status bar. The
 * big glowing orb is the house style of every AI voice mode, and it makes a
 * tool look like a demo of itself.
 *
 * Each bar carries its own smoothed value rather than reading the raw level:
 * a microphone peak is jittery, and bars that snap to it look like noise
 * instead of a voice. Values fall slower than they rise — the same asymmetry
 * every audio meter uses, because a syllable should punch and then settle.
 *
 * Written to a ref in a rAF loop, never to React state: this updates sixty
 * times a second and re-rendering a component that often to move a few pixels
 * is how a canvas app starts dropping frames.
 */

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const BARS = 28;
const MIN_H = 3;
const MAX_H = 26;

/** Envelope across the strip — quieter at the edges, so it reads as centred. */
const shapeAt = (i: number) => 0.45 + 0.55 * Math.sin((i / (BARS - 1)) * Math.PI);

export function Waveform({
  level,
  active,
  className,
}: {
  /** 0..1. Read through a ref by the animation loop. */
  level: number;
  /** Idle ticks sit flat rather than pretending to hear something. */
  active: boolean;
  className?: string;
}) {
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  const target = useRef(0);
  const activeRef = useRef(active);
  const reduced = useReducedMotion();

  useEffect(() => {
    target.current = level;
  }, [level]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (reduced) return;
    const values = new Array(BARS).fill(0);
    let raf = 0;

    const tick = () => {
      // A low resting floor while active, so silence reads as "open mic"
      // rather than as a dead strip. Static silhouette, not motion.
      const l = activeRef.current
        ? Math.max(0.16, Math.min(1, target.current * 2.4))
        : 0;

      for (let i = 0; i < BARS; i++) {
        // Neighbours lag slightly, so the strip ripples rather than pumping
        // as one solid mass.
        const want = l * shapeAt(i) * (0.78 + 0.22 * Math.sin(i * 0.9 + l * 7));
        values[i] += (want - values[i]) * (want > values[i] ? 0.5 : 0.16);
        const node = bars.current[i];
        if (node) {
          node.style.height = `${MIN_H + values[i] * (MAX_H - MIN_H)}px`;
          node.style.opacity = String(0.26 + values[i] * 0.64);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      className={cn("flex shrink-0 items-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            bars.current[i] = node;
          }}
          className="w-[2px] rounded-[1px] bg-fg-muted"
          style={
            reduced
              ? { height: MIN_H + (active ? shapeAt(i) * 12 : 0), opacity: 0.5 }
              : { height: MIN_H, opacity: 0.26 }
          }
        />
      ))}
    </div>
  );
}
