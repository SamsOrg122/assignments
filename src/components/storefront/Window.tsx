"use client";

/**
 * The browser, drawn, as the hero object — and playing.
 *
 * Not a screenshot. Version 0.1.0 is an unsigned early build and a photograph
 * of it is a picture of a rectangle; drawn, the sidebar stays legible at this
 * size and the start page can be made of the same colour the rest of the page
 * is made of.
 *
 * ── WHY IT MOVES NOW ────────────────────────────────────────────────────
 * Still, it was a diagram of the product: everything in it was true and none
 * of it was happening. The one thing this browser does that needs showing
 * rather than describing is the shape of a job — you ask, a tab appears that
 * is not yours, it asks before it reaches into one that is, you answer, it
 * works while you carry on. That is four states and a pointer, and it is the
 * difference between a picture of a browser and a browser.
 *
 * ── NOTHING IN HERE IS INVENTED ────────────────────────────────────────
 * Every label is something the browser actually has, and so is every beat of
 * the sequence. The workspaces are real (`session.fromPartition`, one per
 * space), the assistant really does get a tab and a workspace of its own with
 * no logins in it, its tab really does carry its state in its colour, and the
 * sheet is the real one — one action, one question, a minute at a time,
 * never on a password or a payment field. There are no blocked-tracker counts
 * and no speed scores, because this browser does not have those and a
 * dashboard of numbers nobody can check is the fastest way to make a real
 * product look fake.
 *
 * ── AND WHOSE POINTER THAT IS ───────────────────────────────────────────
 * Yours. The assistant in this product never takes your screen and never
 * drives your mouse — the page says so two sections down, with the file — so
 * a demo in which it moved a cursor around would be contradicting the
 * product's own promise in its first screen. The pointer here does the one
 * thing a person does in this flow: it answers the question. The label
 * trailing it is the recreation narrating itself, and the caption under the
 * frame says as much out loud.
 */

import { useEffect, useRef, useState } from "react";
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

const Pointer = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 2.5l13.2 8.1-5.8 1.2-2.6 5.4z"
      fill="#ffffff"
      stroke="rgba(0,0,0,0.55)"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
);

/* ── The sequence ─────────────────────────────────────────────────────── */

/**
 * The beats, and how long each one is held.
 *
 * One flat list rather than a pile of timers: the effect below walks it, so
 * adding a beat is adding a line and the whole thing has exactly one clock.
 * The durations are the ones that make it readable at a glance — long enough
 * on the sheet that somebody who looked up mid-scroll still sees what was
 * asked, short enough that the loop does not become furniture.
 */
type Beat =
  | "idle"
  | "typing"
  | "spawn"
  | "asking"
  | "reaching"
  | "allowed"
  | "working"
  | "done";

const SCRIPT: Array<{ beat: Beat; ms: number }> = [
  { beat: "idle", ms: 1500 },
  { beat: "typing", ms: 2200 },
  { beat: "spawn", ms: 1200 },
  { beat: "asking", ms: 1500 },
  { beat: "reaching", ms: 1300 },
  { beat: "allowed", ms: 900 },
  { beat: "working", ms: 2600 },
  { beat: "done", ms: 2600 },
];

const JOB = "Kim, pull the revenue table out of the annual report.";

/** Where the pointer rests during each beat, in percentages of the frame. */
const CURSOR: Partial<Record<Beat, { x: number; y: number; say?: string }>> = {
  idle: { x: 62, y: 84 },
  typing: { x: 52, y: 74 },
  spawn: { x: 46, y: 62 },
  asking: { x: 52, y: 58 },
  /* Measured off the rendered button rather than guessed: the sheet's height
     is auto, so the row it sits on moves whenever a label does. */
  reaching: { x: 22.3, y: 71.2, say: "Allow once" },
  allowed: { x: 22.3, y: 71.2, say: "Allow once" },
  working: { x: 58, y: 80 },
  done: { x: 62, y: 84 },
};

/** What the assistant's tab says, and the colour its state wears. */
const AGENT: Partial<Record<Beat, { label: string; hue: string }>> = {
  spawn: { label: "Kim · starting", hue: "#d8a13c" },
  asking: { label: "Kim · waiting on you", hue: "#d8a13c" },
  reaching: { label: "Kim · waiting on you", hue: "#d8a13c" },
  allowed: { label: "Kim · reading", hue: "#3f9e78" },
  working: { label: "Kim · analysing", hue: "#3f9e78" },
  done: { label: "Kim · done", hue: "#3f9e78" },
};

const ORDER = SCRIPT.map((s) => s.beat);
const at = (beat: Beat) => ORDER.indexOf(beat);

export function Window() {
  /*
   * The server, and anyone who has asked for less motion, gets the beat the
   * whole thing is about: the sheet up, the question asked, the assistant
   * waiting. A still frame of the most interesting moment rather than of the
   * first one — and it is a complete, honest picture of the product either
   * way, which is the test for whether an animation was allowed to exist.
   */
  const [beat, setBeat] = useState<Beat>("asking");
  const [typed, setTyped] = useState(JOB.length);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  /* Plays only while it is on screen, and never for somebody who has asked
     the system for less movement. Both are checked once, at mount. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = frameRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const { beat: next, ms } = SCRIPT[i];
      setBeat(next);
      setTyped(next === "idle" ? 0 : next === "typing" ? 0 : JOB.length);
      i = (i + 1) % SCRIPT.length;
      timer = setTimeout(step, ms);
    };
    step();
    return () => clearTimeout(timer);
  }, [playing]);

  /* The job types itself. A substring rather than a width animation, because
     the label is a sentence in a proportional face and a `steps()` reveal of
     one of those slices letters in half. */
  useEffect(() => {
    if (beat !== "typing") return;
    const each = Math.floor(1700 / JOB.length);
    const id = setInterval(() => {
      setTyped((n) => {
        if (n >= JOB.length) return n;
        return n + 1;
      });
    }, each);
    return () => clearInterval(id);
  }, [beat]);

  const i = at(beat);
  const agent = AGENT[beat];
  const spot = CURSOR[beat] ?? CURSOR.idle!;
  const sheetUp = i >= at("asking") && i <= at("allowed");
  const clicking = beat === "allowed";

  return (
    <div className="window rise d4">
      <div
        ref={frameRef}
        className="window__frame"
        data-beat={beat}
        role="img"
        aria-label="A recreation of the Tougather browser: a job is given to the assistant, it opens a tab of its own, it asks before reading one of yours, and it works while you carry on."
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

            {/* The assistant's tab, wearing its state as a colour — and it is
                not there until there is a job, which is the point: it is a
                tab that arrives rather than a panel that is always open. */}
            <span className="tab tab--agent" data-in={agent ? "" : undefined}>
              <i data-agent style={{ background: agent?.hue ?? "#d8a13c" }} />
              {agent?.label ?? "Kim"}
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
            <span className="space" data-lit={agent ? "" : undefined}>
              <i style={{ background: agent?.hue ?? "#3f9e78" }} />
              Kim<b>{agent ? 1 : 0}</b>
            </span>
          </aside>

          <div className="stage">
            <div className="stage__in" aria-hidden="true">
              {/* What you typed. ⌘J is the real shortcut and this is the real
                  shape of the ask: a sentence, not a form. */}
              <div className="ask" data-in={beat === "typing" || i >= at("spawn") ? "" : undefined}>
                <kbd>⌘J</kbd>
                <span>
                  {JOB.slice(0, typed)}
                  <i data-caret={beat === "typing" ? "" : undefined} />
                </span>
              </div>

              {/* The permission sheet, which is the screen this product is
                  actually about. */}
              <div className="panel grain" data-up={sheetUp ? "" : undefined}>
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

                <div className="answer">
                  <span className="answer__btn" data-hit={clicking ? "" : undefined}>
                    Allow once
                  </span>
                  <span className="answer__btn answer__btn--quiet">Not now</span>
                </div>
              </div>

              {/* What came back. Replaces the sheet rather than sitting beside
                  it, because the sheet is a question and this is its answer. */}
              <div className="found" data-up={i >= at("working") ? "" : undefined}>
                <h5>{beat === "done" ? "Kim found" : "Kim is reading"}</h5>
                <div className="found__rows">
                  {["Revenue by quarter", "Cost of sales", "Operating margin"].map((r, n) => (
                    <span key={r} data-in={beat === "done" ? "" : undefined} style={{ ["--n" as string]: n }}>
                      <i />
                      {r}
                    </span>
                  ))}
                </div>
                <p>
                  {beat === "done"
                    ? "Three tables, put on a board in its own workspace. Nothing left your machine."
                    : "One minute of access to one tab, and then it is closed again."}
                </p>
              </div>

              <div className="row" data-away={i >= at("asking") ? "" : undefined}>
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

        {/* Yours, and it does the one thing a person does in this flow. */}
        <div
          className="cursor"
          aria-hidden="true"
          data-click={clicking ? "" : undefined}
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        >
          <Pointer />
          {spot.say ? <span className="cursor__say">{spot.say}</span> : null}
        </div>
      </div>

      {/* Hung over the frame's edge, so the window reads as an object with
          something in front of it rather than a flat picture. */}
      <div className="dock" aria-hidden="true">
        <div className="dock__pill glass-dark">
          <span>
            <Grid />
          </span>
          <span data-lit={beat === "typing" ? "" : undefined}>
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

      {/* Said out loud, because a demo that plays itself is the easiest thing
          on a landing page to mistake for a screen recording. */}
      <p className="window__cap">A recreation, playing by itself — not a live browser.</p>
    </div>
  );
}
