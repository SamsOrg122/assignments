"use client";

/**
 * A dropdown in the storefront bar.
 *
 * Opens on click, not on hover. A hover menu is unreachable by keyboard, opens
 * by accident when the pointer crosses it on the way somewhere else, and on a
 * touch screen has no idea what to do with the first tap — the whole reason
 * this is a button.
 *
 * Everything the pattern owes a keyboard is here: Enter or Space or Down to
 * open, arrows and Home/End to walk it, Escape to close and hand focus back to
 * the button that opened it, Tab to leave, and a click anywhere else to
 * dismiss. `aria-expanded` says which state it is in and `aria-controls` says
 * what it controls, so a screen reader announces a closed menu as closed
 * rather than as a link that does nothing.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export interface NavMenuItem {
  href: string;
  label: string;
  /** One line under the label. Absent on the "everything" link at the top. */
  hint?: string;
}

export function NavMenu({
  label,
  items,
  lang,
}: {
  label: string;
  items: NavMenuItem[];
  /** The menu's own language, when it differs from the document's. */
  lang?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Close when the pointer goes elsewhere, or when focus leaves the menu
  // entirely — tabbing off the last item should not leave it hanging open.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  const links = () =>
    Array.from(
      wrap.current?.querySelectorAll<HTMLAnchorElement>("[data-menu-item]") ?? [],
    );

  const focusAt = (index: number) => {
    const all = links();
    if (!all.length) return;
    // Wraps at both ends, which is what a menu does and what a list of links
    // does not — the difference people feel without being able to name it.
    const at = (index + all.length) % all.length;
    all[at]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        // The menu has not rendered yet; focus on the next frame.
        requestAnimationFrame(() => focusAt(e.key === "ArrowDown" ? 0 : -1));
        return;
      }
      const all = links();
      const at = all.indexOf(document.activeElement as HTMLAnchorElement);
      focusAt(at + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (!open) return;
    if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      focusAt(-1);
    }
  };

  return (
    <div ref={wrap} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="group relative flex items-center gap-1 py-1 text-[12.5px] tracking-[0.01em] text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <span lang={lang}>{label}</span>
        <Icon
          name="chevron-down"
          size={10}
          className={cn(
            "text-fg-subtle transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -bottom-0.5 left-0 h-px w-full origin-left bg-fg-muted transition-transform duration-300 ease-out",
            open ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
          )}
        />
      </button>

      {open && (
        <div
          id={id}
          lang={lang}
          className="anim-pop absolute top-full left-0 z-50 mt-2 w-[268px] rounded-lg border border-line-strong bg-surface p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)]"
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  data-menu-item
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2.5 py-2 transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="block text-[12.5px] text-fg">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-subtle">
                      {item.hint}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
