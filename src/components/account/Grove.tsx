"use client";

/**
 * The trees, on the way in.
 *
 * Drawn rather than photographed, and that is a decision rather than a
 * shortfall. This bundle is served under a strict `connect-src`, the page is
 * the first thing anybody sees so it cannot wait on a 400 KB download, and a
 * stock photograph of a forest is the single most anonymous image on the
 * internet. The app already owns a forest — the impact section on the
 * landing page is built from the same seeded ridgelines — so the door wears
 * the house's own picture.
 *
 * If a real photograph is wanted later, drop it in `public/` and give
 * `PHOTO` its path; everything else here stays as the fallback for the
 * moment before it loads.
 */

import { cn } from "@/lib/cn";

/** A path under `public/`, or empty to use the drawn grove. */
const PHOTO = "";

/**
 * A ridgeline of crowns.
 *
 * Seeded rather than random so the server and the browser draw the same
 * trees — a `Math.random()` here is a hydration mismatch that logs an error
 * on every visit. Widths and heights both vary and neighbours overlap:
 * evenly spaced identical triangles read as a zigzag border, not as a wood.
 */
function ridge(seed: number, baseline: number, height: number): string {
  let n = seed;
  const rand = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };

  const points = ["M-20 640", `L-20 ${baseline}`];
  let x = -20;
  while (x < 420) {
    // Crowns wide enough to be trees. The first version used a width of 4–13
    // against a 400-unit box that then got scaled to cover a tall panel, and
    // a narrow triangle stretched vertically is a sawtooth, not a fir.
    const w = 7 + rand() * 15;
    const h = height * (0.5 + rand() * rand() * 1.1);
    const drift = Math.sin(x / 110 + seed) * height * 0.28;
    const foot = baseline + drift;
    points.push(`L${(x + w).toFixed(1)} ${(foot - h).toFixed(1)}`);
    points.push(`L${(x + w * 2).toFixed(1)} ${foot.toFixed(1)}`);
    x += w * 1.5;
  }
  points.push("L420 640", "Z");
  return points.join(" ");
}

/** Furthest away first, so nearer ranks paint over them. */
const RANKS = [
  { seed: 7, baseline: 322, height: 30, fill: "#242830" },
  { seed: 23, baseline: 372, height: 40, fill: "#1b1f26" },
  { seed: 61, baseline: 438, height: 54, fill: "#13161b" },
  { seed: 97, baseline: 528, height: 74, fill: "#0c0e11" },
];

export function Grove({ className }: { className?: string }) {
  if (PHOTO)
    return (
      <div className={cn("absolute inset-0 overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO} alt="" className="size-full object-cover" />
        <Scrim />
      </div>
    );

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 640"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
      >
        <defs>
          <linearGradient id="grove-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111316" />
            <stop offset="46%" stopColor="#191d21" />
            <stop offset="100%" stopColor="#0b0d0f" />
          </linearGradient>
          {/* The light behind the ridge — low, warm, and the only warm thing
              in the picture, which is what makes it read as evening rather
              than as a grey shape. */}
          <radialGradient id="grove-sun" cx="0.5" cy="0.5" r="0.4">
            <stop offset="0%" stopColor="#d9b168" stopOpacity="0.3" />
            <stop offset="60%" stopColor="#d9b168" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#d9b168" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="640" fill="url(#grove-sky)" />
        <rect width="400" height="640" fill="url(#grove-sun)" />

        {RANKS.map((rank) => (
          <path key={rank.seed} d={ridge(rank.seed, rank.baseline, rank.height)} fill={rank.fill} />
        ))}
      </svg>
      <Scrim />
    </div>
  );
}

/**
 * Ink behind the words.
 *
 * The wordmark sits top-left and the copyright bottom-left, and both have to
 * stay legible over whatever the picture is doing underneath — including a
 * photograph nobody has chosen yet.
 */
function Scrim() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 26%, rgba(0,0,0,0.1) 62%, rgba(0,0,0,0.66) 100%)",
      }}
    />
  );
}
