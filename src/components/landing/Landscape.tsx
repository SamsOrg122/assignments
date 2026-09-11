"use client";

/**
 * The hero: a lake, three ridges of pine, and a sun that becomes a moon.
 *
 * Every path in here is generated from a seeded pseudo-random sequence rather
 * than drawn by hand, and that is the only reason a landscape this detailed is
 * affordable. Fifty-odd trees, ten ridge segments and a reflection of all of
 * it would be a large SVG asset; as arithmetic it is about eighty lines and it
 * gzips to nothing because it is not in the payload at all.
 *
 * ── THE SEED IS NOT A DETAIL ────────────────────────────────────────────
 * `Math.random()` here would render one landscape on the server and a
 * different one in the browser, and React would report a hydration mismatch
 * and throw the server's markup away — the single most expensive thing a
 * marketing page can do to its own first paint. A Lehmer generator with a
 * fixed seed produces the same sequence everywhere, so this is a *drawing*
 * that happens to be written as code, not a random one.
 *
 * ── WHAT MOVES ─────────────────────────────────────────────────────────
 * Nothing, by itself, except the shimmer on the water and the stars. The
 * ridges move only when the page scrolls, at four different rates, and that
 * parallax is applied by the parent — see `Hero.tsx`. Layers are exposed by
 * `id` for exactly that reason.
 *
 * Colours are all tokens (`--hill-1`, `--tree`, `--sun`, `--stars`), declared
 * in globals.css beside the rest of the storefront palette, so day and night
 * are one variable swap and a designer can find every colour in the hero
 * without opening a React file.
 */

/** A Lehmer generator. Same seed, same landscape, on every machine. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const W = 1600;
/** Where the water starts. Everything above is land, everything below reflects. */
const WATERLINE = 560;

/**
 * A ridge line: three sines at rising frequency and falling amplitude.
 *
 * One sine is a hill; two is a landscape; three is a landscape with texture.
 * The ratios (1, 2.3, 5.1) are deliberately not whole multiples — harmonics
 * would line up into a repeating shape the eye reads as a pattern.
 */
function ridge(x: number, y0: number, amp: number, freq: number, phase: number): number {
  return (
    y0 +
    amp * Math.sin(x * freq + phase) +
    amp * 0.55 * Math.sin(x * freq * 2.3 + phase * 1.7) +
    amp * 0.25 * Math.sin(x * freq * 5.1 + phase)
  );
}

/** That ridge, closed into a filled shape down to the waterline. */
function hill(y0: number, amp: number, freq: number, phase: number): string {
  let d = `M0 ${WATERLINE + 10} L0 ${ridge(0, y0, amp, freq, phase).toFixed(1)}`;
  for (let x = 0; x <= W; x += 16)
    d += ` L${x} ${ridge(x, y0, amp, freq, phase).toFixed(1)}`;
  return `${d} L${W} ${WATERLINE + 10} Z`;
}

/** A conifer as three stacked triangles, widest at the bottom. */
function pine(x: number, base: number, height: number, width: number): string {
  let d = "";
  for (let i = 0; i < 3; i++) {
    const y = base - height * (i / 3) * 0.55;
    const h = height * (1 - i / 3) * 0.6 + height * 0.35;
    const w = width * (1 - i * 0.22);
    d += `M${(x - w).toFixed(1)} ${y.toFixed(1)} L${x} ${(y - h).toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)} Z `;
  }
  return d;
}

/** The near ridge's shape, needed twice: once as land, once upside down. */
const NEAR: [number, number, number, number] = [514, 16, 0.0072, 0.4];

/**
 * Built once at module load, not per render.
 *
 * The sequence is stateful, so calling this twice would produce two different
 * landscapes — and a component that re-renders on scroll would redraw the
 * forest on every frame. Computing it at module scope makes it a constant.
 */
const SCENE = (() => {
  const rnd = sequence(42);

  const stars = Array.from({ length: 46 }, () => ({
    cx: Math.round(rnd() * W),
    cy: Math.round(rnd() * 300),
    r: +(0.6 + rnd() * 1.3).toFixed(2),
    period: +(2 + rnd() * 3).toFixed(1),
    delay: +(-rnd() * 4).toFixed(1),
  }));

  // The treeline on the near ridge: one every nine pixels, jittered, so it
  // reads as a forest rather than as a comb.
  let treeline = "";
  for (let x = 0; x <= W; x += 9)
    treeline += pine(
      x + (rnd() - 0.5) * 4,
      ridge(x, ...NEAR) + 2,
      12 + rnd() * 24,
      4 + rnd() * 3,
    );

  // Nine tall pines in from each edge, framing the view. The first four on
  // each side are taller, so the frame closes toward the corners.
  let foreground = "";
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 26 + rnd() * 10;
    foreground += pine(x, WATERLINE + 30, 150 + rnd() * 140 + (i < 4 ? 60 : 0), 22 + rnd() * 14);
  }
  for (let i = 0; i < 9; i++) {
    const x = W - 20 - i * 26 - rnd() * 10;
    foreground += pine(x, WATERLINE + 30, 150 + rnd() * 140 + (i < 4 ? 60 : 0), 22 + rnd() * 14);
  }

  const shimmer = Array.from({ length: 14 }, () => {
    const y = WATERLINE + 12 + rnd() * 120;
    const x = 300 + rnd() * 1000;
    return {
      x1: +x.toFixed(0),
      x2: +(x + 30 + rnd() * 120).toFixed(0),
      y: +y.toFixed(0),
      period: +(3 + rnd() * 4).toFixed(1),
      delay: +(-rnd() * 6).toFixed(1),
    };
  });

  return {
    stars,
    shimmer,
    far: hill(430, 26, 0.0042, 1.2),
    mid: hill(468, 30, 0.0056, 2.6),
    near: hill(...NEAR),
    treeline,
    foreground,
  };
})();

export function Landscape() {
  return (
    <svg
      className="land"
      viewBox={`0 0 ${W} 700`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-top)" />
          <stop offset="1" stopColor="var(--sky-bottom)" />
        </linearGradient>
        <linearGradient id="tg-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--water-a)" />
          <stop offset="1" stopColor="var(--water-b)" />
        </linearGradient>
        {/* The reflection is the same shapes, flipped and blurred. A separate
            softer blur from the sun's, because a reflection that is as diffuse
            as a glow stops reading as a reflection. */}
        <filter id="tg-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="tg-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      {/*
        * The sky, first and behind everything.
        *
        * Without it the hero showed the mesh directly — ten blurred circles
        * behind a treeline, which reads as an out-of-focus photograph rather
        * than as a sky, and left the wordmark white on pale lilac at about
        * 1.4:1. The scene needs to be a scene.
        */}
      <rect x="0" y="0" width={W} height="700" fill="url(#tg-sky)" />

      {/* Stars carry `--stars` as an opacity multiplier, so they are present in
          the markup at all times and simply invisible by day. Rendering them
          conditionally would mean the sky pops in when the theme changes. */}
      <g id="tg-stars">
        {SCENE.stars.map((s, i) => (
          <circle
            key={i}
            className="star"
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            style={{ "--t": `${s.period}s`, animationDelay: `${s.delay}s` } as React.CSSProperties}
          />
        ))}
      </g>

      {/*
        * A sun by day and a moon by night, and the difference is the edge.
        *
        * The first version was one white disc with a white glow in both
        * themes, and by day that is a hole punched in a pale sky: the disc is
        * the same value as what is behind it, so all anybody sees is the ring
        * where the glow stops. So the radius and the glow's colour are tokens.
        * Light gets a small disc inside a warm amber glow — the sun is too
        * bright to have an outline. Dark gets a full disc and a cool halo,
        * because a moon is exactly an outline.
        */}
      <g id="tg-sun">
        <circle cx="900" cy="430" r="64" fill="var(--sun-glow)" filter="url(#tg-glow)" />
        {/* The bright core, both themes. */}
        <circle cx="900" cy="430" r="12" fill="var(--sun)" />
        {/*
          * The moon's disc, faded in by `--moon` rather than sized by a
          * variable — and that is not a stylistic preference. `r` looks like
          * it takes `var(--sun-r)` and does not: as a presentation attribute
          * it must be a number, and as a CSS geometry property Firefox does
          * not implement it. The first version of this was silently `r: 0` in
          * every browser, which by day was the effect wanted and by night
          * meant a moon with no moon in it. Opacity is a property every engine
          * animates on every element.
          */}
        <circle cx="900" cy="430" r="26" fill="var(--sun)" opacity="var(--moon)" />
      </g>

      <g id="tg-far">
        <path d={SCENE.far} fill="var(--hill-1)" />
      </g>
      <g id="tg-mid">
        <path d={SCENE.mid} fill="var(--hill-2)" />
      </g>
      <g id="tg-near">
        <path d={SCENE.near} fill="var(--hill-3)" />
        <path d={SCENE.treeline} fill="var(--tree)" />
      </g>
      <g id="tg-fg">
        <path d={SCENE.foreground} fill="var(--tree)" />
      </g>

      <rect x="0" y={WATERLINE} width={W} height={700 - WATERLINE} fill="url(#tg-water)" />

      <g
        transform={`translate(0 ${WATERLINE * 2}) scale(1 -1)`}
        opacity="0.28"
        filter="url(#tg-soft)"
      >
        <path d={SCENE.near} fill="var(--hill-3)" />
        <path d={SCENE.treeline} fill="var(--tree)" />
        <path d={SCENE.foreground} fill="var(--tree)" />
        <circle cx="900" cy="430" r="26" fill="var(--sun)" opacity="0.6" />
      </g>

      {SCENE.shimmer.map((s, i) => (
        <line
          key={i}
          className="shimmer"
          x1={s.x1}
          x2={s.x2}
          y1={s.y}
          y2={s.y}
          style={{ "--t": `${s.period}s`, animationDelay: `${s.delay}s` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
