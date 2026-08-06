"use client";

/**
 * The banner at the top of the page: one photograph, one word over it.
 *
 * The word is the whole idea. It says "Assignments", then becomes the things
 * Assignments replaces — Documents, Presentations, Spreadsheets, Whiteboards —
 * and comes back. Nobody reads a feature list at the top of a landing page;
 * they will watch a word change four times.
 *
 * Animated per character rather than per word. A whole line fading out and
 * back in reads as a slideshow; letters that blur away and resolve in sequence
 * read as one thing *becoming* another, which is the claim being made.
 */

import { useEffect, useState } from "react";
import { Visual } from "./Visual";
import { DuskFallback } from "./mocks";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * The first entry is the product; the rest are what it replaces. Kept in the
 * order a person would meet them, not alphabetically.
 */
const WORDS = [
  "Assignments",
  "Documents",
  "Presentations",
  "Spreadsheets",
  "Whiteboards",
  "Research",
];

/** Long enough to read the word, short enough that nobody waits for the loop. */
const HOLD_MS = 2400;
/** Per-character stagger. Small — the whole exchange should take under 600ms. */
const STEP_MS = 26;

export function HeroBanner() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % WORDS.length),
      HOLD_MS,
    );
    return () => clearInterval(id);
  }, [reduced]);

  const word = reduced ? WORDS[0] : WORDS[index];
  const letters = [...word];

  return (
    <div className="relative isolate h-[clamp(320px,52vh,560px)] w-full overflow-hidden">
      <Visual
        id="hero-photo"
        className="absolute inset-0"
        priority
        sizes="100vw"
        fallback={<DuskFallback className="absolute inset-0" />}
      />

      {/* Two washes, not one: a light overall veil so the type holds at any
          contrast, and a bottom fade so the photograph dissolves into the page
          rather than ending on a seam. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.52)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_bottom,transparent,var(--color-canvas))]"
      />

      <div className="absolute inset-0 grid place-items-center px-6">
        {/* One accessible name for the whole thing, whatever the letters are
            doing — a screen reader should hear the product, not a slot
            machine. */}
        <p className="sr-only">Assignments</p>

        <span
          aria-hidden="true"
          className="hero-word text-center text-[clamp(38px,8.5vw,104px)] leading-[1.05] font-light tracking-[-0.02em] text-white"
        >
          {letters.map((char, i) => (
            <span
              // Keyed on the word so React replaces the nodes and the
              // animation actually restarts instead of being reused.
              key={`${index}-${i}`}
              className="hero-letter"
              style={{ animationDelay: `${i * STEP_MS}ms` }}
            >
              {char}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
