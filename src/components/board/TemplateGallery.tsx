"use client";

/**
 * Board templates, shown as what they actually look like.
 *
 * A list of names ("Kanban", "Mind map") makes you guess; a miniature of the
 * real layout doesn't. Each card renders the template's own item specs through
 * the same shrink-to-fit maths the minimap uses, so the preview can't drift
 * from what gets stamped.
 */

import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board-templates";

const TONE: Record<string, string> = {
  neutral: "var(--color-fg-subtle)",
  accent: "var(--color-accent)",
  mint: "var(--color-leaf)",
  warn: "#d8a33c",
};

export function TemplateGallery({
  onPick,
  compact,
}: {
  onPick: (template: BoardTemplate) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid w-[430px] grid-cols-2 gap-1.5"
          : "grid max-w-[760px] grid-cols-2 gap-2.5 sm:grid-cols-3"
      }
    >
      {BOARD_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          className="group rounded-md border border-line bg-surface p-2 text-left transition-colors duration-150 hover:border-line-strong"
        >
          <Preview template={t} height={compact ? 54 : 84} />
          <p className="mt-2 text-[12.5px] font-medium text-fg">{t.name}</p>
          {!compact && (
            <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">
              {t.blurb}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function Preview({
  template,
  height,
}: {
  template: BoardTemplate;
  height: number;
}) {
  const items = template.items;
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.width));
  const maxY = Math.max(...items.map((i) => i.y + i.height));
  const pad = 6;
  const k = Math.min(
    (240 - pad * 2) / Math.max(1, maxX - minX),
    (height - pad * 2) / Math.max(1, maxY - minY),
  );

  const at = (key: string) => {
    const spec = items.find((i) => i.key === key);
    if (!spec) return null;
    return {
      x: pad + (spec.x + spec.width / 2 - minX) * k,
      y: pad + (spec.y + spec.height / 2 - minY) * k,
    };
  };

  return (
    <div
      className="relative overflow-hidden rounded-sm bg-surface-2"
      style={{ height }}
    >
      {/* Connectors are half of what a mind map or a flow *is* — without them
          the preview is just scattered boxes. */}
      {!!template.links?.length && (
        <svg className="absolute inset-0 size-full" aria-hidden="true">
          {template.links.map((l, n) => {
            const a = at(l.from);
            const b = at(l.to);
            if (!a || !b) return null;
            return (
              <line
                key={n}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--color-fg-subtle)"
                strokeWidth={1}
                opacity={0.55}
              />
            );
          })}
        </svg>
      )}

      {items.map((i, n) => {
        const tone = TONE[i.tone ?? "neutral"];
        return (
          <div
            key={n}
            className="absolute rounded-[1.5px]"
            style={{
              left: pad + (i.x - minX) * k,
              top: pad + (i.y - minY) * k,
              width: Math.max(2, i.width * k),
              height: Math.max(2, i.height * k),
              background: i.kind === "frame" ? "transparent" : tone,
              border: i.kind === "frame" ? `1px dashed ${tone}` : undefined,
              opacity: i.kind === "frame" ? 0.45 : 0.7,
            }}
          />
        );
      })}
    </div>
  );
}
