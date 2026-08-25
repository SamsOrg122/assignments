"use client";

/**
 * The picture on the way in.
 *
 * Drawn rather than photographed, and the reasons are the same ones the
 * first version gave: this bundle is served under a strict `connect-src`,
 * the page is the first thing anybody sees so it cannot wait on a 400 KB
 * download, and a stock photograph of a forest is the most anonymous image
 * on the internet.
 *
 * What changed is how it is drawn. Flat triangles on a flat gradient read as
 * a vector illustration, which is exactly what somebody means when they ask
 * for a photograph instead. Four things carry the difference, and none of
 * them is more shapes:
 *
 *  - **Haze between the ranks.** Distance in a real photograph is not darker
 *    trees, it is more air in front of them. Each rank sits behind a band of
 *    fog, which is what makes the wood have depth rather than layers.
 *  - **Focus.** The far ranks are blurred and the near one is not, the way a
 *    lens behaves. One filter, applied to paths, so it costs nothing much.
 *  - **Bloom.** The light behind the treeline spills, and the trees against
 *    it lose their edges.
 *  - **Grain.** A tiled noise field over the whole thing at low opacity.
 *    Nothing says "rendered" like a perfectly clean gradient.
 *
 * And then there is the picture itself, `public/signin.webp`, which is not
 * drawn in the browser at all — it is a raster rendered once by
 * `scripts/render-door.mjs` and committed. Per-pixel fog, focus that falls
 * off with distance, something huge and out of focus in the very front and
 * grain over the lot are not things SVG can do at a price a login screen can
 * pay, and they are most of what separates a picture from a diagram.
 *
 * The drawn scene stays underneath it. It is what shows for the moment
 * before the image decodes, and what stays if the file is ever missing —
 * which is a real state, since the picture is one deletable file and this
 * page must never open as a black rectangle.
 *
 * To use a photograph of your own instead, drop it in `public/` and set
 * `NEXT_PUBLIC_SIGNIN_PHOTO` to its path.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** The rendered picture, or whatever the deployment would rather show. */
const PHOTO = process.env.NEXT_PUBLIC_SIGNIN_PHOTO || "/signin.webp";

/**
 * A ridgeline of crowns, with trunks.
 *
 * Seeded rather than random so the server and the browser draw the same
 * trees — `Math.random()` here is a hydration mismatch that logs on every
 * visit. Widths, heights and the gaps between them all vary, and neighbours
 * overlap: evenly spaced identical triangles read as a zigzag border rather
 * than as a wood.
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
    const w = 7 + rand() * 15;
    // `rand() * rand()` skews short: a wood is mostly ordinary trees with a
    // few tall ones, not a uniform spread of heights.
    const h = height * (0.5 + rand() * rand() * 1.15);
    const drift = Math.sin(x / 110 + seed) * height * 0.28;
    const foot = baseline + drift;
    const tip = foot - h;

    // A kink partway up one side. A fir is not a triangle, and the eye picks
    // up perfect symmetry immediately even when it cannot say why.
    const lean = (rand() - 0.5) * w * 0.35;
    points.push(
      `L${(x + w * 0.45).toFixed(1)} ${(foot - h * 0.42).toFixed(1)}`,
    );
    points.push(`L${(x + w + lean).toFixed(1)} ${tip.toFixed(1)}`);
    points.push(`L${(x + w * 1.6).toFixed(1)} ${(foot - h * 0.38).toFixed(1)}`);
    points.push(`L${(x + w * 2).toFixed(1)} ${foot.toFixed(1)}`);
    x += w * 1.45;
  }
  points.push("L420 640", "Z");
  return points.join(" ");
}

/**
 * Furthest away first, so nearer ranks paint over them.
 *
 * The fills barely differ — in mist, distance is carried by the haze in
 * front of a rank, not by painting the rank itself lighter. Doing both is
 * what makes a picture look like a diagram of a forest.
 */
const RANKS = [
  { seed: 7, baseline: 300, height: 26, fill: "#2b3038", blur: 2.4, haze: 0.5 },
  {
    seed: 23,
    baseline: 352,
    height: 36,
    fill: "#232830",
    blur: 1.5,
    haze: 0.38,
  },
  {
    seed: 61,
    baseline: 416,
    height: 50,
    fill: "#191d24",
    blur: 0.8,
    haze: 0.26,
  },
  {
    seed: 97,
    baseline: 496,
    height: 68,
    fill: "#101319",
    blur: 0.25,
    haze: 0.14,
  },
  {
    seed: 131,
    baseline: 596,
    height: 92,
    fill: "#080a0d",
    blur: 0.18,
    haze: 0,
  },
];

/**
 * Film grain, as a tiled SVG the browser rasterises once.
 *
 * A data URI rather than a PNG in `public/`: it is under a kilobyte, it
 * cannot 404, and it needs no build step. `overlay` rather than a flat
 * layer, so it darkens the highlights and lightens the shadows the way grain
 * in an emulsion does instead of fogging the whole frame grey.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.42'/%3E%3C/svg%3E\")";

export function Grove({ className }: { className?: string }) {
  const [photo, setPhoto] = useState<"waiting" | "there" | "gone">("waiting");
  const picture = useRef<HTMLImageElement>(null);

  /**
   * The load that already happened.
   *
   * `onLoad` only fires for a load React was attached in time to hear. A
   * cached image — which is every visit after the first — is decoded before
   * that, the event never comes, and the picture sits at zero opacity for
   * ever behind a drawing. So the element is asked directly, once.
   */
  useEffect(() => {
    const element = picture.current;
    if (!element?.complete) return;
    const settled = element.naturalWidth > 0 ? "there" : "gone";
    void Promise.resolve().then(() => setPhoto(settled));
  }, []);

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden bg-[#0b0d10]", className)}
    >
      {/* The drawn scene, always, underneath. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 640"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
      >
        <defs>
          <linearGradient id="grove-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1014" />
            <stop offset="30%" stopColor="#151a20" />
            <stop offset="52%" stopColor="#1d222a" />
            <stop offset="100%" stopColor="#07090b" />
          </linearGradient>

          {/* The light behind the ridge — low, warm, and the only warm
                thing in the picture, which is what makes it read as evening
                rather than as a grey shape. */}
          <radialGradient id="grove-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#e8bd74" stopOpacity="0.3" />
            <stop offset="40%" stopColor="#d3a25c" stopOpacity="0.11" />
            <stop offset="75%" stopColor="#b98d4e" stopOpacity="0.028" />
            <stop offset="100%" stopColor="#b98d4e" stopOpacity="0" />
          </radialGradient>

          {/* The hot centre of it. Small, and the reason the trees in front
                of it lose their edges. */}
          <radialGradient id="grove-core" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#f6dda9" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#f6dda9" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#f6dda9" stopOpacity="0" />
          </radialGradient>

          {/* Fog: thickest at the foot of a rank, gone by the tops. */}
          <linearGradient id="grove-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d4653" stopOpacity="0" />
            <stop offset="30%" stopColor="#3d4653" stopOpacity="0.3" />
            <stop offset="72%" stopColor="#3a4350" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#333b47" stopOpacity="0" />
          </linearGradient>

          {RANKS.filter((rank) => rank.blur > 0).map((rank) => (
            <filter
              key={rank.seed}
              id={`grove-soft-${rank.seed}`}
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
            >
              <feGaussianBlur stdDeviation={rank.blur} />
            </filter>
          ))}
        </defs>

        <rect width="400" height="640" fill="url(#grove-sky)" />

        {/* Ellipses, low, and much wider than they are tall. A circle of
              light halfway up the frame is an airbrushed blob; the sun going
              down behind a ridge spreads along the ridge. */}
        <ellipse cx="186" cy="322" rx="270" ry="128" fill="url(#grove-sun)" />
        <ellipse cx="186" cy="316" rx="118" ry="46" fill="url(#grove-core)" />

        {RANKS.map((rank, index) => (
          <g key={rank.seed}>
            <path
              d={ridge(rank.seed, rank.baseline, rank.height)}
              fill={rank.fill}
              filter={
                rank.blur > 0 ? `url(#grove-soft-${rank.seed})` : undefined
              }
            />
            {/* The air in front of this rank, before the next one is drawn
                  on top of it. This is the whole trick. */}
            {rank.haze > 0 && (
              <rect
                x="-20"
                y={rank.baseline - rank.height * 1.5}
                width="440"
                height={rank.height * 1.5 + 96}
                fill="url(#grove-haze)"
                opacity={rank.haze}
              />
            )}
            {/* A last breath of mist across the very front, low down. */}
            {index === RANKS.length - 1 && (
              <rect
                x="-20"
                y="540"
                width="440"
                height="110"
                fill="url(#grove-haze)"
                opacity="0.09"
              />
            )}
          </g>
        ))}
      </svg>

      {/*
       * The picture, over the drawing.
       *
       * It fades in rather than appearing, so the swap from the drawn scene
       * is a settling rather than a flash — and if it never arrives, the
       * drawing is simply what the door has, with nothing to explain.
       */}
      {photo !== "gone" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={picture}
          src={PHOTO}
          alt=""
          onLoad={() => setPhoto("there")}
          onError={() => setPhoto("gone")}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-700",
            photo === "there" ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* The picture has grain of its own, baked in at render. Laying the
          full overlay on top of it doubles the noise; the drawing needs all
          of it. */}
      <Grain strength={photo === "there" ? 0.09 : 0.26} />
      <Vignette />
      <Scrim />
    </div>
  );
}

/** The emulsion, over whatever is underneath — drawing or photograph. */
function Grain({ strength }: { strength: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 mix-blend-overlay"
      style={{
        opacity: strength,
        backgroundImage: GRAIN,
        backgroundSize: "140px 140px",
        transition: "opacity 700ms",
      }}
    />
  );
}

/** Corners fall off, the way a fast lens does. */
function Vignette() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(120% 90% at 46% 47%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.42) 100%)",
      }}
    />
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
