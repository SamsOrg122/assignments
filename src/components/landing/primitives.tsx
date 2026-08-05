"use client";

/**
 * Storefront primitives.
 *
 * The landing page is allowed more expression than the app, but not a second
 * design system. These are the few shared pieces everything else composes
 * from, so the expressive bits stay consistent with each other.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

/* ── Section scaffolding ────────────────────────────────── */

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      // Anchored sections need to clear the sticky nav when jumped to.
      className={cn("relative scroll-mt-20 px-5 sm:px-8", className)}
    >
      <div className="mx-auto w-full max-w-[1120px]">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-subtle">
      <span
        aria-hidden="true"
        className="h-px w-6 bg-linear-to-r from-transparent to-line-strong"
      />
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "centre";
}) {
  return (
    <div className={cn("max-w-[62ch]", align === "centre" && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="headline mt-3 text-[clamp(28px,4.4vw,46px)] font-medium text-balance">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-[clamp(15px,1.6vw,17.5px)] leading-relaxed text-fg-muted text-pretty">
          {lead}
        </p>
      )}
    </div>
  );
}

/* ── Glass ──────────────────────────────────────────────── */

export function Glass({
  children,
  className,
  soft = false,
  as: Tag = "div",
}: {
  children?: React.ReactNode;
  className?: string;
  soft?: boolean;
  as?: "div" | "figure" | "aside" | "li";
}) {
  return (
    <Tag className={cn(soft ? "glass-soft" : "glass", "rounded-lg", className)}>
      {children}
    </Tag>
  );
}

/* ── Buttons ────────────────────────────────────────────── */

export function CTA({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-medium transition-all duration-150",
        variant === "primary"
          ? "bg-fg text-canvas shadow-[0_8px_28px_-10px_rgba(255,255,255,0.32)] hover:-translate-y-px hover:shadow-[0_12px_34px_-10px_rgba(255,255,255,0.42)]"
          : "glass-soft text-fg hover:border-line-strong",
        className,
      )}
    >
      {children}
      <Icon
        name="chevron-right"
        size={13}
        className="transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/* ── Leaf ───────────────────────────────────────────────── */

/**
 * The impact mark. One filled leaf with a vein — drawn as a single closed
 * shape rather than a stem line plus blades, which fills into something that
 * reads as a tick.
 */
export function Leaf({
  size = 12,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
    >
      <path
        d="M13.4 2.6c.5 4.6-1 7.6-3.4 9C8.2 12.6 6 12.5 4.6 11.6 3.2 10.7 2.7 9 3.4 7.4 4.4 5 7.4 3.2 13.4 2.6Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <path
        d="M12.2 3.9C9 5.3 6.2 8.2 4.4 12.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
    </svg>
  );
}

/* ── Honesty markers ────────────────────────────────────── */

/**
 * The single most important component on this page.
 *
 * Every figure that isn't yet confirmed wears one of these. It is deliberately
 * visible rather than a footnote: a page that marks its own unverified numbers
 * is far more believable than one that presents all of them with equal
 * confidence. When the founder flips a status in the config, the marker
 * vanishes on its own.
 */
export function Provisional({
  note,
  className,
}: {
  note?: string;
  className?: string;
}) {
  return (
    <span
      title={note}
      className={cn(
        "ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-xs border border-warn/35 bg-warn/10 px-1.5 py-0.5 align-middle text-[10px] leading-none font-medium text-warn",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1 rounded-full bg-warn" />
      provisional
      <span className="sr-only">
        {note ? ` — ${note}` : " — this figure is not yet confirmed."}
      </span>
    </span>
  );
}

/* ── Reveal on scroll ───────────────────────────────────── */

/**
 * Fades content in once, when it first comes near the viewport. Content is
 * present in the DOM from the start — only opacity moves — so nothing depends
 * on JavaScript to be readable or crawlable, and reduced-motion users get it
 * immediately (the CSS neutralises the transform).
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // No observer means no way to know when this scrolls in, so show it at
    // once. Written straight to the DOM rather than through state: content
    // must never be able to stay invisible, and a render pass isn't needed
    // to say so.
    if (!("IntersectionObserver" in window)) {
      node.dataset.shown = "true";
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      data-shown={shown || undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
