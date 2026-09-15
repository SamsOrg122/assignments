/**
 * What Tougather is, and what it does that the others do not.
 *
 * ── THE TWO SECTIONS A LANDING PAGE ACTUALLY NEEDS ──────────────────────
 * Somebody who has never heard of this arrives with two questions and leaves
 * if either goes unanswered in the first screen and a half: *what is it* and
 * *why this one*. The page used to answer the first obliquely — a headline, a
 * drawing, and five feature cards a thousand pixels down — and the second not
 * at all, except as one claim about billing buried in the middle.
 *
 * So: a strip that says the whole product in three nouns, and then the
 * comparison, done as a comparison rather than as a list of our own virtues.
 *
 * ── WHY IT IS SAFE TO NAME WHAT THE OTHERS DO ───────────────────────────
 * The left column of that table describes a *category*, never a company. "A
 * credit meter" and "your text on their server" are what an AI browser that
 * resells model calls has to do — it is the shape of that business, not an
 * accusation about anybody's implementation, and there is no product named
 * anywhere on this page. The right column is the part that has to be
 * defensible, and every row of it carries the file that makes it true.
 */

import Link from "next/link";
import { Mark } from "./Chrome";

/* ═══════════════════════════════════════════════════════════════════════
   What it is
   ═══════════════════════════════════════════════════════════════════════ */

const PILLARS = [
  {
    hue: "var(--sky)",
    name: "A browser",
    line: "Tabs in a sidebar, two pages side by side, and workspaces that keep their logins apart without incognito.",
  },
  {
    hue: "var(--lilac)",
    name: "A workspace",
    line: "Documents, decks, boards, code and your team's chat in one window, on one document model — one keystroke from whatever you were reading.",
  },
  {
    hue: "var(--mint)",
    name: "An assistant",
    line: "Give it a job and it works in its own tab while you keep going in yours, thinking on the plan you already pay for.",
  },
];

export function What() {
  return (
    <section className="section" id="what">
      <div className="wrap">
        <div className="what">
          <p className="what__line" data-flow>
            Tougather is one window with{" "}
            <em>a browser</em>, <em>a workspace</em> and <em>an assistant</em> in it — and the
            assistant is the only one of the three that usually costs extra. Here it does not.
          </p>

          <ul className="what__grid">
            {PILLARS.map((p, i) => (
              <li
                key={p.name}
                className="what__cell"
                data-flow
                style={{ ["--fi" as string]: i, ["--hue" as string]: p.hue }}
              >
                <span className="what__dot" aria-hidden="true" />
                <h3>{p.name}</h3>
                <p>{p.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Why this one
   ═══════════════════════════════════════════════════════════════════════ */

interface Row {
  /** The question a reader is actually asking. */
  ask: string;
  /** What an AI browser that resells model calls has to do about it. */
  them: string;
  /** What this one does instead. */
  us: string;
  /** The file that makes the right-hand cell true. */
  tag: string;
}

const ROWS: Row[] = [
  {
    ask: "Who pays for the thinking",
    them: "They buy the model calls and resell them to you, so every one of them arrives with a credit meter and a second subscription.",
    us: "The browser starts the agent already signed in on your machine. We never make the call, so there is nothing to meter and no key of ours in the download.",
    tag: "browser/lib/agent.js",
  },
  {
    ask: "Where your words go",
    them: "The page you are reading is uploaded so their model can see it. Your draft is on their server, under their retention policy.",
    us: "Nothing passes our servers. The app is served from inside the download and only /api goes out, which is the billing side and knows nothing about your tabs.",
    tag: "browser/lib/app-schema.js",
  },
  {
    ask: "What it is allowed to touch",
    them: "An assistant that drives your screen, or a sidebar with standing access to every tab you have open.",
    us: "It works in its own empty workspace. Anything that touches a tab of yours asks, every single time, for one minute — and never on a password or a payment field.",
    tag: "browser/lib/toestemming.js",
  },
  {
    ask: "Keeping two accounts apart",
    them: "Incognito, a second profile, or a second browser — and whichever you pick, you are signed out of the thing you actually needed.",
    us: "A workspace is a session. Signed in to work in one and to your own account in another, at the same time, and a private one keeps nothing at all.",
    tag: "browser/main.js",
  },
  {
    ask: "What it admits about itself",
    them: "A page of features.",
    us: "Version 0.1.0, unsigned, with no updater and no DRM video — written on the download page rather than discovered by you on first run.",
    tag: "src/lib/browser.ts",
  },
];

export function Why() {
  return (
    <section className="section section--dark" id="browser">
      <div className="wrap">
        <div className="section__head">
          <h2 className="h2" data-flow>
            Every other AI browser sells you the model twice.
          </h2>
          <p className="lede" data-flow style={{ ["--fi" as string]: 1 }}>
            They buy the calls and resell them, which is why they all arrive with a credit meter.
            We never make the call — so there is nothing to meter, nothing to mark up, and nothing
            of yours on a server of ours. Five differences, and the file that makes each one true.
          </p>
        </div>

        {/*
          * A table of five rows, built out of divs.
          *
          * It is a comparison and not tabular data: there is no header row
          * worth reading out, no cell anybody would sort by, and on a phone
          * each row has to become a little stack. A `<table>` would have to be
          * fought into that shape and would tell a screen reader it had found
          * a spreadsheet. The list is the honest markup, and each row is
          * announced as the question it answers.
          */}
        <ul className="vs">
          <li className="vs__legend" aria-hidden="true">
            <span className="vs__ask" />
            <span className="vs__them">Every other AI browser</span>
            <span className="vs__us">
              <Mark />
              Tougather
            </span>
          </li>

          {ROWS.map((row, i) => (
            <li className="vs__row" key={row.ask} data-flow style={{ ["--fi" as string]: i }}>
              <h3 className="vs__ask">{row.ask}</h3>
              <p className="vs__them">
                <span className="vs__mark vs__mark--them" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </span>
                {row.them}
              </p>
              <div className="vs__us">
                <p>
                  <span className="vs__mark vs__mark--us" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  </span>
                  {row.us}
                </p>
                <span className="tag">{row.tag}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="vs__foot" data-flow>
          Every file above is in this repository, and the one number on this page nobody can check
          from it — what a build weighs — is measured from the published release by a script that
          fails the next one if it has drifted.{" "}
          <Link href="/download">See what is still missing</Link>.
        </p>
      </div>
    </section>
  );
}
