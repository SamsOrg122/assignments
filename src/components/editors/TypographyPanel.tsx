"use client";

/**
 * Continuous typographic control.
 *
 * Word gives you a dropdown of five line spacings. These are real numbers on
 * real sliders, with presets on top so nobody *has* to touch them — the
 * defaults are already well set. "Reading width" snaps the measure to 66
 * characters, the middle of the 60–75 band that reads best.
 */

import { useEffect, useRef } from "react";
import { useProjects } from "@/lib/store";
import { DEFAULT_TYPOGRAPHY, type Typography } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

interface Preset {
  name: string;
  hint: string;
  values: Typography;
}

const PRESETS: Preset[] = [
  {
    name: "Thesis",
    hint: "Serif, generous leading",
    values: {
      measure: 68,
      lineHeight: 1.8,
      letterSpacing: -0.003,
      fontSize: 18,
      family: "serif",
      margin: 72,
    },
  },
  {
    name: "Manuscript",
    hint: "Wide leading, large type",
    values: {
      measure: 62,
      lineHeight: 2,
      letterSpacing: 0,
      fontSize: 19,
      family: "serif",
      margin: 96,
    },
  },
  {
    name: "Product",
    hint: "Sans, tight and dense",
    values: {
      measure: 74,
      lineHeight: 1.65,
      letterSpacing: -0.006,
      fontSize: 15.5,
      family: "sans",
      margin: 48,
    },
  },
  {
    name: "Draft",
    hint: "Mono, for structure",
    values: {
      measure: 80,
      lineHeight: 1.7,
      letterSpacing: 0,
      fontSize: 14,
      family: "mono",
      margin: 40,
    },
  },
];

export function TypographyPanel({
  projectId,
  typography,
  onClose,
}: {
  projectId: string;
  typography: Typography;
  onClose: () => void;
}) {
  const setTypography = useProjects((s) => s.setTypography);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const set = (patch: Partial<Typography>) => setTypography(projectId, patch);

  const activePreset = PRESETS.find((p) =>
    (Object.keys(p.values) as Array<keyof Typography>).every(
      (k) => p.values[k] === typography[k],
    ),
  );

  return (
    <div
      ref={ref}
      className="anim-pop absolute top-full right-0 z-40 mt-1.5 w-[286px] rounded-md border border-line-strong bg-surface p-3 text-left shadow-[0_24px_70px_-12px_rgba(0,0,0,0.85)]"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="label-mono">Presets</span>
        <button
          type="button"
          onClick={() => set(DEFAULT_TYPOGRAPHY)}
          className="font-mono text-[10px] text-fg-subtle transition-colors hover:text-fg"
        >
          reset
        </button>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => set(p.values)}
            title={p.hint}
            className={cn(
              "rounded-sm border px-2 py-1.5 text-left transition-colors duration-150",
              activePreset?.name === p.name
                ? "border-accent bg-accent-soft"
                : "border-line hover:border-line-strong",
            )}
          >
            <span className="block text-[12px] text-fg">{p.name}</span>
            <span className="block truncate text-[10px] text-fg-subtle">
              {p.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-1">
        <span className="label-mono mr-auto">Face</span>
        {(["serif", "sans", "mono"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => set({ family: f })}
            aria-pressed={typography.family === f}
            className={cn(
              "rounded-xs px-1.5 py-1 text-[11px] transition-colors duration-150",
              typography.family === f
                ? "bg-surface-3 text-fg"
                : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <Slider
        label="Width"
        value={typography.measure}
        min={40}
        max={100}
        step={1}
        suffix="ch"
        onChange={(measure) => set({ measure })}
      />
      <Slider
        label="Leading"
        value={typography.lineHeight}
        min={1.2}
        max={2.4}
        step={0.02}
        onChange={(lineHeight) => set({ lineHeight })}
      />
      <Slider
        label="Tracking"
        value={typography.letterSpacing}
        min={-0.03}
        max={0.06}
        step={0.001}
        format={(v) => `${v > 0 ? "+" : ""}${(v * 1000).toFixed(0)}`}
        onChange={(letterSpacing) => set({ letterSpacing })}
      />
      <Slider
        label="Size"
        value={typography.fontSize}
        min={13}
        max={24}
        step={0.5}
        suffix="px"
        onChange={(fontSize) => set({ fontSize })}
      />
      <Slider
        label="Margin"
        value={typography.margin}
        min={16}
        max={160}
        step={4}
        suffix="px"
        onChange={(margin) => set({ margin })}
      />

      <button
        type="button"
        onClick={() => set({ measure: 66 })}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-sm border border-line py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
      >
        <Icon name="type" size={11} />
        Set reading width (66ch)
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="label-mono">{label}</span>
        <span className="font-mono text-[10px] text-fg-muted">
          {format ? format(value) : `${round(value)}${suffix}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
      />
    </label>
  );
}

const round = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
