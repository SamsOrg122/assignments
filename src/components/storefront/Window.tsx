"use client";

/**
 * The browser, drawn as the browser, and playing.
 *
 * ── WHAT THIS REPLACED, AND WHY IT WAS WRONG ────────────────────────────
 * The first version was a browser-shaped object with tabs in a strip along the
 * top. Tougather does not have that. It has a glass sidebar down the left over
 * a moving mesh, with the tabs in it — which is the most recognisable thing
 * about the product and the first thing the section under this claims about
 * it. A hero that contradicts its own feature list on the one point a reader
 * can check by looking is worse than no hero.
 *
 * So this is the real chrome, read out of `browser/renderer/` rather than
 * imagined: the window dots at the top of the sidebar, the back/forward/reload
 * row, the Tougather button with Ctrl ⇧ O, the address button with Ctrl K, the
 * "Tabs" section with its count, the tab rows, "New tab" with Ctrl T, the
 * workspace strip along the bottom, the 34px bar that runs over the page and
 * not over the sidebar, and the ten-pixel gutter that leaves the page floating
 * as a rounded card. The sizes are the real ones — 272 of sidebar, 10 of
 * gutter, 18 of page radius — because they are in `renderer/tokens.css` and
 * there was no reason to guess.
 *
 * ── THE CARD IN THE MIDDLE IS THE REAL ONE, WORD FOR WORD ───────────────
 * The permission dialog is `#vraag` in `renderer/index.html`, filled from
 * `main.js`: a heading, three lines naming the page, the address and the
 * workspace, a warning, two buttons, and a clock. The warning is the sentence
 * the product uses to talk a reader *out* of pressing allow — everything on
 * that page goes to the client, and if you are signed in there, that includes
 * everything behind the login — and the clock says that silence is a no. Both
 * are on the homepage now because they are the most convincing thing this
 * browser has, and neither is something a marketing page would invent.
 *
 * ── ONE THING HERE IS TRANSLATED, AND THAT IS A REAL GAP ────────────────
 * The shipped chrome is Dutch only. `renderer/` has no i18n and neither does
 * `main.js`, so an English reader who downloads this gets "Niet doen" and
 * "Eén keer toestaan". Drawing the recreation in the reader's language is the
 * only honest option on an English page — Dutch chrome in the hero would say
 * the product is for somebody else — but it does leave this frame ahead of the
 * build, and that belongs on the list rather than in the gap.
 *
 * ── AND WHOSE POINTER THAT IS ───────────────────────────────────────────
 * Yours. The assistant never takes your screen and never drives your mouse —
 * the comparison two sections down says so with the file — so a demo in which
 * it moved a cursor would contradict the product's own promise in the first
 * screen. The pointer does the one thing a person does here: it answers.
 */

import { useEffect, useRef, useState } from "react";

/* ── The real chrome's icons, traced from renderer/index.html ─────────── */

const I = {
  back: <path d="M10.5 3 5.5 8l5 5" />,
  forward: <path d="M5.5 3 10.5 8l-5 5" />,
  reload: (
    <>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 3v2.5h-2.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 3v1.2M8 11.8V13M3 8h1.2M11.8 8H13M4.6 4.6l.9.9M10.5 10.5l.9.9M11.4 4.6l-.9.9M5.5 10.5l-.9.9" />
    </>
  ),
  panel: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="2.5" />
      <path d="M6.5 3v10" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="m10.6 10.6 3 3" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  grid: (
    <>
      <rect x="2.2" y="2.6" width="5" height="5" rx="1.4" />
      <rect x="8.8" y="2.6" width="5" height="5" rx="1.4" />
      <rect x="2.2" y="8.4" width="5" height="5" rx="1.4" />
      <rect x="8.8" y="8.4" width="5" height="5" rx="1.4" />
    </>
  ),
  lock: (
    <>
      <path d="M4.6 7.2V5.4a3.4 3.4 0 0 1 6.8 0v1.8" />
      <rect x="3.4" y="7.2" width="9.2" height="6" rx="1.8" />
    </>
  ),
};

const Ic = ({ d }: { d: keyof typeof I }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {I[d]}
  </svg>
);

const Pointer = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 2.5l13.2 8.1-5.8 1.2-2.6 5.4z" fill="#fff" stroke="rgba(0,0,0,0.5)" strokeWidth="1.1" strokeLinejoin="round" />
  </svg>
);

/* ── The sequence ─────────────────────────────────────────────────────── */

type Beat = "idle" | "typing" | "spawn" | "asking" | "reaching" | "allowed" | "reading" | "done";

/**
 * One flat list, so the effect below has exactly one clock and adding a beat
 * is adding a line. Long on the card, because the warning on it is the one
 * thing here worth stopping to read; short everywhere else, so the loop does
 * not turn into furniture.
 */
const SCRIPT: Array<{ beat: Beat; ms: number }> = [
  { beat: "idle", ms: 1600 },
  { beat: "typing", ms: 2400 },
  { beat: "spawn", ms: 1300 },
  { beat: "asking", ms: 2800 },
  { beat: "reaching", ms: 1200 },
  { beat: "allowed", ms: 800 },
  { beat: "reading", ms: 2400 },
  { beat: "done", ms: 3000 },
];

const JOB = "Pull the revenue tables out of the annual report.";

/** The top bar's one line — the assistant saying where it is. */
const SAYS: Record<Beat, string> = {
  idle: "Ready when you are",
  typing: "Ready when you are",
  spawn: "Kim is starting",
  asking: "Kim is waiting on you",
  reaching: "Kim is waiting on you",
  allowed: "Kim is waiting on you",
  reading: "Kim is reading Annual report 2025",
  done: "Kim put three tables on a board",
};

/** The assistant's tab: there from `spawn`, and its state is its colour. */
const AGENT: Partial<Record<Beat, { label: string; hue: string }>> = {
  spawn: { label: "Kim · starting", hue: "#d8a13c" },
  asking: { label: "Kim · waiting", hue: "#d8a13c" },
  reaching: { label: "Kim · waiting", hue: "#d8a13c" },
  allowed: { label: "Kim · waiting", hue: "#d8a13c" },
  reading: { label: "Kim · reading", hue: "#3f9e78" },
  done: { label: "Kim · done", hue: "#3f9e78" },
};

/** Where the pointer rests, in percentages of the frame. */
const CURSOR: Record<Beat, { x: number; y: number; say?: string }> = {
  idle: { x: 58, y: 62 },
  typing: { x: 33, y: 16 },
  spawn: { x: 16, y: 46 },
  asking: { x: 44, y: 50 },
  reaching: { x: 57.4, y: 65.5, say: "Allow once" },
  allowed: { x: 57.4, y: 65.5, say: "Allow once" },
  reading: { x: 66, y: 74 },
  done: { x: 70, y: 78 },
};

const ORDER = SCRIPT.map((s) => s.beat);
const at = (b: Beat) => ORDER.indexOf(b);

/** The three things the job is about, so the sentence has somewhere to land. */
const TABLES = ["Revenue by quarter", "Cost of sales", "Operating margin"];

const TABS = [
  { title: "Annual report 2025", hue: "#8b7bd8", active: true },
  { title: "Press release", hue: "#5fbcff" },
  { title: "Q3 board notes", hue: "#7fe3b4" },
];

export function Window() {
  /*
   * The server, and anyone who has asked for less motion, get the beat the
   * whole thing is about: the card up, the warning readable, the assistant
   * waiting. A still of the most interesting moment rather than of the first
   * one, and a complete picture of the product either way — which is the test
   * for whether the animation was allowed to exist at all.
   */
  const [beat, setBeat] = useState<Beat>("asking");
  const [typed, setTyped] = useState(JOB.length);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = frameRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const { beat: next, ms } = SCRIPT[n];
      setBeat(next);
      setTyped(next === "idle" || next === "typing" ? 0 : JOB.length);
      n = (n + 1) % SCRIPT.length;
      timer = setTimeout(step, ms);
    };
    step();
    return () => clearTimeout(timer);
  }, [playing]);

  /* A substring rather than a width animation: the label is a sentence in a
     proportional face, and a `steps()` reveal of one slices letters in half. */
  useEffect(() => {
    if (beat !== "typing") return;
    const id = setInterval(
      () => setTyped((k) => (k >= JOB.length ? k : k + 1)),
      Math.floor(1800 / JOB.length),
    );
    return () => clearInterval(id);
  }, [beat]);

  const i = at(beat);
  const agent = AGENT[beat];
  const spot = CURSOR[beat];
  const cardUp = i >= at("asking") && i <= at("allowed");
  const clicking = beat === "allowed";
  const taken = i >= at("reading");

  return (
    <div className="window rise d4">
      <div
        ref={frameRef}
        className="bw"
        data-beat={beat}
        role="img"
        aria-label="A recreation of the Tougather browser: tabs in a glass sidebar, a job given to the assistant, the browser's own permission card asking before it reads a page of yours, and the three tables it takes out."
      >
        {/* The mesh. In the real browser it moves under the glass and changes
            colour with the workspace; here it is four blobs and the same
            idea — the sidebar has to have something to be glass over. */}
        <div className="bw__mesh" aria-hidden="true">
          <span style={{ background: "var(--lilac)", left: "-8%", top: "-16%", width: 540, height: 470 }} />
          <span style={{ background: "var(--sky)", left: "26%", top: "56%", width: 500, height: 430 }} />
          <span style={{ background: "var(--orchid)", left: "60%", top: "-20%", width: 540, height: 450 }} />
          <span style={{ background: "var(--mint)", left: "78%", top: "60%", width: 440, height: 410 }} />
        </div>

        {/* ── The sidebar ─────────────────────────────────────────────── */}
        <aside className="bw__side" aria-hidden="true">
          <div className="bw__tl">
            <i data-c="close" />
            <i data-c="min" />
            <i data-c="max" />
            <span className="bw__rek" />
            <span className="bw__ib"><Ic d="panel" /></span>
          </div>

          <div className="bw__controls">
            <span className="bw__ib"><Ic d="back" /></span>
            <span className="bw__ib"><Ic d="forward" /></span>
            <span className="bw__ib"><Ic d="reload" /></span>
            <span className="bw__rek" />
            <span className="bw__ib"><Ic d="settings" /></span>
          </div>

          {/* The app sits above your tabs because it is not a tab: you go to
              it and come back, and your tab stays where it was. */}
          <span className="bw__app">
            <span className="bw__appic"><Ic d="grid" /></span>
            Tougather
            <kbd>Ctrl ⇧ O</kbd>
          </span>

          {/* Not a field but a button: clicking opens the command bar, which
              can do more than an address. */}
          <span className="bw__url">
            <Ic d="search" />
            <span className="bw__urlt">Search or enter an address</span>
            <kbd>Ctrl K</kbd>
          </span>

          <div className="bw__sec">
            <span>Tabs</span>
            <i />
            <span>{TABS.length + (agent ? 1 : 0)}</span>
          </div>

          <ol className="bw__tabs">
            {TABS.map((t) => (
              <li key={t.title} className="bw__tab" data-active={t.active ? "" : undefined}>
                <span className="bw__fav" style={{ background: t.hue }} />
                <span className="bw__tt">{t.title}</span>
              </li>
            ))}

            {/* The assistant's tab arrives when there is a job, and its glyph
                is its state — the colour tells you where it is even while you
                are looking at something else. */}
            <li className="bw__tab bw__tab--agent" data-in={agent ? "" : undefined}>
              <span className="bw__glyph" style={{ ["--g" as string]: agent?.hue ?? "#d8a13c" }} />
              <span className="bw__tt">{agent?.label ?? "Kim"}</span>
            </li>
          </ol>

          <span className="bw__new">
            <span className="bw__fi"><Ic d="plus" /></span>
            New tab
            <kbd>Ctrl T</kbd>
          </span>

          <div className="bw__ws">
            <span className="bw__wschip" data-on="">W</span>
            <span className="bw__wschip">P</span>
            <span className="bw__wschip" data-private=""><Ic d="lock" /></span>
            {agent ? (
              <span className="bw__wschip bw__wschip--agent" style={{ ["--g" as string]: agent.hue }}>K</span>
            ) : null}
            <span className="bw__rek" />
            <span className="bw__ib"><Ic d="plus" /></span>
          </div>
        </aside>

        {/* ── The page area ───────────────────────────────────────────── */}
        <div className="bw__main">
          {/* 34px, over the page and not over the sidebar — the window buttons
              already live up there. On the left, what is happening. */}
          <div className="bw__bar" aria-hidden="true">
            <span className="bw__barglyph" style={{ ["--g" as string]: agent?.hue ?? "#b48cf0" }} />
            <span className="bw__says">{SAYS[beat]}</span>
            <span className="bw__rek" />
            <span className="bw__apps">
              <i />
              <i />
              <i />
            </span>
          </div>

          <div className="bw__page" aria-hidden="true">
            <div className="bw__doc">
              <p className="bw__eyebrow">reports.example · Annual report 2025</p>
              <h3>Results for the year</h3>
              <div className="bw__lines">
                <i style={{ width: "94%" }} />
                <i style={{ width: "88%" }} />
                <i style={{ width: "96%" }} />
                <i style={{ width: "52%" }} />
              </div>

              <div className="bw__tables">
                {TABLES.map((t, n) => (
                  <div key={t} className="bw__tbl" data-taken={taken ? "" : undefined} style={{ ["--n" as string]: n }}>
                    <span className="bw__tblname">{t}</span>
                    <span className="bw__bars">
                      <i style={{ height: "44%" }} />
                      <i style={{ height: "72%" }} />
                      <i style={{ height: "58%" }} />
                      <i style={{ height: "88%" }} />
                    </span>
                  </div>
                ))}
              </div>

              <div className="bw__lines">
                <i style={{ width: "90%" }} />
                <i style={{ width: "74%" }} />
              </div>

              {/* Enough page that the document reads as a document. A browser
                  whose content stops a third of the way down the viewport is
                  a mock-up of a browser. */}
              <h4 className="bw__h4">Notes to the accounts</h4>
              <div className="bw__lines">
                <i style={{ width: "97%" }} />
                <i style={{ width: "91%" }} />
                <i style={{ width: "95%" }} />
                <i style={{ width: "64%" }} />
              </div>
              <div className="bw__quote">
                <i style={{ width: "88%" }} />
                <i style={{ width: "70%" }} />
              </div>
              <div className="bw__lines">
                <i style={{ width: "93%" }} />
                <i style={{ width: "86%" }} />
                <i style={{ width: "40%" }} />
              </div>
            </div>
          </div>

          {/* What you typed, in the composer the assistant button opens. */}
          <div className="bw__ask" data-in={beat === "typing" || i >= at("spawn") ? "" : undefined} aria-hidden="true">
            <span className="bw__barglyph" style={{ ["--g" as string]: "#b48cf0" }} />
            <span className="bw__asktext">
              {JOB.slice(0, typed)}
              <i data-caret={beat === "typing" ? "" : undefined} />
            </span>
            <kbd>⌘J</kbd>
          </div>

          {/*
            * The browser's own question, word for word.
            *
            * The main process takes the page away while this is open: the
            * question belongs in the chrome, where no website and no client
            * can reach it. That is why the document dims behind it here.
            */}
          <div className="bw__veil" data-up={cardUp ? "" : undefined} aria-hidden="true" />
          <div className="bw__vraag" data-up={cardUp ? "" : undefined} aria-hidden="true">
            <h4>The AI client wants to read a page of yours</h4>
            <ul>
              <li>
                <b>Page</b>Annual report 2025
              </li>
              <li>
                <b>Address</b>reports.example
              </li>
              <li>
                <b>Workspace</b>Work
              </li>
            </ul>
            <p className="bw__warn">
              Everything on that page goes to the client. If you are signed in there, that includes
              everything behind that login.
            </p>
            <div className="bw__btns">
              <span className="bw__btn">Don&apos;t</span>
              <span className="bw__btn bw__btn--go" data-hit={clicking ? "" : undefined}>
                Allow once
              </span>
            </div>
            <p className="bw__clock">No answer within 28 seconds means no.</p>
          </div>
        </div>

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

      <p className="window__cap">
        A recreation of the real chrome, playing by itself — not a live browser.
      </p>
    </div>
  );
}
