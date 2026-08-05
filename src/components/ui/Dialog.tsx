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
        className="anim-pop max-h-[86vh] overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-[0_40px_100px_-24px_rgba(0,0,0,0.8)] outline-none"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium text-fg">{title}</h2>
            {description && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted text-pretty">
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

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
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
    <div className="mb-4 last:mb-0">
      <span className="mb-1.5 block text-[12.5px] text-fg">{label}</span>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-subtle text-pretty">
          {hint}
        </p>
      )}
    </div>
  );
}

export const fieldClass =
  "w-full rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none transition-colors focus:border-accent";

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
      className={cn(
        "rounded-sm px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 disabled:opacity-40",
        variant === "primary" &&
          "bg-accent text-on-accent enabled:hover:brightness-110",
        variant === "ghost" &&
          "border border-line text-fg-muted enabled:hover:border-line-strong enabled:hover:text-fg",
        variant === "danger" &&
          "border border-danger/40 text-danger enabled:hover:bg-danger/10",
      )}
    >
      {children}
    </button>
  );
}
