"use client";

/**
 * The room the storefront sits in.
 *
 * Ten blurred colour fields, fixed behind everything, drifting on long
 * out-of-phase loops. It is the only source of colour on the page: every
 * surface above it is white or near-black at some opacity, so what tints a
 * card is whatever happens to be behind that card. Two cards side by side are
 * never quite the same colour, and neither has a colour of its own.
 *
 * ── WHY THIS IS TEN DIVS AND NOT A CANVAS OR AN SVG ─────────────────────
 * A 64px CSS blur on a `border-radius: 50%` div is composited on the GPU and
 * animated by transform alone, which is the one animation a browser can run
 * without touching layout or paint. The same effect in canvas is a per-frame
 * redraw on the main thread; in SVG it is a `feGaussianBlur` that most engines
 * rasterise on the CPU. This version costs approximately nothing and survives
 * a laptop on battery.
 *
 * The positions are a fixed table rather than random, so the composition is
 * the same on every machine and on the server — there is nothing here that
 * could hydrate differently from what was rendered.
 */

import { useTheme } from "@/lib/use-theme";

/** Where each field sits and how far it wanders. Percentages of the viewport. */
const FIELDS: Array<[x: number, y: number, size: number]> = [
  [-8, -14, 560],
  [22, -16, 500],
  [54, -20, 560],
  [84, -12, 520],
  [-10, 28, 560],
  [34, 24, 600],
  [74, 34, 560],
  [-6, 68, 540],
  [40, 74, 560],
  [84, 80, 560],
];

/**
 * The two palettes, and they are not the same picture at two brightnesses.
 *
 * Light is a lilac-and-moss garden: it has to be colourful enough to be worth
 * having and pale enough that near-black text sits on it at full contrast.
 * Dark is a night sky, which means low-saturation blues and violets — the same
 * hues at the same saturation would glow through a dark panel and turn every
 * card into a lightbox.
 */
const PALETTE = {
  light: [
    "150,160,90",
    "178,190,88",
    "192,184,160",
    "196,178,236",
    "244,166,208",
    "248,160,80",
    "238,200,228",
    "196,178,236",
    "120,214,245",
    "242,120,204",
  ],
  dark: [
    "40,34,80",
    "36,70,90",
    "70,36,90",
    "36,44,110",
    "120,60,120",
    "200,110,90",
    "96,44,100",
    "36,54,120",
    "40,84,110",
    "78,36,104",
  ],
} as const;

export function Mesh() {
  const theme = useTheme();
  /*
   * `useTheme` already does the waiting.
   *
   * It answers "light" on the first render — never a read of the DOM, because
   * the server cannot do one — and corrects itself on the first commit. So the
   * server paints the light mesh, the browser swaps in the night palette if
   * that is what the reader asked for, and the `transition: --c` on `.blob`
   * turns that swap into a 1.2s crossfade rather than a flash. That transition
   * is the whole reason `@property --c` is declared in globals.css: without a
   * declared type the engine treats a custom property as a string and jumps.
   */
  const colours = PALETTE[theme === "dark" ? "dark" : "light"];

  return (
    <div className="mesh" aria-hidden="true">
      {FIELDS.map(([x, y, size], i) => (
        <span
          key={i}
          className="blob"
          style={
            {
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              // Out of phase on both axes and on period, so the ten never
              // line up into a single breathing motion.
              "--tx": `${((i % 3) - 1) * 40 + 20}px`,
              "--ty": `${(i % 2 ? -1 : 1) * 30}px`,
              "--d": `${20 + ((i * 7) % 12)}s`,
              "--c": `rgb(${colours[i]})`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
