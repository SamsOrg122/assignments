"use client";

/**
 * The close: one card for your machine, and every other build fanned beside it.
 *
 * ── WHY THIS SHAPE ──────────────────────────────────────────────────────
 * What was here was a frosted slab with a headline, two buttons and a line of
 * small print — the same closing card every product page ends with, and the
 * last thing somebody sees before deciding. It also hid the other four builds
 * behind a link called "Every build", which is the one question this section
 * exists to answer: *which file do I actually get?*
 *
 * So the ornament and the answer are the same object. The right panel is a
 * fan of words radiating from a pivot on its left edge, and each word is a
 * real download — the five artefacts `electron-builder` produces, read out of
 * `lib/browser.ts` rather than typed here, so a renamed target cannot leave a
 * pretty dead link on the homepage. The prettiest thing on the page is also
 * the most useful thing on it, which is the only way an ornament earns a
 * screen of height.
 *
 * ── THE TWO THINGS THAT ARE NOT DECORATION ──────────────────────────────
 * Every fact on the card is a fact: the version is `BROWSER_VERSION`, which a
 * check script pins to `browser/package.json`, and the size is measured from
 * the published release with a tenth of a percent of slack before the next
 * release fails. There is no rating and no download count, because we have
 * neither, and a five-star row under a 0.1.0 with no users is the exact kind
 * of invention the rest of this page is careful not to make.
 *
 * ── AND WHY EVERY WORD ON THE FAN IS WHITE ──────────────────────────────
 * The reference sets its words in white over a gradient that ends pale, and
 * the last third of them are barely there. This was built in ink first to
 * dodge that, which fixed the reading and lost the design: the panel is the
 * one moment of saturated colour at the end of the page, and black type on it
 * reads as a light card that happened to be tinted.
 *
 * The gradient is what was wrong, not the type. It runs violet to indigo now
 * and never lightens — the white wash that used to sit in its corner took
 * white to 4.2:1 and is gone — so white measures 5.7:1 at the lightest point
 * of the panel and better everywhere else. `contrast-floors.mjs` holds it
 * there, on the same 5.2 floor every other small ink in this product answers
 * to. One colour, and hierarchy from size alone, which is also what makes the
 * fan read as a single object rather than a list that has been decorated.
 */

import Link from "next/link";
import { BROWSER_VERSION, BUILDS, buildById } from "@/lib/browser";
import { usePlatform } from "./use-platform";

const ArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
  </svg>
);

/**
 * The ribbons behind the card.
 *
 * Three stroked circles, wildly off-centre and blurred to nothing, which is
 * what a lens does to a bright edge. Drawn rather than blobbed because a blob
 * is a soft disc and this wants an *arc* — a line with a direction, so the
 * eye is carried across the panel to the card instead of pooling behind it.
 */
const Ribbons = () => (
  <svg className="get__arcs" viewBox="0 0 600 600" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    {/* One centre, three radii. They were three centres, and at the panel's
        narrowest crop the arcs crossed each other in an X across the middle
        of the card — two highlighter strokes, not a sweep. Concentric, they
        stay parallel at every width the panel is ever cut to. */}
    <g fill="none" strokeLinecap="round">
      <circle cx="-70" cy="650" r="300" stroke="var(--orchid)" strokeWidth="9" opacity="0.4" />
      <circle cx="-70" cy="650" r="420" stroke="var(--lilac)" strokeWidth="18" opacity="0.85" />
      <circle cx="-70" cy="650" r="545" stroke="var(--sky)" strokeWidth="13" opacity="0.65" />
    </g>
  </svg>
);

export function Close() {
  const yours = buildById(usePlatform());

  return (
    <section className="section" id="download">
      <div className="wrap">
        <div className="get">
          {/* ── Your machine ─────────────────────────────────────────── */}
          <div className="get__paper" data-flow="lift">
            <Ribbons />

            <div className="get__say">
              <h2 className="h2">Take the browser.</h2>
              <p className="lede">
                Free, and it stays free. The assistant runs on the agent already signed in on
                your machine, so there is no key to paste and no account of ours in the way.
              </p>
            </div>

            {/* The card is a link end to end, so the whole thing is the
                target rather than the 42px circle on its right. */}
            <div className="get__hold">
              <a className="get__card" href={yours.href}>
                <span className="get__tile" aria-hidden="true" />
                <span className="get__meta">
                  <span className="get__name">Tougather</span>
                  <span className="get__line">A desktop browser with assistants in it.</span>
                  <span className="get__facts">
                    {BROWSER_VERSION} · {yours.label}
                    {yours.note ? ` ${yours.note}` : ""} · {yours.size}
                  </span>
                </span>
                <span className="get__go" aria-hidden="true">
                  <ArrowDown />
                </span>
              </a>
            </div>
          </div>

          {/* ── Every other machine ──────────────────────────────────── */}
          <div className="get__fan" data-flow="lift" style={{ ["--fi" as string]: 1 }}>
            {/* The pivot the words swing from. Paper-coloured, half of it
                outside the panel, so it reads as a hinge in the gap between
                the two panels rather than as a dot drawn on one of them. */}
            <span className="get__pivot" aria-hidden="true" />

            <ul className="get__rays">
              {BUILDS.map((build, i) => (
                <li
                  key={build.id}
                  className="get__ray"
                  /* The angle is an index, not a degree: the step and the
                     radius are CSS, so the fan can close up on a narrow
                     screen without this file knowing about breakpoints. */
                  style={{ ["--i" as string]: i - (BUILDS.length - 1) / 2 }}
                >
                  {/* Stacked, not strung along the ray. Inline, "Windows ·
                      installs without admin rights · 86 MB" was 480px of
                      nowrap hanging off a pivot on the left edge, so the
                      long rays ran out of panel and the short ones left
                      half of it empty. Stacked, a ray is as wide as its
                      widest line and the fan can be pushed out to where it
                      fills the shape. */}
                  <a href={build.href}>
                    <span className="get__plat">{build.label}</span>
                    <span className="get__sub">
                      {build.note ? `${build.note} · ` : ""}
                      {build.size}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="cta__note">
          Version {BROWSER_VERSION}. Unsigned —{" "}
          <Link href="/download" style={{ textDecoration: "underline" }}>
            what that means on first run
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
