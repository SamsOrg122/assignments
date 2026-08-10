"use client";

/**
 * Write an equation.
 *
 * The preview is live and the error is shown as you type, because LaTeX is a
 * language people half-remember: `\frac{1}{2` is the normal state of an
 * equation halfway through being written, and a tool that only tells you at
 * the end is a tool you stop using.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMath } from "@/lib/math";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function MathPopover({
  x,
  y,
  initial,
  initialDisplay,
  onSave,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  initial: string;
  initialDisplay: boolean;
  onSave: (latex: string, display: boolean) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState(initial);
  const [display, setDisplay] = useState(initialDisplay);
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const preview = useMemo(() => renderMath(latex, display), [latex, display]);

  useEffect(() => {
    const id = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const width = 330;
  const left = Math.min(
    Math.max(8, x),
    (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 16,
  );

  const save = () => {
    const clean = latex.trim();
    if (!clean) {
      if (onRemove) onRemove();
      else onClose();
      return;
    }
    onSave(clean, display);
  };

  return (
    <div
      ref={ref}
      className="anim-pop fixed z-50 overflow-hidden rounded-md border border-line-strong bg-surface shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
      style={{ left, top: y, width }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="type" size={11} className="text-fg-subtle" />
        <span className="text-[11.5px] text-fg-muted">
          {onRemove ? "Equation" : "New equation"}
        </span>
        <button
          type="button"
          onClick={() => setDisplay((v) => !v)}
          aria-pressed={display}
          className={cn(
            "ml-auto rounded-xs px-1.5 py-0.5 font-mono text-[10px] transition-colors",
            display ? "bg-white/10 text-fg" : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {display ? "own line" : "inline"}
        </button>
      </div>

      <textarea
        ref={field}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder="\frac{a}{b} = \sqrt{c}"
        aria-label="LaTeX"
        className="w-full resize-none bg-transparent px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
      />

      <div className="min-h-[46px] border-t border-line bg-surface-2 px-3 py-2.5">
        {preview.problem ? (
          <p className="font-mono text-[11px] leading-snug text-danger">
            {preview.problem}
          </p>
        ) : (
          <div
            className="math-preview overflow-x-auto text-fg"
            // KaTeX's output from the source in the box above — generated
            // here, not carried in from a document.
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={save}
          disabled={Boolean(preview.problem) && Boolean(latex.trim())}
          className="rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50"
        >
          Save
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm border border-line px-2.5 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
          >
            Delete
          </button>
        )}
        <kbd className="kbd ml-auto !px-1 !py-0.5">⌘↵</kbd>
      </div>
    </div>
  );
}
