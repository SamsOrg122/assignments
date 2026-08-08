"use client";

/**
 * How a slide is drawn, and the two controls that decide it.
 *
 * Lifted out of the deck editor so the *same* slide renders wherever a deck
 * appears — the presenting editor, a slides block inside a document, a shared
 * link. A second implementation for the in-document case is what made a deck
 * inside a document a poor relation of a deck in its own project: no theme, no
 * layouts, no free-form layer. There is one now.
 */

import type { DeckStyle, Slide, SlideLayout } from "@/lib/types";
import { DECK_THEMES, deckVars } from "@/lib/deck-themes";
import { SlideObjectsView } from "@/components/editors/SlideObjects";
import { cn } from "@/lib/cn";

/**
 * Layout is inferred from the slide's own shape rather than stored, so a slide
 * restyles itself as you edit it and there's no state to get out of sync.
 */
export type Layout = "title" | "statement" | "bullets" | "split";

export function layoutOf(slide: Slide, index: number): Layout {
  // An author's choice always beats the guess.
  if (slide.layout && slide.layout !== "auto") return slide.layout;
  const bullets = slide.bullets.filter((b) => b.trim());
  if (index === 0 && bullets.length <= 1) return "title";
  if (bullets.length === 0) return "statement";
  if (bullets.length === 1 && bullets[0].length > 90) return "statement";
  return bullets.length > 4 ? "split" : "bullets";
}

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  auto: "Automatic",
  title: "Title",
  statement: "Statement",
  bullets: "Bullets",
  split: "Two columns",
};

/**
 * Per-slide layout. "Automatic" is the default and stays honest — it shows
 * which layout the content is currently implying, so overriding is a decision
 * rather than a guess.
 */
export function LayoutPicker({
  value,
  inferred,
  onChange,
}: {
  value: SlideLayout;
  inferred: Layout;
  onChange: (layout: SlideLayout) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11.5px] text-fg-subtle">Layout</span>
      <select
        value={value}
        aria-label="Slide layout"
        onChange={(e) => onChange(e.target.value as SlideLayout)}
        className="rounded-sm border border-line bg-surface px-1.5 py-1 text-[11.5px] text-fg-muted outline-none transition-colors hover:border-line-strong focus:border-accent"
      >
        {(Object.keys(LAYOUT_LABELS) as SlideLayout[]).map((key) => (
          <option key={key} value={key}>
            {key === "auto"
              ? `Automatic — ${LAYOUT_LABELS[inferred]}`
              : LAYOUT_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One slide, rendered with the layout its content implies and the deck's theme.
 *
 * Nothing here reads a colour or a face directly — every value comes from the
 * `--slide-*` custom properties the theme sets on the surface, so the same
 * markup renders as Ink, Paper or Signal without a branch.
 */
/** Also the whole of a shared deck — see `components/viewer`. */
export function SlideView({
  slide,
  index,
  style,
  onChange,
  readOnly = false,
  hideObjects = false,
}: {
  slide?: Slide;
  index: number;
  style: DeckStyle;
  onChange?: (next: Partial<Slide>) => void;
  readOnly?: boolean;
  /** The stage hides the static layer — the editor renders it interactively. */
  hideObjects?: boolean;
}) {
  const theme = DECK_THEMES[style.theme] ?? DECK_THEMES.ink;
  const vars = deckVars(theme, style.scale, style.accent, style.font);

  if (!slide)
    return <div className="size-full" style={{ background: theme.bg }} />;

  const layout = layoutOf(slide, index);
  const bullets = slide.bullets;
  const centred = style.align === "centre";

  const setBullets = (next: string[]) => onChange?.({ bullets: next });

  /** Scale folds into the clamp so the whole deck moves together. */
  const size = (min: number, fluid: string, max: number) =>
    `calc(clamp(${min}px, ${fluid}, ${max}px) * var(--slide-scale))`;

  const Title = (
    <Field
      value={slide.title}
      readOnly={readOnly}
      onChange={(title) => onChange?.({ title })}
      placeholder="Slide title"
      className={cn(
        "w-full bg-transparent outline-none",
        centred && "text-center",
      )}
      style={{
        color: "var(--slide-fg)",
        fontFamily: "var(--slide-title-family)",
        fontWeight: "var(--slide-title-weight)" as unknown as number,
        letterSpacing: "var(--slide-title-tracking)",
        fontSize:
          layout === "title"
            ? size(28, "5.2cqw", 60)
            : size(20, "3.2cqw", 34),
        lineHeight: layout === "title" ? 1.05 : 1.12,
      }}
    />
  );

  const Rule = style.rule ? (
    <span
      className={cn(
        "block h-px shrink-0",
        centred ? "mx-auto w-[12%]" : "w-[18%]",
      )}
      style={{ background: "var(--slide-accent)" }}
    />
  ) : null;

  const Bullets = (
    <ul
      className={cn(
        "space-y-[0.55em]",
        layout === "split" ? "columns-2 gap-8 [&>li]:break-inside-avoid" : "",
      )}
    >
      {bullets.map((b, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-[0.6em]",
            centred && layout !== "split" && "justify-center",
          )}
        >
          <span
            aria-hidden="true"
            className="mt-[0.62em] size-[0.28em] shrink-0 rounded-full"
            style={{ background: "var(--slide-accent)" }}
          />
          <Field
            value={b}
            readOnly={readOnly}
            placeholder="A point…"
            onChange={(v) => setBullets(bullets.map((x, j) => (j === i ? v : x)))}
            onEnter={() =>
              setBullets([...bullets.slice(0, i + 1), "", ...bullets.slice(i + 1)])
            }
            onEmptyBackspace={() =>
              bullets.length > 1 &&
              setBullets(bullets.filter((_, j) => j !== i))
            }
            className={cn(
              "w-full bg-transparent leading-relaxed outline-none",
              centred && layout !== "split" && "text-center",
            )}
            style={{
              color: "var(--slide-muted)",
              // Falls back to the theme's body face unless a kit font is set.
              fontFamily: "var(--slide-body-family, inherit)",
              fontSize: size(12, "1.9cqw", 20),
            }}
          />
        </li>
      ))}
    </ul>
  );

  const chrome =
    style.numbers || style.footer?.trim() ? (
      <div
        className="pointer-events-none absolute inset-x-[7cqw] bottom-[3.5cqh] flex items-center justify-between"
        style={{
          color: "var(--slide-muted)",
          fontSize: size(7, "0.95cqw", 11),
        }}
      >
        <span className="truncate">{style.footer?.trim() ?? ""}</span>
        {style.numbers && <span className="tabular-nums">{index + 1}</span>}
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "relative flex size-full flex-col justify-center px-[7cqw] py-[6cqh]",
        centred && "items-center",
      )}
      style={{ ...vars, background: "var(--slide-bg)", containerType: "size" }}
    >
      <SlideSurface background={style.background} />
      {!hideObjects && <SlideObjectsView objects={slide.objects} />}
      {layout === "title" ? (
        <div className={cn("w-full", centred && "text-center")}>
          {Title}
          <div className={cn("mt-[2.5cqh]", centred ? "mx-auto max-w-[74%]" : "max-w-[62%]")}>
            {Bullets}
          </div>
          {Rule && <div className="mt-[4cqh]">{Rule}</div>}
        </div>
      ) : layout === "statement" ? (
        <div className={cn("w-full", centred ? "max-w-[80%]" : "max-w-[86%]")}>
          {Title}
          {Rule && <div className="mt-[2.5cqh]">{Rule}</div>}
          <div className="mt-[3cqh]">{Bullets}</div>
        </div>
      ) : (
        <div className="w-full">
          {Title}
          <span
            className="my-[3cqh] block h-px w-full"
            style={{
              background: style.rule
                ? "var(--slide-accent)"
                : "var(--slide-line)",
              opacity: style.rule ? 0.9 : 1,
            }}
          />
          <div className={cn(centred ? "mx-auto max-w-[92%]" : "max-w-[92%]")}>
            {Bullets}
          </div>
        </div>
      )}
      {chrome}
    </div>
  );
}

/**
 * The slide's surface treatment.
 *
 * Drawn from the theme's own accent and ink, so a texture can never introduce
 * a colour the theme didn't choose. Absolutely positioned behind everything
 * and non-interactive — a background that can take a click is a bug.
 */
function SlideSurface({ background }: { background?: DeckStyle["background"] }) {
  if (!background || background === "flat") return null;

  if (background === "grid")
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--slide-line) 1px, transparent 1px), linear-gradient(90deg, var(--slide-line) 1px, transparent 1px)",
          backgroundSize: "6cqw 6cqw",
          opacity: 0.5,
        }}
      />
    );

  if (background === "glow")
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 90% at 12% 0%, color-mix(in srgb, var(--slide-accent) 20%, transparent), transparent 62%)",
        }}
      />
    );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(120% 90% at 50% -20%, color-mix(in srgb, var(--slide-fg) 7%, transparent), transparent 60%)",
      }}
    />
  );
}

function Field({
  value,
  onChange,
  onEnter,
  onEmptyBackspace,
  placeholder,
  className,
  style,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  onEmptyBackspace?: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
}) {
  if (readOnly)
    return (
      <div className={className} style={style}>
        {value || <span className="opacity-40">{placeholder}</span>}
      </div>
    );

  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      style={style}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        } else if (e.key === "Backspace" && value === "" && onEmptyBackspace) {
          e.preventDefault();
          onEmptyBackspace();
        }
      }}
      className={cn(className, "placeholder:opacity-40")}
    />
  );
}
