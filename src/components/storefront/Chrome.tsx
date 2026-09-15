"use client";

/**
 * The nav and the download button — the two things that need the browser.
 *
 * Everything else on this page is static markup. These two are not: the bar
 * frosts once there is something behind it, and the button has to know which
 * of five files you want.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildById } from "@/lib/browser";
import { usePlatform } from "./use-platform";

/** The wordmark: a conic sweep of the whole palette with a hole in it. */
export function Mark() {
  return <span className="mark" aria-hidden="true" />;
}

/*
 * Four, and the first one leaves the page.
 *
 * It used to be two anchors into the landing page and two links out of it,
 * which meant the only route to the page that explains the product properly
 * was the footer — from a site whose first screen is a slogan. "What it is"
 * goes first because it is the question, and the `#workspace` anchor it
 * replaces still exists for anything already pointing at it.
 */
const LINKS = [
  { href: "/about", label: "What it is" },
  { href: "/#browser", label: "Why this one" },
  { href: "/impact", label: "Impact" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Passive: this runs on every scroll frame and must never be the reason
    // the page cannot scroll smoothly.
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="nav">
      <nav className="nav__bar glass" aria-label="Main" {...(scrolled ? { "data-scrolled": "" } : {})}>
        <Link className="brand" href="/">
          <Mark />
          Tougather
        </Link>
        <div className="nav__links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
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
