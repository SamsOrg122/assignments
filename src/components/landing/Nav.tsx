"use client";

/**
 * Storefront navigation.
 *
 * Transparent over the hero, frosting only once you've scrolled past it — the
 * glass should feel like a response to content sliding underneath, not a
 * permanent bar.
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
        "sticky top-0 z-50 transition-colors duration-200",
        lifted
          ? "border-b border-line bg-canvas/70 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-3 px-5 sm:px-8"
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[14px] font-medium tracking-[-0.01em] text-fg"
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-sm bg-fg text-[11px] font-semibold text-canvas"
          >
            A
          </span>
          Assignments
        </Link>

        <ul className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-sm px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/library"
            className="hidden rounded-sm px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors duration-150 hover:text-fg sm:block"
          >
            Open Assignments
          </Link>
          <Link
            href="/library"
            className="group flex items-center gap-1.5 rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-canvas transition-transform duration-150 hover:-translate-y-px"
          >
            Start writing
            <Icon
              name="chevron-right"
              size={12}
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </nav>
    </header>
  );
}
