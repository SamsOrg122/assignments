/**
 * The browser, drawn, as the hero object.
 *
 * Not a screenshot. Version 0.1.0 is an unsigned early build and a photograph
 * of it is a picture of a rectangle; drawn, the sidebar stays legible at this
 * size and the start page can be made of the same colour the rest of the page
 * is made of.
 *
 * ── NOTHING IN HERE IS INVENTED ────────────────────────────────────────
 * Every label is something the browser actually has. The workspaces are real
 * (`session.fromPartition`, one per space), the assistant's tab is real and
 * really does carry its state in its colour, and the permission sheet is the
 * real one — one action, one question, a minute at a time. There are no
 * blocked-tracker counts and no speed scores, because this browser does not
 * have those and a dashboard of numbers nobody can check is the fastest way
 * to make a real product look fake.
 */

import { Arc, MiniGauge } from "./drawings";

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

const Grid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
  </svg>
);

const Spark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
    <path d="M19 3v3M17.5 4.5h3" strokeLinecap="round" />
  </svg>
);

const Shield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M12 3l7 3v6c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6z" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" />
  </svg>
);

const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export function Window() {
  return (
    <div className="window rise d4">
      <div
        className="window__frame"
        role="img"
        aria-label="The Tougather browser: workspaces down the left, the assistant working in a tab of its own, and a permission sheet asking before it touches one of yours."
      >
        <div className="chrome" aria-hidden="true">
          <div className="lights">
            <i />
            <i />
            <i />
          </div>
          <div className="tabs">
            <span className="tab" data-active>
              <i style={{ background: "var(--lilac)" }} />
              Annual report 2025
            </span>
            {/* The assistant's tab, wearing its state as a colour. Green is
                "analysing"; the other three are red, yellow and blue. */}
            <span className="tab">
              <i data-agent style={{ background: "#3f9e78" }} />
              Kim · analysing
            </span>
            <span className="tab">
              <i style={{ background: "var(--mint)" }} />
              Press release
            </span>
          </div>
          <div className="address">
            <Lock />
            tougather://app/library
          </div>
        </div>

        <div className="window__body">
          <aside className="sidebar" aria-hidden="true">
            <h4>Workspaces</h4>
            <span className="space" data-active>
              <i style={{ background: "var(--orchid)" }} />
              Work<b>3</b>
            </span>
            <span className="space">
              <i style={{ background: "var(--mint)" }} />
              Personal<b>6</b>
            </span>
            <span className="space">
              <i style={{ background: "var(--sky)" }} />
              Private<b>2</b>
            </span>
            <span className="gap" />
            <h4>Owned by an assistant</h4>
            <span className="space">
              <i style={{ background: "#3f9e78" }} />
              Kim<b>1</b>
            </span>
          </aside>

          <div className="stage">
            <div className="stage__in" aria-hidden="true">
              {/* The permission sheet, which is the screen this product is
                  actually about. */}
              <div className="panel grain">
                <span className="dot" style={{ left: "calc(50% - 3px)", top: 86 }} />
                <span
                  className="dot"
                  style={{ left: "calc(50% - 3px)", top: 170, width: 4, height: 4, boxShadow: "none" }}
                />
                <div className="kpi" data-top>
                  <h5>Kim would like to</h5>
                  <div className="num" data-said="">
                    read one of your tabs
                  </div>
                </div>
                <div className="kpi" data-top data-right style={{ paddingTop: 26 }}>
                  <h5>Which tab</h5>
                  <div className="num" data-said="small">
                    Annual report 2025
                  </div>
                </div>
                <div className="kpi">
                  <h5>Good for</h5>
                  <div className="num">
                    1<small>minute</small>
                  </div>
                </div>
                <div className="kpi" data-right>
                  <h5>Never asked for</h5>
                  <div className="num" data-said="small">
                    password or payment fields
                  </div>
                  <div className="slider">
                    <i />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="widget w-teal w-round grain">
                  <h5>Metered by us</h5>
                  <div className="num">0</div>
                  <span />
                  <Arc cx={131} cy={-70} r={118} from={225} to={315} dots={15} viewBox="0 0 262 70" />
                </div>
                <div className="widget w-orchid w-flex grain">
                  <h5>Its own tools</h5>
                  <MiniGauge />
                  <div className="num">
                    0<small>switched on</small>
                  </div>
                </div>
                <div className="widget w-citrus w-flex grain">
                  <h5>Sessions kept apart</h5>
                  <div className="num">
                    3<small>workspaces</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hung over the frame's edge, so the window reads as an object with
          something in front of it rather than a flat picture. */}
      <div className="dock" aria-hidden="true">
        <div className="dock__pill glass-dark">
          <span>
            <Grid />
          </span>
          <span>
            <Spark />
          </span>
          <span>
            <Shield />
          </span>
        </div>
        <div className="dock__round">
          <Plus />
        </div>
      </div>
    </div>
  );
}
