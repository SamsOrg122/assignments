"use client";

/**
 * The banner at the top of the page: one photograph, one word over it.
 *
 * The word is the whole idea. It says "Tougather", then becomes the things
 * Tougather replaces — Documents, Presentations, Spreadsheets, Whiteboards —
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
 *
 * Each carries its own mark. The shape changing alongside the word is what
 * stops the loop reading as a text effect — it looks like a different *thing*
 * each time, and the notched square coming back around is the one that means
 * "and all of it is this".
 */
const WORDS: Array<{ word: string; mark: MarkShape }> = [
  { word: "Tougather", mark: "notch" },
  { word: "Documents", mark: "circle" },
  { word: "Presentations", mark: "square" },
  { word: "Spreadsheets", mark: "triangle" },
  { word: "Whiteboards", mark: "diamond" },
  { word: "Research", mark: "hexagon" },
];

type MarkShape =
  | "notch"
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "hexagon";

/**
 * The mark, drawn on a 24 grid at a single stroke weight so the shapes read as
 * one family rather than as six clip-art glyphs. Optically sized, not
 * mathematically: a triangle at the same bounding box as a circle looks
 * smaller, so it gets more room.
 */
function Mark({ shape }: { shape: MarkShape }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="hero-mark size-[0.62em] shrink-0"
    >
      {shape === "notch" && (
        // A square with its corners taken out — the brand shape.
        <path
          {...common}
          d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"
        />
      )}
      {shape === "circle" && <circle {...common} cx="12" cy="12" r="9" />}
      {shape === "square" && (
        <rect {...common} x="3.5" y="3.5" width="17" height="17" rx="2" />
      )}
      {shape === "triangle" && <path {...common} d="M12 2.5 22 20H2z" />}
      {shape === "diamond" && <path {...common} d="M12 2 22 12 12 22 2 12z" />}
      {shape === "hexagon" && (
        <path {...common} d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z" />
      )}
    </svg>
  );
}

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

  const current = reduced ? WORDS[0] : WORDS[index];
  const letters = [...current.word];

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
        <p className="sr-only">Tougather</p>

        <span
          aria-hidden="true"
          className="hero-word flex items-center justify-center gap-[0.3em] text-center text-[clamp(34px,8vw,96px)] leading-[1.05] font-light tracking-[-0.02em] text-white"
        >
          <span key={`m-${index}`} className="contents">
            <Mark shape={current.mark} />
          </span>
          <span>
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
        </span>
      </div>
    </div>
  );
}
