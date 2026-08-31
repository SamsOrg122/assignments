"use client";

/**
 * Document setting.
 *
 * A preset picker with real specimens on top — each thumbnail is drawn with
 * that preset's own face, measure and leading, so you choose a look you can
 * see rather than a word you have to imagine. Everything below is optional:
 * the presets are complete settings, and the sliders are there for the person
 * who wants the last five per cent.
 *
 * Word gives you a dropdown of five line spacings. These are real numbers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { useKit, type KitFont } from "@/lib/kit";
import { DEFAULT_TYPOGRAPHY, type Paper, type Typography } from "@/lib/types";
import { DOC_PRESETS, matchPreset, type DocPreset } from "@/lib/doc-presets";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const FACE_STACK: Record<Typography["family"], string> = {
  serif:
    '"Iowan Old Style", Palatino, Charter, Georgia, "Times New Roman", serif',
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
};

const PAPERS: Array<{ id: Paper; label: string; swatch: string; ink: string }> = [
  { id: "canvas", label: "App", swatch: "#1a1a1e", ink: "#f2f2f5" },
  { id: "sheet", label: "White", swatch: "#f7f7f5", ink: "#17171a" },
  { id: "warm", label: "Warm", swatch: "#f6f1e7", ink: "#1c1a15" },
  { id: "night", label: "Night", swatch: "#0c0c0f", ink: "#e9e9ee" },
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
  // Faces brought in through the kit sit beside the three built-ins rather
  // than in a separate panel: choosing a face is one decision.
  //
  // Selected whole and filtered here: zustand compares snapshots by identity,
  // so filtering *inside* the selector would hand React a new array on every
  // render and spin.
  const assets = useKit((s) => s.assets);
  const kitFonts = useMemo(
    () => assets.filter((a): a is KitFont => a.kind === "font"),
    [assets],
  );
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState(false);

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
  const active = matchPreset(typography);
  const t = { ...DEFAULT_TYPOGRAPHY, ...typography };

  return (
    <div
      ref={ref}
      className="anim-pop absolute top-full right-0 z-40 mt-1.5 max-h-[min(78vh,680px)] w-[320px] overflow-y-auto rounded-md border border-line-strong bg-surface p-3 text-left shadow-[0_24px_70px_-12px_rgba(0,0,0,0.85)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-meta text-fg-subtle">Setting</span>
        <button
          type="button"
          onClick={() => set(DEFAULT_TYPOGRAPHY)}
          className="text-[11px] text-fg-subtle transition-colors hover:text-fg"
        >
          Reset
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {DOC_PRESETS.map((p) => (
          <PresetSwatch
            key={p.id}
            preset={p}
            active={active?.id === p.id}
            onPick={() => set(p.values)}
          />
        ))}
      </div>

      <Field label="Paper">
        <div className="flex gap-1">
          {PAPERS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              aria-label={`${p.label} paper`}
              aria-pressed={(t.paper ?? "canvas") === p.id}
              onClick={() => set({ paper: p.id })}
              className={cn(
                "grid h-7 flex-1 place-items-center rounded-sm border text-[10px] transition-colors duration-150",
                (t.paper ?? "canvas") === p.id
                  ? "border-accent"
                  : "border-line hover:border-line-strong",
              )}
              style={{ background: p.swatch, color: p.ink }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Face">
        <Segmented
          value={t.fontFamily ? "" : t.family}
          options={[
            ["serif", "Serif"],
            ["sans", "Sans"],
            ["mono", "Mono"],
          ]}
          onChange={(family) =>
            // Choosing a built-in face clears a kit font — otherwise the
            // choice would appear to do nothing, because the kit font wins.
            set({ family: family as Typography["family"], fontFamily: undefined })
          }
        />
      </Field>

      {kitFonts.length > 0 && (
        <Field label="Your fonts">
          <div className="flex flex-wrap gap-1">
            {kitFonts.map((font) => (
              <button
                key={font.id}
                type="button"
                aria-pressed={t.fontFamily === font.family}
                onClick={() =>
                  set({
                    fontFamily:
                      t.fontFamily === font.family ? undefined : font.family,
                  })
                }
                style={{ fontFamily: `"${font.family}"` }}
                className={cn(
                  "rounded-sm border px-2 py-1 text-[12px] transition-colors duration-150",
                  t.fontFamily === font.family
                    ? "border-accent text-fg"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {font.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Paragraphs">
        <Segmented
          value={t.firstLineIndent ? "indent" : "space"}
          options={[
            ["space", "Spaced"],
            ["indent", "Indented"],
          ]}
          onChange={(v) =>
            // The two are alternatives, not additions — doing both reads as a
            // mistake, so choosing one clears the other.
            set(
              v === "indent"
                ? { firstLineIndent: true, paragraphSpacing: 0 }
                : { firstLineIndent: false, paragraphSpacing: 0.85 },
            )
          }
        />
      </Field>

      <Field label="Alignment">
        <Segmented
          value={t.align ?? "left"}
          options={[
            ["left", "Ragged"],
            ["justify", "Justified"],
          ]}
          onChange={(v) =>
            // Justified without hyphenation opens rivers of white space, so
            // turning it on brings hyphenation with it.
            set(
              v === "justify"
                ? { align: "justify", hyphenate: true }
                : { align: "left" },
            )
          }
        />
      </Field>

      <button
        type="button"
        onClick={() => setDetail((v) => !v)}
        aria-expanded={detail}
        className="mt-1 flex w-full items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
      >
        <Icon
          name="chevron-right"
          size={11}
          className={cn(
            "transition-transform duration-150",
            detail && "rotate-90",
          )}
        />
        Fine-tune
      </button>

      {detail && (
        <div className="anim-slide-up mt-3 border-t border-line pt-3">
          <Slider
            label="Width"
            value={t.measure}
            min={40}
            max={100}
            step={1}
            suffix="ch"
            onChange={(measure) => set({ measure })}
          />
          <Slider
            label="Leading"
            value={t.lineHeight}
            min={1.2}
            max={2.4}
            step={0.02}
            onChange={(lineHeight) => set({ lineHeight })}
          />
          <Slider
            label="Tracking"
            value={t.letterSpacing}
            min={-0.03}
            max={0.06}
            step={0.001}
            format={(v) => `${v > 0 ? "+" : ""}${(v * 1000).toFixed(0)}`}
            onChange={(letterSpacing) => set({ letterSpacing })}
          />
          <Slider
            label="Size"
            value={t.fontSize}
            min={13}
            max={24}
            step={0.5}
            suffix="px"
            onChange={(fontSize) => set({ fontSize })}
          />
          <Slider
            label="Headings"
            value={t.headingScale ?? 1}
            min={0.8}
            max={1.35}
            step={0.01}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(headingScale) => set({ headingScale })}
          />
          <Slider
            label="Paragraph gap"
            value={t.paragraphSpacing ?? 0.85}
            min={0}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)}em`}
            onChange={(paragraphSpacing) => set({ paragraphSpacing })}
          />
          <Slider
            label="Margin"
            value={t.margin}
            min={16}
            max={160}
            step={4}
            suffix="px"
            onChange={(margin) => set({ margin })}
          />

          <label className="mt-1 flex items-center justify-between">
            <span className="text-[11.5px] text-fg-muted">Hyphenate</span>
            <Toggle
              on={t.hyphenate === true}
              onChange={(hyphenate) => set({ hyphenate })}
              label="Hyphenate"
            />
          </label>

          <button
            type="button"
            onClick={() => set({ measure: 66 })}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-sm border border-line py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="type" size={11} />
            Set reading width (66ch)
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

/** A real specimen: three lines set the way the preset would set them. */
function PresetSwatch({
  preset,
  active,
  onPick,
}: {
  preset: DocPreset;
  active: boolean;
  onPick: () => void;
}) {
  const v = preset.values;
  const paper = PAPERS.find((p) => p.id === (v.paper ?? "canvas")) ?? PAPERS[0];

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      title={preset.hint}
      className={cn(
        "overflow-hidden rounded-sm border text-left transition-colors duration-150",
        active ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      <span
        className="block h-[52px] overflow-hidden px-2 pt-2"
        style={{ background: paper.swatch }}
      >
        <span
          className="block"
          style={{
            color: paper.ink,
            fontFamily: FACE_STACK[v.family],
            fontSize: "6px",
            lineHeight: v.lineHeight,
            letterSpacing: `${v.letterSpacing}em`,
            textAlign: v.align === "justify" ? "justify" : "left",
            textIndent: v.firstLineIndent ? "1.4em" : 0,
          }}
        >
          Interfaces have grown denser while the attention available to read
          them has not, and the cost of that is rarely measured.
        </span>
      </span>
      <span className="block px-1.5 py-1">
        <span className="block text-[11px] text-fg">{preset.name}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <span className="text-meta text-fg-subtle mb-1 block">{label}</span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex w-full gap-0.5 rounded-sm border border-line p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "flex-1 rounded-xs px-2 py-1 text-[11px] transition-colors duration-150",
            value === key
              ? "bg-surface-3 text-fg"
              : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-150",
        on ? "border-accent bg-accent/30" : "border-line bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-3 rounded-full transition-all duration-150",
          on ? "left-[15px] bg-accent" : "left-[2px] bg-fg-subtle",
        )}
      />
    </button>
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
        <span className="text-[11.5px] text-fg-muted">{label}</span>
        <span className="font-mono text-[10px] text-fg-subtle">
          {format ? format(value) : `${round(value)}${suffix}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
      />
    </label>
  );
}

const round = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
