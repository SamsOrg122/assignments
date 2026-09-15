"use client";

/**
 * Everything on these pages arrives rather than being already there.
 *
 * One island, mounted once per page. Server components mark what should move
 * with `data-flow` and nothing else; this finds them, watches them, and lets
 * the stylesheet do the animating.
 *
 * ── THE RULE THIS IS BUILT AROUND ───────────────────────────────────────
 * Content is never hidden by CSS that is always on. The usual way to write
 * this — `[data-flow] { opacity: 0 }` in the stylesheet, revealed by script —
 * means that a script which fails to run leaves a page of invisible text. A
 * marketing page is the one page where that is fatal, because the reader has
 * no reason to reload and every reason to leave.
 *
 * So the hiding is done *by* the script, in the same tick it starts watching,
 * and only ever to elements it has proven are off screen. Nothing above the
 * fold is touched: it is already visible, it stays visible, and there is no
 * frame where it blinks out and fades back in. If this file never runs, the
 * page is simply the page.
 *
 * ── AND THE RULE UNDER THAT ONE ─────────────────────────────────────────
 * `prefers-reduced-motion` is not a softer animation here, it is none: the
 * observer is never armed, so no element is ever hidden and the whole thing
 * costs one media query and an early return.
 */

import { useEffect } from "react";

export function Flow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const seen = (el: Element) => {
      (el as HTMLElement).dataset.seen = "";
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          seen(entry.target);
          io.unobserve(entry.target);
        }
      },
      {
        /*
         * A twelfth of the screen of lead-in at the bottom, so a section
         * starts moving as its first line clears the edge rather than once
         * it is already being read. `threshold` is deliberately tiny: a tall
         * band can never be 25% visible on a laptop, and a threshold it
         * cannot reach is an element that never arrives.
         */
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.01,
      },
    );

    /*
     * Armed, or already here.
     *
     * The fold is measured once, at mount, against the element's own box. A
     * little past the bottom edge counts as here: something two pixels below
     * the crease would otherwise be hidden and then immediately revealed,
     * which is the blink this whole design exists to avoid.
     */
    const fold = window.innerHeight * 0.92;
    for (const el of document.querySelectorAll<HTMLElement>("[data-flow]")) {
      if (el.getBoundingClientRect().top < fold) {
        seen(el);
        continue;
      }
      el.dataset.flowArmed = "";
      io.observe(el);
    }

    return () => io.disconnect();
  }, []);

  return null;
}
