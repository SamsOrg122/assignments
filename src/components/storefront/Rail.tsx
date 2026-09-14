/**
 * What sits beside a guide.
 *
 * A 68-character column on a 1200-pixel page leaves half the screen empty,
 * and the two ways out are to narrow the page or to put something in the gap.
 * Narrowing it loses the two-column head, which is the thing that makes these
 * pages look like the rest of the site — so the gap gets the one object that
 * genuinely belongs next to a guide about getting work done in a browser.
 *
 * It is not a banner and it does not follow you down the page shouting. It is
 * a card that stays put while the prose moves past it, with the same button
 * the home page has and the same honest size next to it.
 */

import Link from "next/link";
import { Mark, DownloadButton, BuildNote } from "./Chrome";

export function Rail() {
  return (
    <aside className="rail">
      <div className="rail__card">
        <span className="brand">
          <Mark />
          Tougather
        </span>
        <p>
          A browser with assistants in it. Give one a job and it works in its own
          tab while you keep going in yours — on your own subscription, so
          nothing is metered.
        </p>
        <DownloadButton />
        <BuildNote className="rail__note" />
      </div>

      <div className="rail__card">
        <p style={{ marginTop: 0 }}>
          Everything on this page works on the free plan. No login, nothing to
          install first, and nothing to cancel.
        </p>
        <p className="rail__note" style={{ marginTop: 10 }}>
          <Link
            href="/pricing"
            className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
          >
            What the paid plan adds
          </Link>
        </p>
      </div>
    </aside>
  );
}
