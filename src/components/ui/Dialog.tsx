"use client";

/**
 * A modal panel.
 *
 * One implementation so every dialog in the app traps focus, closes on Escape
 * and on a click outside, and restores focus to whatever opened it — the
 * details that are invisible when they work and infuriating when they don't.
 */

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/cn";

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  width = 520,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    // Focus the panel rather than its first field: landing in a text input
    // means the first keystroke edits something the user hasn't read yet.
    panel.current?.focus();
    const previous = restoreTo.current;
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      // Keep Tab inside the panel — a modal you can tab out of is a modal in
      // name only.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width: `min(${width}px, 100%)` }}
        /* The panel keeps its border and its shadow: it is painted over
           content it is not part of, which is the one case where a line is
           doing physics. Everything that used to be drawn *inside* it is
           spacing now. */
        className="anim-pop max-h-[86vh] overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-[0_40px_100px_-24px_rgba(0,0,0,0.8)] outline-none"
      >
        {/* The rule under the header is gone. Nothing separated the title from
            the body except a hairline, and a title that is 15px at 500 over a
            body that is 13px at 400 does not need one — the type says which is
            which, and 16px of air says they belong together. */}
        <div className="flex items-start gap-3 px-(--space-4) pt-(--space-4)">
          <div className="min-w-0 flex-1">
            <h2 className="text-object text-fg">{title}</h2>
            {description && (
              <p className="mt-(--space-1) text-body text-fg-muted text-pretty">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-sm p-1.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        <div className="px-(--space-4) pt-(--space-3) pb-(--space-4)">
          {children}
        </div>

        {/* And no rule over the footer either. 24px under the body plus 24px
            over the buttons is 48, past the point where a gap replaces a line
            — and a gap and a line are never both right. */}
        {footer && (
          <div className="flex items-center justify-end gap-(--space-2) px-(--space-4) pt-(--space-4) pb-(--space-4)">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Form pieces, shared by the dialogs ─────────────────── */

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
    <div className="mb-(--space-3) last:mb-0">
      <span className="mb-(--space-1) block text-body text-fg">{label}</span>
      {children}
      {/* The hint drops a step rather than sharing text-body with the label
          above it: two 13px greys in a five-row form is the wobble this scale
          exists to remove, and what is written here is a fact about the field
          rather than a second sentence of its label. */}
      {hint && (
        <p className="mt-(--space-1) text-meta text-fg-subtle text-pretty">
          {hint}
        </p>
      )}
    </div>
  );
}

/*
 * The field keeps its border, inside a bordered panel, and that is deliberate.
 * "Nothing bordered inside something bordered" is aimed at decoration —
 * keycaps, icon tiles, kind pills, a button in a strip. An input is the one
 * shape where the border IS the affordance: without it a field is
 * indistinguishable from a heading, and you cannot see where your text goes.
 * When an input and its container collide, the container gives way — which is
 * why the dialog's own header and footer rules came out and this one did not.
 */
export const fieldClass =
  "w-full rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none transition-colors focus:border-accent";

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      /*
       * Three shapes, no borders. An action that writes gets a shape and an
       * action that navigates gets a word, and every button that reaches this
       * component writes something — so all three keep a shape, and the
       * difference between them is ink.
       *
       * `ghost` is the default and it is not only Cancel: Copy, Rewrite,
       * Duplicate and the passcode buttons come through here too. So it takes
       * the plain write shape rather than becoming a bare word, and drops the
       * outline it wore inside an already-bordered panel. `danger` is the same
       * shape in danger ink — the red is the signal, and it does not also need
       * a red hairline round it saying the same thing a second time.
       *
       * `primary` keeps its accent fill. A dialog's primary is exactly what
       * the one-accent-per-screen budget is reserved for: the thing you press
       * to make the dialog do what it opened to do.
       */
      className={cn(
        "rounded-sm px-3 py-1.5 text-body font-medium transition-colors duration-150 disabled:opacity-40",
        variant === "primary" &&
          "bg-accent text-on-accent enabled:hover:brightness-110",
        variant === "ghost" &&
          "bg-surface-2 text-fg enabled:hover:bg-surface-3",
        variant === "danger" &&
          "bg-surface-2 text-danger enabled:hover:bg-danger/10",
      )}
    >
      {children}
    </button>
  );
}
