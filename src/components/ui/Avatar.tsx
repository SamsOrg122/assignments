"use client";

/**
 * The face a project (or folder) wears.
 *
 * One component for every render site — sidebar row, Library row, folder
 * rail — so an avatar looks the same everywhere at any size. Three cases,
 * decided from the stored glyph alone:
 *
 *  - `~motif-color` draws one of the animated marks (pure CSS, no timers,
 *    and `prefers-reduced-motion` freezes every one of them into a
 *    perfectly readable still — see globals.css).
 *  - a glyph that differs from the kind's default draws as text: a shape,
 *    an emoji, whatever was picked.
 *  - the default glyph draws the kind's icon, which is exactly what these
 *    rows showed before avatars existed. Nobody's library changes until
 *    they change it.
 */

import { KINDS } from "@/lib/kinds";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_ORDER,
  AVATAR_EMOJI,
  AVATAR_MOTIFS,
  AVATAR_SHAPES,
  encodeAvatar,
  parseAvatar,
  type AvatarMotif,
} from "@/lib/avatars";
import type { ProjectKind } from "@/lib/types";
import { Icon } from "./Icon";
import { cn } from "@/lib/cn";
import { useState } from "react";

function Mark({ motif }: { motif: AvatarMotif }) {
  switch (motif) {
    case "pixels":
      return (
        <span className="avatar-pixels">
          <span /><span /><span /><span />
        </span>
      );
    case "pulse":
      return (
        <span className="avatar-pulse">
          <span /><span />
        </span>
      );
    case "orbit":
      return (
        <span className="avatar-orbit">
          <span className="avatar-orbit-ring" />
          <span className="avatar-orbit-rotor">
            <span />
          </span>
        </span>
      );
    case "spark":
      return <span className="avatar-spark">✦</span>;
    case "wave":
      return (
        <span className="avatar-wave">
          <span /><span /><span />
        </span>
      );
    case "ring":
      return <span className="avatar-ring" />;
  }
}

export function Avatar({
  glyph,
  kind,
  size = 14,
  className,
}: {
  glyph: string | undefined;
  /** Supplies the fallback icon; folders pass none and fall back to text. */
  kind?: ProjectKind;
  size?: number;
  className?: string;
}) {
  const animated = parseAvatar(glyph);
  const custom = glyph && (!kind || glyph !== KINDS[kind].glyph);

  return (
    <span
      aria-hidden="true"
      className={cn("avatar", className)}
      style={
        animated
          ? { width: size, height: size, ["--av" as string]: AVATAR_COLORS[animated.color] }
          : { width: size, height: size }
      }
    >
      {animated ? (
        <Mark motif={animated.motif} />
      ) : custom ? (
        <span className="avatar-glyph" style={{ fontSize: Math.round(size * 0.86) }}>
          {glyph}
        </span>
      ) : kind ? (
        <Icon name={KINDS[kind].icon} size={Math.round(size * 0.92)} />
      ) : (
        <span className="avatar-glyph" style={{ fontSize: Math.round(size * 0.86) }}>
          ◇
        </span>
      )}
    </span>
  );
}

/* ── Choosing one ────────────────────────────────────────────────────── */

/**
 * The animated shelf shows every motif in one colour at a time with the
 * palette alongside, rather than a 6×8 wall of blinking cells — 48 moving
 * things is a screen nobody can look at.
 */
export function AvatarPicker({
  value,
  onPick,
}: {
  value: string | undefined;
  onPick: (glyph: string) => void;
}) {
  const animated = parseAvatar(value);
  const [color, setColor] = useState(animated?.color ?? "blue");

  const cell = (selected: boolean) =>
    cn(
      "grid size-8 place-items-center rounded-sm border transition-colors duration-150",
      selected
        ? "border-accent bg-accent-soft text-fg"
        : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
    );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-meta text-fg-subtle">Animated</span>
          <span className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
            {AVATAR_COLOR_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => {
                  setColor(c);
                  // Recolour in place when an animated mark is already chosen,
                  // so the swatches act on what you see.
                  if (animated) onPick(encodeAvatar(animated.motif, c));
                }}
                className={cn(
                  "size-4 rounded-full border transition-transform duration-150 hover:scale-110",
                  color === c ? "border-fg" : "border-transparent",
                )}
                style={{ backgroundColor: AVATAR_COLORS[c] }}
              />
            ))}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {AVATAR_MOTIFS.map((motif) => {
            const code = encodeAvatar(motif, color);
            return (
              <button
                key={motif}
                type="button"
                aria-label={`${motif}, ${color}`}
                aria-pressed={animated?.motif === motif}
                onClick={() => onPick(code)}
                className={cell(animated?.motif === motif)}
              >
                <Avatar glyph={code} size={18} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="text-meta text-fg-subtle mb-1.5 block">Shapes</span>
        <div className="flex flex-wrap gap-1">
          {AVATAR_SHAPES.map((g) => (
            <button
              key={g}
              type="button"
              aria-label={`Glyph ${g}`}
              aria-pressed={value === g}
              onClick={() => onPick(g)}
              className={cn(cell(value === g), "text-[13px]")}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-meta text-fg-subtle mb-1.5 block">Emoji</span>
        <div className="flex flex-wrap gap-1">
          {AVATAR_EMOJI.map((g) => (
            <button
              key={g}
              type="button"
              aria-label={`Emoji ${g}`}
              aria-pressed={value === g}
              onClick={() => onPick(g)}
              className={cn(cell(value === g), "text-[14px]")}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The picker in a small dialog, for choosing straight from a list row
 *  without opening the full settings. */
export function AvatarDialog({
  title,
  value,
  onPick,
  onClose,
}: {
  title: string;
  value: string | undefined;
  onPick: (glyph: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative w-full max-w-[420px] rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[14px] font-medium text-fg">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <AvatarPicker value={value} onPick={onPick} />
      </div>
    </div>
  );
}
