/**
 * Crafted product mock-ups.
 *
 * Hand-built in the app's own design language rather than screenshotted: a
 * screenshot goes stale the day the product moves, and at these sizes real
 * mark-up is sharper than any raster. All of it is decorative — `aria-hidden`
 * throughout, with the meaning carried by the surrounding copy.
 */

import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/* ── Library ────────────────────────────────────────────── */

const LIBRARY_ROWS: Array<{
  icon: IconName;
  name: string;
  meta: string;
  kind: string;
}> = [
  { icon: "text", name: "Attention & Interface Density", meta: "8,412 words · 6 sections", kind: "Thesis" },
  { icon: "board", name: "Thinking — thesis structure", meta: "24 items", kind: "Board" },
  { icon: "slides", name: "Sparse — pitch", meta: "11 slides", kind: "Deck" },
  { icon: "text", name: "Orbit — Q3 review", meta: "1,204 words", kind: "Doc" },
  { icon: "code", name: "Atlas — design system", meta: "4 files", kind: "Code" },
];

export function LibraryMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Icon name="search" size={12} className="text-fg-subtle" />
        <span className="text-[12px] text-fg-subtle">Search…</span>
        <span className="ml-auto flex gap-1">
          {["All", "Thesis", "Deck", "Board"].map((f, i) => (
            <span
              key={f}
              className={cn(
                "rounded-xs px-1.5 py-0.5 text-[10.5px]",
                i === 0 ? "bg-surface-3 text-fg" : "text-fg-subtle",
              )}
            >
              {f}
            </span>
          ))}
        </span>
      </div>
      <ul className="px-1.5 py-1.5">
        {LIBRARY_ROWS.map((r, i) => (
          <li
            key={r.name}
            className={cn(
              "flex items-center gap-3 rounded-sm px-2 py-2",
              i === 0 && "bg-white/[0.045]",
            )}
          >
            <Icon name={r.icon} size={12} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-fg">{r.name}</span>
              <span className="block truncate text-[10.5px] text-fg-subtle">
                {r.meta}
              </span>
            </span>
            <span className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle">
              {r.kind}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Board ──────────────────────────────────────────────── */

export function BoardMock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative size-full overflow-hidden select-none", className)}
    >
      <div className="grid-faint absolute inset-0 opacity-70" />

      {/* Sticky cluster */}
      <span className="absolute top-[13%] left-[7%] w-[34%] rotate-[-1.4deg] rounded-sm border border-line bg-[#26261c] px-2.5 py-2 text-[10.5px] leading-snug text-[#e8e3c9] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.9)]">
        Density has a cost — measure it
      </span>
      <span className="absolute top-[36%] left-[13%] w-[30%] rotate-[1.1deg] rounded-sm border border-line bg-[#1b2620] px-2.5 py-2 text-[10.5px] leading-snug text-[#cfe7da] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.9)]">
        Two graduate programmes
      </span>
      <span className="absolute top-[62%] left-[9%] w-[26%] rounded-sm border border-line bg-surface-2 px-2.5 py-2 text-[10.5px] leading-snug text-fg-muted">
        Method → results
      </span>

      {/* Live project card — the bridge */}
      <span className="absolute top-[20%] right-[6%] w-[38%] overflow-hidden rounded-md border border-line bg-surface shadow-[0_18px_46px_-20px_rgba(0,0,0,0.95)]">
        <span className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
          <Icon name="text" size={9} className="text-fg-subtle" />
          <span className="text-[9.5px] text-fg-subtle">Thesis</span>
          <span className="ml-auto flex items-center gap-1 text-[8.5px] text-accent">
            <span className="size-1 rounded-full bg-accent" />
            live
          </span>
        </span>
        <span className="block px-2 py-2">
          <span className="block truncate text-[11px] font-medium text-fg">
            Attention & Interface Density
          </span>
          <span className="mt-1 block text-[9.5px] leading-relaxed text-fg-muted">
            Interfaces have grown denser while the attention available to read
            them has not…
          </span>
        </span>
      </span>

      {/* A peer, mid-thought. Sits below the card's footprint so the two never
          collide when this mock is rendered into a narrow column. */}
      <span className="absolute top-[76%] right-[30%] flex items-center gap-1">
        <svg width="12" height="14" viewBox="0 0 12 14" className="text-[#f0a05a]">
          <path
            d="M1 1l9.5 5.6-4.2.9L4 12.4z"
            fill="currentColor"
            stroke="#0e0e11"
            strokeWidth="0.8"
          />
        </svg>
        <span className="rounded-xs bg-[#f0a05a] px-1 py-0.5 text-[8.5px] font-medium text-[#241403]">
          Mira
        </span>
      </span>
    </div>
  );
}

/* ── Inline AI ──────────────────────────────────────────── */

export function InlineAIMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      <p className="text-[12.5px] leading-relaxed text-fg-muted">
        Conclusions stay within the sampled population —{" "}
        <span className="rounded-xs bg-accent-soft px-0.5 text-fg">
          two graduate programmes at one university
        </span>{" "}
        — and are not generalised further.
      </p>

      <div className="glass mt-3 rounded-md p-2.5">
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={11} className="text-accent" />
          <span className="text-[11.5px] text-fg-muted">
            Does this line up with my research question?
          </span>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-fg">
          It does. Your question asks about density{" "}
          <em className="text-fg-subtle">within</em> a programme, so the narrower
          claim is the honest one — and section 4 already assumes it.
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="rounded-xs bg-accent px-2 py-1 text-[10.5px] font-medium text-on-accent">
            Accept
          </span>
          <span className="rounded-xs border border-line px-2 py-1 text-[10.5px] text-fg-muted">
            Discard
          </span>
          <span className="ml-auto text-[10px] text-fg-subtle">
            reading 6 sections
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Speak-to-prose ─────────────────────────────────────── */

/** Deterministic pseudo-waveform — a random one would break hydration. */
const BARS = [
  4, 9, 14, 8, 17, 22, 13, 7, 11, 19, 26, 16, 9, 5, 12, 20, 24, 15, 8, 6, 10,
  18, 23, 14, 7, 4, 9, 13, 8, 5,
];

export function SpeakMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      <div className="flex h-8 items-end gap-[2px]">
        {BARS.map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-accent/50"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-fg-subtle">
        um so basically the the thing is that density kind of costs you
        attention you know and nobody really measures that
      </p>

      <div className="my-2.5 flex items-center gap-2">
        <span className="h-px flex-1 bg-line" />
        <Icon name="arrow-right" size={11} className="text-accent" />
        <span className="h-px flex-1 bg-line" />
      </div>

      <p className="text-[12.5px] leading-relaxed text-fg">
        Density costs attention, and that cost is rarely measured.
      </p>
    </div>
  );
}

/* ── Typography ─────────────────────────────────────────── */

export function TypographyMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      <p
        className="text-[15px] leading-[1.75] text-fg"
        style={{
          fontFamily:
            '"Iowan Old Style", Palatino, Charter, Georgia, "Times New Roman", serif',
          letterSpacing: "-0.003em",
        }}
      >
        Interfaces have grown denser while the attention available to read them
        has not.
      </p>
      <div className="mt-3.5 space-y-2">
        {[
          ["Measure", "68 characters", 0.68],
          ["Line height", "1.75", 0.55],
          ["Size", "17 px", 0.42],
        ].map(([label, value, fill]) => (
          <div key={label as string} className="flex items-center gap-2.5">
            <span className="w-[74px] shrink-0 text-[10.5px] text-fg-subtle">
              {label}
            </span>
            <span className="relative h-[3px] flex-1 rounded-full bg-line">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${(fill as number) * 100}%` }}
              />
              <span
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
                style={{ left: `${(fill as number) * 100}%` }}
              />
            </span>
            <span className="w-[82px] shrink-0 text-right font-mono text-[10px] text-fg-muted">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Thesis → deck ──────────────────────────────────────── */

export function DeckMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {[
            ["1 — Introduction", true],
            ["2 — Method", false],
            ["3 — Results", false],
            ["4 — Discussion", false],
          ].map(([label, active]) => (
            <div
              key={label as string}
              className={cn(
                "rounded-xs border px-2 py-1.5 text-[10.5px]",
                active
                  ? "border-line-strong bg-white/[0.04] text-fg"
                  : "border-line text-fg-subtle",
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center">
          <Icon name="arrow-right" size={13} className="text-accent" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xs border border-line bg-[#faf8f4] px-2 py-1.5"
            >
              <span
                className="block truncate text-[9px] font-semibold text-[#1b1a17]"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {["Density has a cost", "What we measured", "What changed"][i]}
              </span>
              <span className="mt-1 block h-px w-4 bg-[#b4531f]" />
              <span className="mt-1 block text-[7.5px] text-[#5f5c55]">
                {["Two programmes, 12 weeks", "Time to first fixation", "Reading speed, −14%"][i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Ambient fallbacks ──────────────────────────────────── */

/**
 * Stands in for `hero-ambient` until a generated asset fills that slot: layered
 * conic and radial washes, which is what a photograph of edge-lit glass would
 * have given us anyway.
 */
export function AmbientFallback({ className }: { className?: string }) {
  // No `relative` of its own — `cn` is a plain join and Tailwind emits
  // `relative` after `absolute`, so hardcoding it here would override a
  // caller's `absolute inset-0` and collapse this to zero height.
  return (
    <div aria-hidden="true" className={cn("overflow-hidden", className)}>
      <div className="aurora" />
      <div className="grid-faint absolute inset-0" />
    </div>
  );
}

/**
 * Crafted stand-in for `impact-forest`: four ridgelines of conifer silhouettes
 * receding into fog. Drawn rather than photographed, so it holds up at any
 * width and never looks like stock.
 */
export function ForestFallback({ className }: { className?: string }) {
  // Deterministic pseudo-random — a seeded walk, so the ridgeline looks
  // natural but renders identically on the server and the client.
  const ridge = (seed: number, baseline: number, height: number) => {
    let n = seed;
    const rand = () => {
      n = (n * 1103515245 + 12345) % 2147483648;
      return n / 2147483648;
    };
    const points: string[] = [`M-10 200`, `L-10 ${baseline}`];
    let x = -10;
    while (x < 410) {
      // Vary both the width and the height of each crown, and let neighbours
      // overlap. Evenly spaced identical triangles read as a zigzag border,
      // not as a treeline.
      const w = 4 + rand() * 9;
      const h = height * (0.4 + rand() * rand() * 1.5);
      // A slow undulation so the ridge itself rises and falls.
      const drift = Math.sin(x / 90 + seed) * height * 0.3;
      const foot = baseline + drift;
      points.push(`L${(x + w).toFixed(1)} ${(foot - h).toFixed(1)}`);
      points.push(`L${(x + w * 2).toFixed(1)} ${foot.toFixed(1)}`);
      x += w * 1.55;
    }
    points.push(`L410 200`, "Z");
    return points.join(" ");
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 200"
      preserveAspectRatio="none"
      className={cn("size-full", className)}
    >
      <defs>
        <linearGradient id="forest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e0e11" />
          <stop offset="55%" stopColor="#14181c" />
          <stop offset="100%" stopColor="#0e1114" />
        </linearGradient>
        <radialGradient id="forest-dawn" cx="72%" cy="58%" r="46%">
          <stop offset="0%" stopColor="#5c7f8f" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5c7f8f" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="200" fill="url(#forest-sky)" />
      <rect width="400" height="200" fill="url(#forest-dawn)" />

      {/* Far to near: each ridge darker and taller, fog between them. */}
      <path d={ridge(7, 150, 16)} fill="#26333a" opacity="0.5" />
      <path d={ridge(31, 166, 22)} fill="#1c262c" opacity="0.7" />
      <path d={ridge(53, 184, 28)} fill="#141b20" opacity="0.85" />
      <path d={ridge(97, 205, 34)} fill="#0d1215" />
    </svg>
  );
}

/** Crafted stand-in for `impact-canopy` — a sapling, drawn. */
export function SaplingFallback({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 150"
      className={cn("size-full", className)}
    >
      <defs>
        <radialGradient id="sapling-glow" cx="50%" cy="42%" r="52%">
          <stop offset="0%" stopColor="var(--color-leaf)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-leaf)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sapling-stem" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--color-fg-subtle)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-leaf)" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <rect width="200" height="150" fill="url(#sapling-glow)" />

      {/* Ground line */}
      <path
        d="M42 116h116"
        stroke="var(--color-line-strong)"
        strokeWidth="1"
        strokeDasharray="2 4"
      />

      {/* Stem and two leaves */}
      <path
        d="M100 116V62"
        stroke="url(#sapling-stem)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M100 82c-16 0-26-8-28-20 14-3 25 5 28 20Z"
        fill="var(--color-leaf)"
        fillOpacity="0.55"
      />
      <path
        d="M100 72c14-2 23-11 23-23-13-1-22 8-23 23Z"
        fill="var(--color-leaf)"
        fillOpacity="0.8"
      />
      <circle cx="100" cy="60" r="2.4" fill="var(--color-leaf)" />
    </svg>
  );
}
