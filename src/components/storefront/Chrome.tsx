"use client";

/**
 * The nav and the download button — the two things that need the browser.
 *
 * ── WHY THE NAV LOOKS LIKE THIS ─────────────────────────────────────────
 * It was a floating white pill with four links in it, which is the nav every
 * product site has had since about 2021. The hero underneath it draws this
 * product's own window; the bar above it may as well be that window's chrome.
 *
 * So the links are tabs, each with a coloured dot the way a workspace row in
 * the product has one, and the tab you are on is marked by a pill that slides
 * between them — following the pointer while you are choosing and settling
 * back on where you actually are when you stop. The wordmark's conic sweep
 * gains a ring that fills as you scroll, so the logo is doing a job rather
 * than sitting there. And the bar contracts as you leave the top of the page:
 * wide and open over the hero, tight and frosted once there is something
 * behind it.
 *
 * None of that is load-bearing. The tabs are links, they work with the script
 * dead, and the sliding pill is an `::after` with two custom properties on
 * it — every state it can be in is also written as `aria-current` on the tab
 * itself, so the colour and the movement are reinforcement and never the only
 * thing saying where you are.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildById } from "@/lib/browser";
import { usePlatform } from "./use-platform";

/** The wordmark: a conic sweep of the whole palette with a hole in it. */
export function Mark() {
  return <span className="mark" aria-hidden="true" />;
}

/**
 * The four destinations, and the hue each one wears.
 *
 * `match` is what makes a tab the current one: a path prefix for the pages,
 * and for the one anchor, the id of the band it points at — which the scroll
 * spy below resolves against what is actually on screen.
 */
const LINKS = [
  { href: "/about", label: "What it is", hue: "var(--sky)", match: "/about" },
  { href: "/#browser", label: "Why this one", hue: "var(--lilac)", section: "browser" },
  { href: "/impact", label: "Impact", hue: "var(--mint)", match: "/impact" },
  { href: "/pricing", label: "Pricing", hue: "var(--orchid)", match: "/pricing" },
];

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [section, setSection] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);

  /*
   * One passive listener, read inside a frame.
   *
   * Scroll fires far more often than the screen redraws, and both numbers it
   * produces here are purely visual — so they are sampled once per frame and
   * the handler itself does nothing but ask for one.
   */
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const doc = document.documentElement;
      const span = doc.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 24);
      setProgress(span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  /*
   * Which band you are reading, for the one tab that points at one.
   *
   * A band counts as current while its top is in the upper half of the
   * window: reaching a section is what makes it current, not scrolling past
   * the middle of it, and a tall band would never pass a centre test at all.
   */
  useEffect(() => {
    const target = document.getElementById("browser");
    if (!target) {
      // A microtask, which is this repository's convention for a first-commit
      // state write: setting state straight from an effect body cascades a
      // render, and the lint says so.
      void Promise.resolve().then(() => setSection(null));
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setSection(entry.isIntersecting ? "browser" : null),
      { rootMargin: "-10% 0px -50% 0px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [pathname]);

  const activeIndex = LINKS.findIndex((l) =>
    l.match ? pathname === l.match || pathname.startsWith(`${l.match}/`) : l.section === section,
  );
  const lit = hovered ?? (activeIndex >= 0 ? activeIndex : null);

  /*
   * Where the pill goes.
   *
   * Measured from the tab itself rather than computed from a guess at its
   * width, because the labels are words and words are not the same length in
   * two languages. Layout effect, so the first paint already has it in the
   * right place instead of snapping there.
   */
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const place = useCallback(() => {
    const box = tabsRef.current;
    if (!box || lit === null) return setPill(null);
    const tab = box.children[lit] as HTMLElement | undefined;
    if (!tab) return setPill(null);
    setPill({ x: tab.offsetLeft, w: tab.offsetWidth });
  }, [lit]);

  useLayoutEffect(place, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  return (
    <header className="nav">
      <nav
        className="nav__bar"
        aria-label="Main"
        style={{ ["--p" as string]: progress }}
        {...(scrolled ? { "data-scrolled": "" } : {})}
      >
        <Link className="brand" href="/">
          <span className="brand__mark">
            <Mark />
            {/* The ring. Two pixels of coral that close as the page does. */}
            <span className="brand__ring" aria-hidden="true" />
          </span>
          Tougather
        </Link>

        <div
          className="nav__tabs"
          ref={tabsRef}
          onMouseLeave={() => setHovered(null)}
          data-lit={pill ? "" : undefined}
          style={pill ? { ["--tx" as string]: `${pill.x}px`, ["--tw" as string]: `${pill.w}px` } : undefined}
        >
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              aria-current={i === activeIndex ? "page" : undefined}
              style={{ ["--hue" as string]: l.hue }}
            >
              <i aria-hidden="true" />
              {l.label}
            </Link>
          ))}
        </div>

        <div className="nav__cta">
          <Link className="link" href="/signin">
            Sign in
          </Link>
          <DownloadButton small />
        </div>
      </nav>
    </header>
  );
}

const ArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
  </svg>
);

export function DownloadButton({ small = false, ink = false }: { small?: boolean; ink?: boolean }) {
  const build = buildById(usePlatform());
  return (
    <a
      className={`btn ${ink ? "btn--ink" : "btn--coral"}${small ? " btn--sm" : ""}`}
      href={build.href}
    >
      <ArrowDown />
      {small ? "Download" : `Download for ${build.label}`}
    </a>
  );
}

/** The size and platform, said in words, under the button. */
export function BuildNote({ className }: { className?: string }) {
  const build = buildById(usePlatform());
  return (
    <p className={className}>
      Free · {build.size} · nothing to sign up for
    </p>
  );
}
