"use client";

/**
 * Deck styling.
 *
 * A theme picker with live thumbnails rather than a colour/font/size surface —
 * you choose a look that's already set, and the fine controls underneath only
 * adjust things that can't make it ugly.
 */

import { useEffect, useRef } from "react";
import {
  DECK_ACCENTS,
  DECK_THEMES,
  DECK_THEME_ORDER,
  deckVars,
} from "@/lib/deck-themes";
import { DEFAULT_DECK_STYLE, type DeckStyle, type DeckThemeName } from "@/lib/types";
import { cn } from "@/lib/cn";

export function DeckStylePanel({
  style,
  onChange,
  onClose,
}: {
  style: DeckStyle;
  onChange: (patch: Partial<DeckStyle>) => void;
  onClose: () => void;
}) {
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

  return (
    <div
      ref={ref}
      className="anim-pop absolute top-full right-0 z-40 mt-1.5 w-[300px] rounded-md border border-line-strong bg-surface p-3 text-left shadow-[0_24px_70px_-12px_rgba(0,0,0,0.6)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono">Theme</span>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_DECK_STYLE)}
          className="text-[11px] text-fg-subtle transition-colors hover:text-fg"
        >
          Reset
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {DECK_THEME_ORDER.map((name) => (
          <ThemeSwatch
            key={name}
            name={name}
            active={style.theme === name}
            onPick={() => onChange({ theme: name })}
          />
        ))}
      </div>

      <Control label="Accent">
        <div className="flex gap-1">
          {DECK_ACCENTS.map((a) => {
            const on = (style.accent ?? "") === a.value;
            return (
              <button
                key={a.id}
                type="button"
                title={a.label}
                aria-label={`${a.label} accent`}
                aria-pressed={on}
                onClick={() => onChange({ accent: a.value || undefined })}
                className={cn(
                  "grid h-6 flex-1 place-items-center rounded-sm border transition-colors duration-150",
                  on ? "border-accent" : "border-line hover:border-line-strong",
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    // "Theme" shows the current theme's own accent rather than
                    // an empty swatch, so the row reads as six colours.
                    background:
                      a.value || DECK_THEMES[style.theme].accent,
                  }}
                />
              </button>
            );
          })}
        </div>
      </Control>

      <Control label="Surface">
        <Segmented
          value={style.background ?? "flat"}
          options={[
            ["flat", "Flat"],
            ["grain", "Grain"],
            ["glow", "Glow"],
            ["grid", "Grid"],
          ]}
          onChange={(v) =>
            onChange({ background: v as DeckStyle["background"] })
          }
        />
      </Control>

      <Control label="Type size">
        <input
          type="range"
          min={0.8}
          max={1.3}
          step={0.02}
          value={style.scale}
          aria-label="Type size"
          onChange={(e) => onChange({ scale: Number(e.target.value) })}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
        />
      </Control>

      <Control label="Title position">
        <Segmented
          value={style.align}
          options={[
            ["left", "Left"],
            ["centre", "Centred"],
          ]}
          onChange={(align) => onChange({ align: align as DeckStyle["align"] })}
        />
      </Control>

      <Control label="Accent rule">
        <Segmented
          value={style.rule ? "on" : "off"}
          options={[
            ["on", "Show"],
            ["off", "Hide"],
          ]}
          onChange={(v) => onChange({ rule: v === "on" })}
        />
      </Control>

      <Control label="Slide numbers">
        <Segmented
          value={style.numbers ? "on" : "off"}
          options={[
            ["on", "Show"],
            ["off", "Hide"],
          ]}
          onChange={(v) => onChange({ numbers: v === "on" })}
        />
      </Control>

      <Control label="Transition">
        <Segmented
          value={style.transition ?? "fade"}
          options={[
            ["none", "Cut"],
            ["fade", "Fade"],
            ["rise", "Rise"],
          ]}
          onChange={(v) =>
            onChange({ transition: v as DeckStyle["transition"] })
          }
        />
      </Control>

      <label className="mt-1 block">
        <span className="label-mono mb-1 block">Footer</span>
        <input
          value={style.footer ?? ""}
          placeholder="Conference, date, or nothing"
          onChange={(e) => onChange({ footer: e.target.value })}
          className="w-full rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-fg outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

function ThemeSwatch({
  name,
  active,
  onPick,
}: {
  name: DeckThemeName;
  active: boolean;
  onPick: () => void;
}) {
  const theme = DECK_THEMES[name];
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      title={theme.hint}
      // Without this the accessible name is the whole preview swatch read
      // aloud — "Title Supporting line Editorial" — which is not the name of
      // anything a person would say.
      aria-label={theme.label}
      className={cn(
        "overflow-hidden rounded-sm border text-left transition-colors duration-150",
        active ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      {/* A real miniature, drawn with the theme's own values. */}
      <span
        className="flex aspect-[16/9] flex-col justify-center gap-1 px-2"
        style={{ background: theme.bg, ...deckVars(theme, 1) }}
      >
        <span
          className="text-[9px] leading-none"
          style={{
            color: theme.fg,
            fontFamily: theme.titleFamily,
            fontWeight: theme.titleWeight,
            letterSpacing: theme.titleTracking,
          }}
        >
          Title
        </span>
        <span className="h-px w-4" style={{ background: theme.accent }} />
        <span
          className="text-[6px] leading-none"
          style={{ color: theme.muted }}
        >
          Supporting line
        </span>
      </span>
      <span className="block px-1.5 py-1 text-[10.5px] text-fg-muted">
        {theme.label}
      </span>
    </button>
  );
}

function Control({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <span className="label-mono mb-1 block">{label}</span>
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
    <div className="inline-flex gap-0.5 rounded-sm border border-line p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xs px-2 py-1 text-[11px] transition-colors duration-150",
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
