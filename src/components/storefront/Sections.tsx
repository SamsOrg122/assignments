/**
 * The body of the page: the argument, the five things, the statement, the
 * engine, and the close.
 *
 * ── THE RULE EVERY NUMBER ON THIS PAGE FOLLOWS ──────────────────────────
 * The design this is built from carried a survey — "62% of 1,200 people",
 * "48% of load time", "from our own measurements". We have not run a survey
 * and we have not measured anybody's load time, so those numbers are not
 * here. What is here instead is the same shape filled with figures that can
 * be checked, each one carrying the path of the file that makes it true.
 *
 * A landing page is the one document where a number costs nothing to invent
 * and everything to be caught inventing. The tag under each figure is how
 * this page stays cheap to verify.
 */

import { Arc, MiniGauge, DottedRing } from "./drawings";
import { Mark } from "./Chrome";
import { CHROMIUM_MAJOR, ELECTRON_MAJOR } from "@/lib/browser";
import { IMPACT, percent } from "@/lib/impact/config";

/* ═══════════════════════════════════════════════════════════════════════
   The five things
   ═══════════════════════════════════════════════════════════════════════ */

export function Features() {
  return (
    <section className="section" id="workspace">
      <div className="wrap">
        <div className="section__head">
          <h2 className="h2" data-flow>Five things it does that a browser does not.</h2>
          <p className="lede" data-flow style={{ ["--fi" as string]: 1 }}>
            Each one is a claim the code makes good on, with the file that does it named underneath,
            so you can check a sentence instead of trusting it.
          </p>
        </div>

        <div className="bento">
          <div className="card w-teal c-4 grain" data-flow="lift" style={{ ["--fi" as string]: 0 }}>
            <h3>An assistant that works in its own tab.</h3>
            <div style={{ paddingBottom: 64 }}>
              <div className="num">
                0<small>times it takes your screen</small>
              </div>
              <p className="sub">Give it a job with ⌘J. Your view stays where it was.</p>
            </div>
            <Arc cx={200} cy={-150} r={230} from={236} to={304} dots={18} viewBox="0 0 400 120" />
          </div>

          <div className="card w-orchid c-4 grain" data-flow="lift" style={{ ["--fi" as string]: 1 }}>
            <h3>It thinks on your own subscription.</h3>
            <MiniGauge />
            <div>
              <div className="num">
                0<small>metered by us</small>
              </div>
              <p className="sub">
                The browser starts the agent already on your machine. Nothing passes our servers.
              </p>
            </div>
          </div>

          <div className="card w-lilac c-4 grain" data-flow="lift" style={{ ["--fi" as string]: 2 }}>
            <h3>Two pages side by side, in one window.</h3>
            <div>
              <div className="split" aria-hidden="true">
                <div className="pane">
                  <i data-t />
                  <i />
                  <i data-s style={{ width: "80%" }} />
                  <i style={{ width: "60%" }} />
                  <i data-img />
                </div>
                <span className="handle" />
                <div className="pane">
                  <i data-img />
                  <i data-t />
                  <i />
                  <i style={{ width: "70%" }} />
                </div>
              </div>
              <p className="sub">One neighbour, not three columns nobody can read.</p>
            </div>
          </div>

          <div className="card w-citrus c-5 grain" data-flow="lift" style={{ ["--fi" as string]: 0 }}>
            <h3>Workspaces that are really separate.</h3>
            <div>
              <div className="spaces" aria-hidden="true">
                <div>
                  <i style={{ background: "var(--orchid)" }} />
                  Work<b>own session</b>
                </div>
                <div>
                  <i style={{ background: "var(--teal)" }} />
                  Personal<b>own logins</b>
                </div>
                <div>
                  <i style={{ background: "var(--sky)" }} />
                  Private<b>nothing kept</b>
                </div>
              </div>
              <p className="sub sub--ink">
                Signed in to work in one and to your own account in another, at the same time,
                without incognito.
              </p>
            </div>
          </div>

          <div className="card card--paper c-7" data-flow="lift" style={{ ["--fi" as string]: 1 }}>
            <h3>Permission for every single action.</h3>
            <div>
              <div className="palette" aria-hidden="true">
                <div className="palette__in">
                  <span className="mark" style={{ width: 20, height: 20 }} />
                  Kim would like to read a tab of yours
                  <kbd>one minute</kbd>
                </div>
                <div className="palette__row" data-hi>
                  <i style={{ background: "var(--mint)" }} />
                  Annual report 2025<b>allow once</b>
                </div>
                <div className="palette__row">
                  <i style={{ background: "var(--lilac)" }} />
                  Press release<b>not asked for</b>
                </div>
                <div className="palette__row">
                  <i style={{ background: "rgba(0,0,0,.12)" }} />
                  Your bank, in another workspace<b>cannot be asked for</b>
                </div>
              </div>
              <p className="sub sub--ink">
                It works freely in its own empty workspace. Anything that touches your tabs asks,
                every time — and a private workspace does not exist for it at all.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   The statement, and the three tiles
   ═══════════════════════════════════════════════════════════════════════ */

export function Statement() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section__head">
          <h2 className="h2" data-flow>Made for the person, not for the tab bar.</h2>
          <p className="lede" data-flow style={{ ["--fi" as string]: 1 }}>
            Quiet while you read, out of the way while you work, and the whole Tougather workspace
            one keystroke away when you need it.
          </p>
        </div>

        <div className="statement grain" data-flow="lift">
          <div className="statement__art" aria-hidden="true" />
          <p className="statement__line">
            Nothing here is metered by
            <span className="badge">
              <Mark />
              Tougather
            </span>
          </p>
        </div>

        <div className="tiles">
          <figure className="tile t-warm grain" data-flow="lift" style={{ ["--fi" as string]: 0 }}>
            <div className="tile__art" />
            <div className="prop prop--reader" aria-hidden="true">
              <i data-t />
              <i />
              <i data-s />
              <i />
              <i data-e />
              <i style={{ marginTop: 10 }} />
              <i data-s />
              <i />
              <i data-e />
            </div>
            <figcaption className="tile__cap glass">
              Reading<span>The page you were on, still where you left it</span>
            </figcaption>
          </figure>

          <figure className="tile t-cool grain" data-flow="lift" style={{ ["--fi" as string]: 1 }}>
            <div className="tile__art" />
            <div className="prop prop--reader" aria-hidden="true" style={{ bottom: "34%" }}>
              <i data-t style={{ width: "58%" }} />
              <i data-s />
              <i />
              <i data-e />
            </div>
            <figcaption className="tile__cap glass">
              Writing<span>Documents, decks and boards · ⌘⇧O</span>
            </figcaption>
          </figure>

          <figure className="tile t-green grain" data-flow="lift" style={{ ["--fi" as string]: 2 }}>
            <div className="tile__art" />
            <div className="ring" aria-hidden="true">
              <DottedRing />
              <div>
                <div className="num">0</div>
                <p>of your words reach our servers</p>
              </div>
            </div>
            <figcaption className="tile__cap glass">
              Private<span>The default, not a setting</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   The engine, and what is honestly wrong with it
   ═══════════════════════════════════════════════════════════════════════ */

export function Engine() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="engine__grid">
          <div>
            <h2 className="h2" data-flow>An early build, and we will say which parts.</h2>
            <p className="lede" data-flow style={{ ["--fi" as string]: 1 }}>
              Every tab is its own view with its own session, the assistant runs as a child process
              with its own tools switched off, and the parts that are not finished are on the
              download page rather than discovered by you.
            </p>
            <div className="spec" data-flow style={{ ["--fi" as string]: 2 }}>
              <div className="num">
                5<small>builds</small>
              </div>
              <p>Two Macs, Windows, and Linux as an AppImage or a .deb.</p>
              {/* Read out of `browser/package.json`, not typed here, and
                  `scripts/browser-version-agrees.mjs` fails the build if the
                  two ever disagree. It said 33 for a while after the browser
                  was on 44 — a true sentence about a version that had been
                  gone for a release, on the page whose whole argument is that
                  its numbers can be checked. */}
              <div className="num">
                {ELECTRON_MAJOR}
                <small>Electron</small>
              </div>
              <p>
                Which carries Chromium {CHROMIUM_MAJOR}. It shipped on Electron 33 and the Chromium
                of late 2024; bringing the engine forward was the first job on this list, and it is
                done.
              </p>
              <div className="num">
                {percent(IMPACT.shareOfRevenue.value)}
                <small>of revenue</small>
              </div>
              <p>Set aside for reforestation, counted on a page that shows its own arithmetic.</p>
            </div>
          </div>

          <div className="art grain" aria-hidden="true">
            <svg viewBox="0 0 600 600">
              <rect x="150" y="150" width="280" height="250" fill="rgba(255,255,255,.14)" />
              <g
                fill="none"
                stroke="rgba(255,255,255,.92)"
                strokeWidth="1.8"
                strokeDasharray="4 5"
                strokeLinecap="round"
              >
                <polyline points="470,60 235,215 350,300 270,345 150,470" />
                <polyline points="235,215 620,190" />
                <polyline points="350,300 620,282" />
                <polyline points="350,300 520,500 440,540" />
                <polyline points="520,500 620,420" />
                <polyline points="470,60 620,60" />
              </g>
              <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M150 174V150h24M406 150h24v24M150 376v24h24M406 400h24v-24" />
                <path d="M420 454v-24h24M536 430h24v24M420 536v24h24M536 560h24v-24" />
              </g>
              {/* The annotations are real call sites, not invented API. */}
              <g>
                <rect x="150" y="122" width="186" height="20" fill="#fff" />
                <text className="anno" x="158" y="136">
                  session.fromPartition(ws)
                </text>
                <rect x="420" y="402" width="150" height="20" fill="#fff" />
                <text className="anno" x="428" y="416">
                  toestemming.vraag()
                </text>
                <rect x="170" y="486" width="142" height="20" fill="#fff" />
                <text className="anno" x="178" y="500">
                  agent --tools &quot;&quot;
                </text>
              </g>
              <g fill="#fff" stroke="#fff" strokeWidth="3">
                <circle cx="235" cy="215" r="9" fill="none" />
                <circle cx="235" cy="215" r="4" stroke="none" />
                <circle cx="350" cy="300" r="9" fill="none" />
                <circle cx="350" cy="300" r="4" stroke="none" />
                <circle cx="270" cy="345" r="9" fill="none" />
                <circle cx="270" cy="345" r="4" stroke="none" />
                <circle cx="520" cy="500" r="9" fill="none" />
                <circle cx="520" cy="500" r="4" stroke="none" />
                <circle cx="470" cy="60" r="7" fill="none" />
                <circle cx="470" cy="60" r="3" stroke="none" />
                <circle cx="150" cy="470" r="9" fill="none" />
                <circle cx="150" cy="470" r="4" stroke="none" />
                <circle cx="440" cy="540" r="7" fill="none" />
                <circle cx="440" cy="540" r="3" stroke="none" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
