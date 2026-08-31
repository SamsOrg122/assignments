"use client";

/**
 * The furniture Settings is built from.
 *
 * These lived inside `settings/page.tsx` as private helpers, which was fine
 * while Settings was the only page shaped like this. Administration then
 * grew its own `Section` with a different heading size, a required note
 * instead of an optional hint, and a card instead of a rule — two of the
 * same idea, disagreeing. Folding one page into the other means picking a
 * winner, and Settings is the destination, so Settings' shape won and
 * Administration's card survives as a variant.
 *
 * `Row` is deliberately the horizontal, label-gutter one. There are two
 * other `Row`s in the codebase — `ui/Dialog.tsx` stacks its control under
 * the label, `editors/PagePanel.tsx` takes no hint at all — and they are
 * not interchangeable. This one is the settings row and nothing else.
 *
 * What changed: the containers came out. Twenty sections drew a hairline
 * above their body and two more drew a card around it, on 5,853px of page,
 * and none of it said which section you were in — the one question somebody
 * scrolling this actually has. The answer is the 200px label gutter below:
 * every label starts at the same x and every control at x=224, for the whole
 * page. One vertical edge the eye can run is worth more than sixty-two
 * borders, and it is the same trick as /due's 42px time column.
 */

import { cn } from "@/lib/cn";

export function Section({
  id,
  title,
  hint,
  variant = "rule",
  children,
}: {
  /** Set where something links straight to this section. */
  id?: string;
  title: string;
  hint?: string;
  /**
   * `card` used to box the body, on the observation — a real one — that *"a
   * list of members under a bare rule reads as part of the page rather than
   * as a thing with edges"*. The answer to that is that a table is not a
   * card. A well-set page has had tables without boxes for five hundred
   * years: a quiet header row, one rule under the head and none anywhere
   * else, and columns that line up. It reads as an object because its
   * columns align, not because it has a wall.
   *
   * So `card` now means "this section is a table", and all it changes is the
   * row rhythm — table rows sit closer together than a stack of unrelated
   * controls does. The prop stays because the two call sites are genuinely
   * different kinds of section and that difference was worth recording where
   * it was made.
   */
  variant?: "rule" | "card";
  children: React.ReactNode;
}) {
  return (
    /* scroll-mt is what a rail anchor lands against. It stays on the space
       scale rather than an invented number so that a section arriving from
       #connection has the same air above it as one you scrolled to. */
    <section id={id} className="mb-(--space-5) scroll-mt-(--space-6)">
      <h2 className="text-object text-fg">{title}</h2>
      {hint && (
        <p className="mt-(--space-1) mb-(--space-3) max-w-[58ch] text-body text-fg-muted">
          {hint}
        </p>
      )}
      <div
        className={cn(
          "flex flex-col",
          variant === "card" ? "gap-(--space-2)" : "gap-(--space-3)",
          !hint && "mt-(--space-3)",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-(--space-2) sm:flex-row sm:items-center sm:gap-(--space-4)">
      {/* 200 + 24 = 224, and that number is the page's only alignment now.
          Widened from 152 because a label that wraps to two lines puts its
          control on a different baseline from the one above it, which is
          exactly the edge this is here to draw. */}
      <div className="sm:w-[200px] sm:shrink-0">
        <p className="text-body text-fg">{label}</p>
        {hint && <p className="mt-(--space-1) text-meta text-fg-subtle">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A control with no label of its own, held to the same column as every other
 * control on the page. Without this the gutter is broken by a third of the
 * sections and the page has no vertical edge at all — which is the whole
 * reason the boxes came out.
 */
export const Loose = ({ children }: { children: React.ReactNode }) => (
  <div className="sm:pl-[224px]">{children}</div>
);

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    /* No wrapper box. The same shape /due's status control uses, so the app
       has one segmented vocabulary instead of two.

       The padding sits on every segment rather than only the pressed one, so
       nothing moves under the cursor when the answer changes; the chip, the
       weight and the ink are what arrive. The chip is deliberately not the
       carrier — surface-2 is 1.24:1 on canvas in dark and 1.08:1 in light and
       could not be one — it reinforces the weight and ink, which is what
       fixes the shipped light-mode bug rather than moving it. `aria-pressed`
       is untouched, and is what makes de-boxing safe at all. */
    <div className="inline-flex flex-wrap gap-(--space-2)">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xs px-2 py-0.5 text-body transition-colors duration-150",
            value === key
              ? "bg-surface-2 font-medium text-fg"
              : "text-fg-subtle hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProviderRow({
  name,
  value,
  detail,
}: {
  name: string;
  value: string;
  detail: string;
}) {
  return (
    /* The name column is the same 200px gutter every Row uses, or Providers
       is the one section on the page whose labels start somewhere else. */
    <div className="flex flex-col gap-(--space-1) sm:flex-row sm:items-baseline sm:gap-(--space-4)">
      <span className="text-body text-fg sm:w-[200px] sm:shrink-0">{name}</span>
      <span className="flex min-w-0 items-baseline gap-(--space-2)">
        {/* `openrouter`, `web-speech`, `mock` are literal config strings you
            would paste into an env file, so they keep the mono face. They
            lose the pill: a border means an input, an object or a floating
            layer, and a word is none of those. */}
        <span className="shrink-0 text-meta text-fg-subtle">{value}</span>
        {/* Prose *about* an interface, not something you paste. Sans. */}
        <span className="min-w-0 truncate text-meta text-fg-subtle">{detail}</span>
      </span>
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-body text-fg-subtle">{children}</p>
);
