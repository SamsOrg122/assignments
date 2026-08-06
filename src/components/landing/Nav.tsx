"use client";

/**
 * Storefront navigation.
 *
 * Editorial rather than the usual floating glass pill: a full-width rule, the
 * wordmark set in the page's display serif, and links in small letterspaced
 * Geist. The two faces meet here first, which is the point — the bar is the
 * first thing that has to say what kind of thing this is.
 *
 * It rides transparent over the photograph and condenses on scroll: the height
 * drops, a hairline appears, and the backdrop frosts. Three small changes
 * rather than one big one, so it reads as the page settling rather than as a
 * bar swapping itself out.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#impact", label: "Impact" },
  { href: "#pricing", label: "Pricing" },
];

export function Nav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        lifted
          ? "border-b border-line bg-canvas/72 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex w-full max-w-[1240px] items-center gap-3 px-5 transition-[height] duration-300 sm:px-8",
          lifted ? "h-14" : "h-[72px]",
        )}
      >
        <Link href="/" className="group flex items-center gap-2.5 text-fg">
          {/* The same notched square the banner returns to. Drawn, not a
              lettered box: an initial in a rounded rectangle is the default
              every generated brand arrives wearing. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[19px] shrink-0 transition-transform duration-300 group-hover:rotate-90"
          >
            <path
              d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinejoin="round"
            />
          </svg>
          <span className="nav-wordmark text-[17px] leading-none tracking-[-0.01em]">
            Assignments
          </span>
        </Link>

        <ul className="ml-8 hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                // The underline grows from the left rather than fading in —
                // a rule that draws itself reads as a response to the pointer,
                // where an opacity change reads as a state flip.
                className="group relative block py-1 text-[12.5px] tracking-[0.01em] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-fg-muted transition-transform duration-300 ease-out group-hover:scale-x-100"
                />
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/library"
            className="hidden rounded-sm px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg sm:block"
          >
            Open Assignments
          </Link>
          <Link
            href="/library"
            className="group flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] text-fg transition-colors duration-200 hover:border-fg-subtle hover:bg-surface"
          >
            Start writing
            <Icon
              name="arrow-right"
              size={12}
              className="text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </nav>
    </header>
  );
}
