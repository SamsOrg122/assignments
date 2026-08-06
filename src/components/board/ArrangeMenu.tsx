"use client";

/**
 * Arrange: align, distribute, group, lock, layer.
 *
 * Twelve controls is a ribbon if they live on screen permanently and a normal
 * amount of power if they live one click behind a button that only exists while
 * something is selected. This is the second one.
 *
 * The align glyphs are drawn rather than iconified: an alignment control has to
 * *show* the alignment, and a generic arrow can't.
 */

import { useEffect, useRef, useState } from "react";
import type { Alignment } from "@/lib/geometry";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const ALIGNMENTS: Array<{ edge: Alignment; label: string }> = [
  { edge: "left", label: "Align left" },
  { edge: "centerX", label: "Align centres horizontally" },
  { edge: "right", label: "Align right" },
  { edge: "top", label: "Align top" },
  { edge: "centerY", label: "Align centres vertically" },
  { edge: "bottom", label: "Align bottom" },
];

export function ArrangeMenu({
  count,
  grouped,
  locked,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onLock,
  onRaise,
  onLower,
}: {
  count: number;
  grouped: boolean;
  locked: boolean;
  onAlign: (edge: Alignment) => void;
  onDistribute: (axis: "x" | "y") => void;
  onGroup: () => void;
  onUngroup: () => void;
  onLock: (locked: boolean) => void;
  onRaise: () => void;
  onLower: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const multi = count > 1;

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
      >
        <Icon name="group" size={11} />
        Arrange
      </button>

      {open && (
        <div className="anim-pop absolute bottom-full left-0 z-50 mb-2 w-[212px] rounded-md border border-line-strong bg-surface p-2 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]">
          <p className="px-0.5 pb-1.5 text-[10px] tracking-wide text-fg-subtle">
            Align
          </p>
          <div className="grid grid-cols-6 gap-1">
            {ALIGNMENTS.map(({ edge, label }) => (
              <button
                key={edge}
                type="button"
                title={label}
                aria-label={label}
                disabled={!multi}
                onClick={() => onAlign(edge)}
                className={cn(
                  "grid h-7 place-items-center rounded-sm border border-line transition-colors",
                  multi
                    ? "text-fg-muted hover:border-line-strong hover:text-fg"
                    : "text-fg-subtle opacity-40",
                )}
              >
                <AlignGlyph edge={edge} />
              </button>
            ))}
          </div>

          <p className="px-0.5 pt-2.5 pb-1.5 text-[10px] tracking-wide text-fg-subtle">
            Distribute
          </p>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ["x", "Even gaps across"],
                ["y", "Even gaps down"],
              ] as const
            ).map(([axis, label]) => (
              <button
                key={axis}
                type="button"
                aria-label={label}
                disabled={count < 3}
                onClick={() => onDistribute(axis)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11px] transition-colors",
                  count >= 3
                    ? "text-fg-muted hover:border-line-strong hover:text-fg"
                    : "text-fg-subtle opacity-40",
                )}
              >
                <DistributeGlyph axis={axis} />
                {axis === "x" ? "Across" : "Down"}
              </button>
            ))}
          </div>

          <div className="mt-2 space-y-0.5 border-t border-line pt-2">
            <Row
              icon="group"
              label={grouped ? "Ungroup" : "Group"}
              shortcut="⌘G"
              disabled={!grouped && !multi}
              onClick={() => (grouped ? onUngroup() : onGroup())}
            />
            <Row
              icon={locked ? "unlock" : "lock"}
              label={locked ? "Unlock" : "Lock"}
              shortcut="⌘L"
              onClick={() => onLock(!locked)}
            />
            <Row icon="arrow-up" label="Bring to front" onClick={onRaise} />
            <Row icon="arrow-right" label="Send to back" onClick={onLower} />
          </div>
        </div>
      )}
    </span>
  );
}

function Row({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: "group" | "lock" | "unlock" | "arrow-up" | "arrow-right";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-[12px] transition-colors",
        disabled
          ? "text-fg-subtle opacity-40"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon
        name={icon}
        size={11}
        className={cn(icon === "arrow-right" && "rotate-90")}
      />
      {label}
      {shortcut && (
        <span className="ml-auto font-mono text-[9.5px] text-fg-subtle">
          {shortcut}
        </span>
      )}
    </button>
  );
}

/** 16×16 picture of the alignment itself: a rule, and two boxes obeying it. */
function AlignGlyph({ edge }: { edge: Alignment }) {
  const rule =
    edge === "left"
      ? "M3 2v12"
      : edge === "right"
        ? "M13 2v12"
        : edge === "centerX"
          ? "M8 2v12"
          : edge === "top"
            ? "M2 3h12"
            : edge === "bottom"
              ? "M2 13h12"
              : "M2 8h12";

  const bars: Array<[number, number, number, number]> =
    edge === "left"
      ? [
          [3, 4, 9, 3],
          [3, 9, 5.5, 3],
        ]
      : edge === "right"
        ? [
            [4, 4, 9, 3],
            [7.5, 9, 5.5, 3],
          ]
        : edge === "centerX"
          ? [
              [3.5, 4, 9, 3],
              [5.25, 9, 5.5, 3],
            ]
          : edge === "top"
            ? [
                [4, 3, 3, 9],
                [9, 3, 3, 5.5],
              ]
            : edge === "bottom"
              ? [
                  [4, 4, 3, 9],
                  [9, 7.5, 3, 5.5],
                ]
              : [
                  [4, 3.5, 3, 9],
                  [9, 5.25, 3, 5.5],
                ];

  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={rule}
        stroke="var(--color-accent)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {bars.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={1}
          fill="currentColor"
          opacity={0.75}
        />
      ))}
    </svg>
  );
}

function DistributeGlyph({ axis }: { axis: "x" | "y" }) {
  const bars =
    axis === "x"
      ? [
          [2, 5, 2.5, 6],
          [6.75, 5, 2.5, 6],
          [11.5, 5, 2.5, 6],
        ]
      : [
          [5, 2, 6, 2.5],
          [5, 6.75, 6, 2.5],
          [5, 11.5, 6, 2.5],
        ];
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" aria-hidden="true">
      {bars.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={1}
          fill="currentColor"
          opacity={0.75}
        />
      ))}
    </svg>
  );
}
