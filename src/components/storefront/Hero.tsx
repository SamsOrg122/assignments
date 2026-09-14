/**
 * The hero: a headline, a button, and the product itself.
 *
 * The aside sits at the *bottom* of the grid rather than beside the middle of
 * the headline. That one alignment is most of why this reads as designed
 * rather than assembled: the baseline of the last line of the headline and
 * the baseline of the paragraph agree, so two very different sizes of type
 * share an edge.
 */

import Link from "next/link";
import { DownloadButton, BuildNote } from "./Chrome";
import { Window } from "./Window";
import { BROWSER_VERSION } from "@/lib/browser";

export function Hero() {
  return (
    <section className="hero">
      {/* Five discs, masked out three-quarters down. The mask is what keeps
          this from becoming the wash it replaced: the colour belongs to the
          top of the page, and then the paper takes over. */}
      <div className="hero__bg" aria-hidden="true">
        <span className="blob" style={{ width: 620, height: 520, left: "52%", top: "32%", background: "var(--orchid)", animationDelay: "-4s" }} />
        <span className="blob" style={{ width: 560, height: 520, left: "68%", top: "56%", background: "var(--tangerine)", opacity: 0.65, animationDelay: "-11s" }} />
        <span className="blob" style={{ width: 640, height: 560, left: "-6%", top: "44%", background: "var(--lilac)", animationDelay: "-19s" }} />
        <span className="blob" style={{ width: 520, height: 480, left: "12%", top: "74%", background: "var(--sky)", opacity: 0.7, animationDelay: "-7s" }} />
        <span className="blob" style={{ width: 420, height: 420, left: "36%", top: "84%", background: "var(--mint)", animationDelay: "-15s" }} />
      </div>

      <div className="wrap">
        <div className="hero__head">
          <div>
            <span className="eyebrow glass rise d1">
              <i />
              Tougather {BROWSER_VERSION} — macOS, Windows and Linux
            </span>
            <h1 className="rise d2">
              <span>A browser</span>
              <span>that works</span>
              <span>while you do.</span>
            </h1>
          </div>
          <div className="hero__aside rise d3">
            <p>
              Give the assistant a job and it opens its own tab and gets on with it, while you keep
              working in yours. It thinks on your own subscription, so nothing is metered.
            </p>
            <div className="hero__actions">
              <DownloadButton ink />
              <Link className="btn btn--glass glass" href="/download">
                What to expect on first run
              </Link>
            </div>
            <BuildNote className="hero__note" />
          </div>
        </div>

        <Window />
      </div>
    </section>
  );
}
