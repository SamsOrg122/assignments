/**
 * Render the sign-in picture as a real raster image.
 *
 * Not an SVG. A vector forest reads as a vector forest however many
 * triangles it has, because everything in it has a hard edge, a flat fill
 * and no noise. What makes a picture read as a photograph is the opposite:
 * volumetric fog with structure in it, focus falling off with distance,
 * something huge and out of focus in the very front, light scattering, and
 * grain over the lot.
 *
 * All of that is per-pixel work, so it is done once, here, in a real browser
 * canvas, and the result is committed. The app ships an image, not a
 * renderer.
 *
 * Kept in the repository so `public/signin.webp` is reproducible rather than
 * a binary nobody can account for — change a number here, run it again, and
 * you get a different evening. It is not part of the build and nothing
 * imports it: Playwright is a development tool, not a dependency of this
 * app, so install it first if it is not already there.
 *
 *     npm i --no-save playwright
 *     node scripts/render-door.mjs /tmp/door.png
 *     convert /tmp/door.png public/signin.webp
 *
 * The seed is fixed, so running it unchanged gives the same picture back.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = process.argv[2];
const W = 1200;
const H = 1700;

// `PW_CHROMIUM` for a sandbox with the browser somewhere Playwright will not
// look on its own; otherwise Playwright finds its own.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await (await browser.newContext({ viewport: { width: 400, height: 400 } })).newPage();

const dataUrl = await page.evaluate(
  ({ W, H }) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    /* ── Seeded randomness, so re-running produces the same picture ──── */
    let seed = 20260825;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const between = (a, b) => a + rand() * (b - a);

    /* ── Value noise, for fog with structure in it ───────────────────── */
    const lattice = new Float32Array(256 * 256);
    for (let i = 0; i < lattice.length; i += 1) lattice[i] = rand();
    const smooth = (t) => t * t * (3 - 2 * t);
    const noise = (x, y) => {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = smooth(x - Math.floor(x));
      const yf = smooth(y - Math.floor(y));
      const at = (a, b) => lattice[(b & 255) * 256 + (a & 255)];
      const top = at(xi, yi) * (1 - xf) + at(xi + 1, yi) * xf;
      const bot = at(xi, yi + 1) * (1 - xf) + at(xi + 1, yi + 1) * xf;
      return top * (1 - yf) + bot * yf;
    };
    const fbm = (x, y, octaves) => {
      let sum = 0;
      let amp = 0.5;
      let f = 1;
      for (let o = 0; o < octaves; o += 1) {
        sum += noise(x * f, y * f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      return sum;
    };

    /* ── Sky ─────────────────────────────────────────────────────────── */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#080a0e");
    sky.addColorStop(0.16, "#10141a");
    sky.addColorStop(0.33, "#1a212a");
    sky.addColorStop(0.43, "#232b35");
    sky.addColorStop(0.62, "#12171d");
    sky.addColorStop(1, "#05070a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* The sun, going down behind the ridge. Wide and low. */
    const SUN_X = W * 0.44;
    const SUN_Y = H * 0.415;
    ctx.save();
    ctx.translate(SUN_X, SUN_Y);
    ctx.scale(2.6, 1);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.42);
    glow.addColorStop(0, "rgba(247,214,150,0.5)");
    glow.addColorStop(0.18, "rgba(226,175,104,0.26)");
    glow.addColorStop(0.45, "rgba(190,140,80,0.09)");
    glow.addColorStop(1, "rgba(160,118,66,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-W, -W * 0.42, W * 2, W * 0.84);
    ctx.restore();

    /* ── Trees ───────────────────────────────────────────────────────── */
    /**
     * One fir, drawn as overlapping tiers rather than a triangle.
     *
     * Tiers are what a conifer silhouette actually is, and they are also what
     * stops a hillside of these reading as a row of cones.
     */
    const fir = (x, footY, height, width, tone) => {
      ctx.fillStyle = tone;
      // Some trees are spires and some are squat. A rank whose members share
      // one proportion reads as a repeated asset.
      const slim = between(0.55, 1.5);
      width *= slim;
      height *= 1 / Math.sqrt(slim);
      // Trunk, only tall enough to show below the lowest tier.
      ctx.fillRect(x - width * 0.035, footY - height * 0.1, width * 0.07, height * 0.12);
      const tiers = 6 + Math.floor(rand() * 5);
      for (let t = 0; t < tiers; t += 1) {
        const up = t / tiers;
        const y = footY - height * (0.06 + up * 0.94);
        // Not monotonically narrowing: a branch two thirds up that reaches
        // further than the one below it is what stops the outline being a
        // clean triangle, and every real conifer has several.
        const w = width * (1 - up * 0.82) * between(0.62, 1.34);
        const h = height * between(0.2, 0.36);
        const lean = (rand() - 0.5) * width * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, y);
        ctx.lineTo(x + lean, y - h);
        ctx.lineTo(x + w * 0.5, y);
        ctx.closePath();
        ctx.fill();
      }
    };

    /** A wash of fog across a band, with noise in it rather than flat. */
    const fogBand = (rawTop, rawHeight, strength) => {
      // A band running past the bottom edge comes back from `getImageData`
      // as transparent black, and `putImageData` then paints that over the
      // picture — which is a black stripe across the foreground, not fog.
      const top = Math.max(0, Math.round(rawTop));
      const height = Math.min(Math.round(rawHeight), H - top);
      if (height <= 0) return;
      const image = ctx.getImageData(0, top, W, height);
      const data = image.data;
      for (let y = 0; y < height; y += 1) {
        /*
         * Zero at both ends of the band.
         *
         * The first version peaked low and then stopped dead at the bottom
         * edge, which drew a straight horizontal line across the picture at
         * every band boundary — the one thing no photograph of fog has.
         */
        const down = y / height;
        const profile = Math.sin(Math.min(1, down) * Math.PI) ** 0.75;
        for (let x = 0; x < W; x += 1) {
          const n = fbm(x / 260, (top + y) / 150, 4);
          const a = Math.max(0, Math.min(1, strength * profile * (0.35 + n * 1.25)));
          if (a <= 0.002) continue;

          // Fog near a light picks the light up. This is most of why a misty
          // photograph reads as warm at the horizon and cold everywhere else.
          const lit = Math.max(
            0,
            1 - Math.hypot((x - SUN_X) / (W * 0.75), (top + y - SUN_Y) / (H * 0.3)),
          );
          const r = 0x53 + lit * 0x46;
          const g = 0x5e + lit * 0x36;
          const b = 0x6d + lit * 0x0e;

          const i = (y * W + x) * 4;
          data[i] = data[i] * (1 - a) + r * a;
          data[i + 1] = data[i + 1] * (1 - a) + g * a;
          data[i + 2] = data[i + 2] * (1 - a) + b * a;
        }
      }
      ctx.putImageData(image, 0, top);
    };

    /**
     * Ranks, far to near.
     *
     * Sizes climb steeply and counts fall: distance is mostly carried by how
     * many trees fit across the frame, and a far rank that is merely a
     * smaller copy of the near one looks like a scale model.
     */
    const RANKS = [
      { footY: 0.44, tone: "#333c48", count: 90, h: [30, 62], w: [12, 24], blur: 11, fog: 0.52 },
      { footY: 0.5, tone: "#29323c", count: 100, h: [55, 120], w: [20, 40], blur: 6, fog: 0.44 },
      { footY: 0.575, tone: "#1f2731", count: 88, h: [110, 220], w: [36, 68], blur: 3.2, fog: 0.32 },
      { footY: 0.675, tone: "#141a22", count: 56, h: [200, 380], w: [58, 108], blur: 1.6, fog: 0.12 },
      { footY: 0.83, tone: "#090d12", count: 34, h: [330, 620], w: [92, 175], blur: 0.7, fog: 0.035 },
    ];

    for (const rank of RANKS) {
      ctx.save();
      ctx.filter = `blur(${rank.blur}px)`;
      const foot = H * rank.footY;
      for (let i = 0; i < rank.count; i += 1) {
        const x = between(-60, W + 60);
        // The ground is not a ruled line.
        const drift = (fbm(x / 340, rank.footY * 9, 3) - 0.5) * H * 0.035;
        fir(
          x,
          foot + drift,
          between(rank.h[0], rank.h[1]),
          between(rank.w[0], rank.w[1]),
          rank.tone,
        );
      }
      ctx.restore();
      fogBand(foot - H * 0.1, Math.round(H * 0.26), rank.fog);
    }

    /* ── Foreground, thrown out of focus ─────────────────────────────── */
    /*
     * The strongest cue there is. A photograph taken among trees has
     * something enormous and unreadable at the edge of the frame; a drawing
     * of a forest almost never does.
     */
    ctx.save();
    ctx.filter = "blur(34px)";
    ctx.fillStyle = "#04060a";
    /*
     * Tapered, and mostly outside the frame. A rectangle is a bar; a trunk
     * narrows as it rises and its edges are not parallel. Both of these sit
     * at the very edges, because a dark column through the middle of the
     * picture is a stripe rather than a tree.
     */
    for (const [base, lean] of [
      [-70, 34],
      [W + 46, -40],
    ]) {
      const foot = between(150, 210);
      const top = foot * between(0.55, 0.7);
      ctx.beginPath();
      ctx.moveTo(base - foot * 0.5, H + 40);
      ctx.lineTo(base + lean - top * 0.5, -40);
      ctx.lineTo(base + lean + top * 0.5, -40);
      ctx.lineTo(base + foot * 0.5, H + 40);
      ctx.closePath();
      ctx.fill();

      // A bough leaving it, thin enough to read as a branch.
      const reach = between(230, 380) * (base > W * 0.5 ? -1 : 1);
      const at = H * between(0.52, 0.68);
      ctx.beginPath();
      ctx.moveTo(base, at);
      ctx.lineTo(base + reach, at + between(40, 120));
      ctx.lineTo(base + reach * 0.92, at + between(120, 190));
      ctx.lineTo(base, at + between(150, 230));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /*
     * Undergrowth. Without it the bottom fifth is a flat dark field, which is
     * the one part of the frame a viewer reads as "nothing was drawn here".
     */
    ctx.save();
    ctx.filter = "blur(9px)";
    ctx.fillStyle = "#05080c";
    for (let i = 0; i < 420; i += 1) {
      const x = between(-40, W + 40);
      const y = H * between(0.84, 1.04);
      const h = between(50, 260);
      const w = between(8, 40);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, y);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * w, y - h * 0.6, x + (rand() - 0.5) * w * 2, y - h);
      ctx.lineTo(x + w * 0.5, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /* A last low breath of mist across the very front. */
    fogBand(H * 0.8, H * 0.2, 0.05);

    /* ── Grain, and a lens ───────────────────────────────────────────── */
    const frame = ctx.getImageData(0, 0, W, H);
    const px = frame.data;
    const cx = W / 2;
    const cy = H / 2;
    const far = Math.hypot(cx, cy);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;

        // Vignette: corners fall off the way a fast lens does.
        const r = Math.hypot(x - cx, y - cy) / far;
        const fall = 1 - 0.46 * Math.pow(Math.max(0, r - 0.32) / 0.68, 1.8);

        // Grain, slightly different per channel — emulsion, not TV static.
        const g = (rand() - 0.5) * 15;
        px[i] = Math.max(0, Math.min(255, px[i] * fall + g * 1.05));
        px[i + 1] = Math.max(0, Math.min(255, px[i + 1] * fall + g));
        px[i + 2] = Math.max(0, Math.min(255, px[i + 2] * fall + g * 1.12));
      }
    }
    ctx.putImageData(frame, 0, 0);

    return canvas.toDataURL("image/png");
  },
  { W, H },
);

writeFileSync(OUT, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log("wrote " + OUT);
