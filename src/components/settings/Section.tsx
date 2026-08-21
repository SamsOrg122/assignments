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
   * `rule` sits the body under a hairline, which is what most of Settings
   * does. `card` boxes it, which is what Administration's tables need — a
   * list of members under a bare rule reads as part of the page rather than
   * as a thing with edges.
   */
  variant?: "rule" | "card";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 mb-4 max-w-[58ch] text-[12.5px] leading-relaxed text-fg-muted">
          {hint}
        </p>
      )}
      <div
        className={cn(
          variant === "card"
            ? "rounded-md border border-line bg-surface p-3.5"
            : "flex flex-col gap-3.5 border-t border-line pt-4",
          !hint && "mt-4",
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-[152px] sm:shrink-0">
        <p className="text-[12.5px] text-fg">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{hint}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

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
    <div className="inline-flex gap-0.5 rounded-sm border border-line p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xs px-2 py-1 text-[11.5px] transition-colors duration-150",
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
    <div className="flex items-baseline gap-3">
      <span className="w-[68px] shrink-0 text-[12.5px] text-fg">{name}</span>
      <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
        {value}
      </span>
      <span className="min-w-0 truncate font-mono text-[10px] text-fg-subtle">
        {detail}
      </span>
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12.5px] leading-relaxed text-fg-subtle">{children}</p>
);
