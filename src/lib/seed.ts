/**
 * First-run content. Ids are hard-coded (not generated) so the seed is
 * byte-identical on the server and the client — otherwise the persisted store
 * and the SSR pass would disagree and React would flag a hydration mismatch.
 */

import type { Project } from "./types";

/** Fixed, so SSR is stable — and so "has this been touched" is answerable. */
export const SEED_TS = 1767225600000; // 2026-01-01T00:00:00Z

/**
 * Sample content, kept for the landing page's live demo and for anyone who
 * asks for it from the command palette. It is *not* what a new workspace
 * starts with — see `SEED_PROJECTS` below.
 */
export const DEMO_PROJECTS: Project[] = [
  /**
   * A thesis-shaped document. The prose deliberately drifts between
   * "respondent" and "participant", and the conclusion overreaches what the
   * research question asks — so the workspace-aware AI checks have something
   * real to find rather than a canned answer.
   */
  {
    id: "p_thesis",
    name: "Attention & Interface Density",
    kind: "doc",
    glyph: "◆",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    board: [],
    wordGoal: 12000,
    citationStyle: "apa",
    sectionGoals: { t_ch1: 1500, t_ch2: 2500, t_ch3: 3000, t_ch4: 1200 },
    sources: [
      {
        id: "src_tufte",
        kind: "book",
        authors: [{ family: "Tufte", given: "Edward R." }],
        title: "The Visual Display of Quantitative Information",
        publisher: "Graphics Press",
        year: 2001,
      },
      {
        id: "src_mark",
        kind: "article",
        authors: [
          { family: "Mark", given: "Gloria" },
          { family: "Gudith", given: "Daniela" },
          { family: "Klocke", given: "Ulrich" },
        ],
        title: "The cost of interrupted work: More speed and stress",
        container: "Proceedings of the SIGCHI Conference on Human Factors in Computing Systems",
        year: 2008,
        pages: "107–110",
        doi: "10.1145/1357054.1357072",
      },
      {
        id: "src_sweller",
        kind: "article",
        authors: [{ family: "Sweller", given: "John" }],
        title: "Cognitive load during problem solving: Effects on learning",
        container: "Cognitive Science",
        volume: "12",
        issue: "2",
        pages: "257–285",
        year: 1988,
      },
    ],
    typography: {
      measure: 68,
      lineHeight: 1.8,
      letterSpacing: -0.003,
      fontSize: 18,
      family: "serif",
      margin: 72,
    },
    blocks: [
      {
        id: "t_title",
        type: "text",
        html: `<h1>Attention &amp; Interface Density</h1><p>A study of how visual density in productivity software affects sustained attention during long-form writing tasks.</p>`,
      },
      {
        id: "t_ch1",
        type: "text",
        html: `<h2>1 — Introduction</h2><p>Word processors have accumulated chrome for thirty years. Each toolbar was reasonable on its own, and the sum is a workspace where the text occupies less than half the screen. This thesis asks whether that accumulation carries a measurable cost.</p><p><strong>Research question:</strong> Does reducing visible interface density increase sustained attention during long-form writing?</p><p>The cost of switching attention is well documented <span data-citation="src_mark" class="citation">(Mark et al., 2008)</span>, and the case against decorative chrome is older still <span data-citation="src_tufte" class="citation">(Tufte, 2001)</span>.</p><p>Each respondent completed two 40-minute writing sessions. I recorded self-reported focus alongside interaction telemetry.</p>`,
      },
      {
        id: "t_ch2",
        type: "text",
        html: `<h2>2 — Method</h2><p>Twenty-four participants were recruited from two graduate programmes. Every participant used both a dense and a sparse editor, with order counterbalanced.</p><p>I chose a within-subjects design because between-subjects variance in writing speed is large enough to swamp the effect I was looking for. Each respondent therefore acted as their own control.</p><blockquote>Ask AI to check whether "respondent" and "participant" are used interchangeably — they are, and it will tell you where.</blockquote>`,
      },
      {
        id: "t_ch3",
        type: "text",
        html: `<h2>3 — Findings</h2><p>Sparse conditions produced longer uninterrupted writing runs: a median of 9.4 minutes against 5.1. Self-reported focus moved in the same direction but less sharply.</p><p>Interaction telemetry showed the difference was not simply fewer clicks. In the dense condition participants looked away from the text more often even when they did not act on what they saw.</p>`,
      },
      {
        id: "t_ch4",
        type: "text",
        html: `<h2>4 — Conclusion</h2><p>Interface density degrades sustained attention, and software vendors should therefore adopt minimal interfaces as a default across all product categories.</p><p>The effect appears robust across both programmes sampled.</p>`,
      },
      {
        id: "t_refs",
        type: "bibliography",
        title: "References",
        scope: "all",
      },
    ],
  },

  /**
   * A board that already demonstrates both halves of the bridge: loose
   * thinking (stickies, a stray paragraph) sitting next to a live card that
   * mirrors the thesis above.
   */
  {
    id: "p_board",
    name: "Thinking — thesis structure",
    kind: "board",
    glyph: "◈",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    viewport: { x: 60, y: 40, scale: 1 },
    blocks: [],
    board: [
      {
        id: "bi_head",
        kind: "text",
        x: 80,
        y: 60,
        width: 380,
        height: 110,
        z: 1,
        text: "Everything below is unsorted on purpose. Drag things around, then select a cluster and press P to promote it into a real Library project.",
      },
      {
        // Frames sit under everything and carry their contents when moved, so
        // the seed opens on a board that already has a *shape*, not a pile.
        id: "bi_frame",
        kind: "frame",
        x: 60,
        y: 205,
        width: 440,
        height: 450,
        z: -10,
        title: "Method questions",
        tone: "accent",
      },
      {
        id: "bi_s1",
        kind: "sticky",
        x: 100,
        y: 220,
        width: 180,
        height: 180,
        z: 2,
        tone: "accent",
        text: "Density has a cost — but is it attention or just clicks?",
      },
      {
        id: "bi_s2",
        kind: "sticky",
        x: 300,
        y: 250,
        width: 180,
        height: 180,
        z: 3,
        tone: "neutral",
        text: "Within-subjects. Variance between writers is enormous.",
      },
      {
        id: "bi_s3",
        kind: "sticky",
        x: 200,
        y: 440,
        width: 180,
        height: 180,
        z: 4,
        tone: "mint",
        text: "Counterbalance the order or the practice effect eats the result.",
      },
      {
        id: "bi_card",
        kind: "card",
        x: 560,
        y: 210,
        width: 300,
        height: 200,
        z: 5,
        projectId: "p_thesis",
      },
      {
        id: "bi_note",
        kind: "text",
        x: 560,
        y: 450,
        width: 300,
        height: 90,
        z: 6,
        text: "The card on the right is live. Edit the thesis and it updates here.",
      },
      {
        id: "bi_c1",
        kind: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        z: -5,
        fromId: "bi_s1",
        toId: "bi_s2",
        label: "leads to",
        arrow: "end",
        route: "curve",
        tone: "accent",
      },
      {
        id: "bi_c2",
        kind: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        z: -5,
        fromId: "bi_s2",
        toId: "bi_s3",
        arrow: "end",
        route: "curve",
        tone: "neutral",
      },
    ],
  },

  {
    id: "p_pitch",
    name: "Sparse — pitch",
    kind: "deck",
    glyph: "▲",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    board: [],
    blocks: [
      {
        id: "d_deck",
        type: "slides",
        title: "Deck",
        slides: [
          {
            id: "ds1",
            title: "Sparse",
            bullets: ["Writing software that gets out of the way"],
            note: "Open on the problem, not the product.",
          },
          {
            id: "ds2",
            title: "The cost of chrome",
            bullets: [
              "Text occupies under half the screen",
              "Median writing run: 5.1 minutes",
              "Attention leaks even without clicks",
            ],
          },
          {
            id: "ds3",
            title: "What we built",
            bullets: ["One canvas", "One accent", "Nothing else"],
          },
        ],
      },
    ],
  },

  {
    id: "p_orbit",
    name: "Orbit — Q3 review",
    kind: "doc",
    glyph: "◆",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    board: [],
    blocks: [
      {
        id: "b_intro",
        type: "text",
        html: `<h1>Orbit — Q3 review</h1><p>Everything for the quarterly lives here: the narrative, the numbers, the chart that reads from those numbers, and the prototype. One project, no file-shuffling.</p><h2>Where we landed</h2><ul><li>Revenue grew across all three regions, led by <strong>EMEA</strong>.</li><li>Support load fell for the second quarter running.</li><li>The onboarding rewrite shipped two weeks ahead of plan.</li></ul><blockquote>Select any of this text and press ⌘J to ask AI about it — it can see the whole project, not just the selection.</blockquote>`,
      },
      {
        id: "b_table",
        type: "table",
        title: "Regional revenue",
        columns: [
          { id: "c_region", name: "Region", type: "text" },
          { id: "c_q2", name: "Q2", type: "number" },
          { id: "c_q3", name: "Q3", type: "number" },
          {
            id: "c_delta",
            name: "Growth",
            type: "formula",
            formula: "ROUND(([Q3] - [Q2]) / [Q2] * 100, 1)",
          },
          {
            id: "c_share",
            name: "Share",
            type: "formula",
            formula: "ROUND([Q3] / SUM([Q3]) * 100, 1)",
          },
        ],
        rows: [
          {
            id: "r_amer",
            cells: { c_region: "Americas", c_q2: 412, c_q3: 478 },
          },
          { id: "r_emea", cells: { c_region: "EMEA", c_q2: 268, c_q3: 361 } },
          { id: "r_apac", cells: { c_region: "APAC", c_q2: 190, c_q3: 224 } },
          {
            id: "r_latam",
            cells: { c_region: "LATAM", c_q2: 74, c_q3: 96 },
          },
        ],
        sort: null,
      },
      {
        id: "b_chart",
        type: "chart",
        title: "Q2 vs Q3 by region",
        sourceId: "b_table",
        kind: "bar",
        xColumnId: "c_region",
        yColumnIds: ["c_q2", "c_q3"],
      },
      {
        id: "b_note",
        type: "text",
        html: `<h2>Prototype</h2><p>The onboarding panel below runs in the page. Edit a file and press <code>Run</code>.</p>`,
      },
      {
        id: "b_code",
        type: "code",
        title: "Onboarding panel",
        activeFileId: "f_html",
        preview: true,
        files: [
          {
            id: "f_html",
            name: "index.html",
            language: "html",
            content: `<!doctype html>
<html>
  <head><link rel="stylesheet" href="styles.css" /></head>
  <body>
    <section class="card">
      <p class="step">Step 1 of 3</p>
      <h1>Set up your workspace</h1>
      <p class="sub">Pick a starting point. You can change this later.</p>
      <button id="go">Continue</button>
    </section>
    <script src="main.js"></script>
  </body>
</html>`,
          },
          {
            id: "f_css",
            name: "styles.css",
            language: "css",
            content: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #0a0a0a;
  color: #ededed;
  font: 15px/1.6 ui-sans-serif, system-ui, sans-serif;
}
.card {
  width: min(360px, 84vw);
  padding: 28px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  background: #141414;
}
.step { margin: 0 0 14px; font: 10px/1 ui-monospace, monospace;
  letter-spacing: .08em; text-transform: uppercase; color: #5c5c5c; }
h1 { margin: 0 0 6px; font-size: 20px; letter-spacing: -0.02em; }
.sub { margin: 0 0 20px; color: #8a8a8a; font-size: 13px; }
button {
  width: 100%; padding: 9px; border-radius: 6px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: #3d7dff; color: #fff; font-size: 13px; font-weight: 500;
  transition: filter 160ms cubic-bezier(.16,1,.3,1);
}
button:hover { filter: brightness(1.1); }`,
          },
          {
            id: "f_js",
            name: "main.js",
            language: "javascript",
            content: `let step = 1;
const btn = document.getElementById("go");
const label = document.querySelector(".step");

btn.addEventListener("click", () => {
  step = (step % 3) + 1;
  label.textContent = \`Step \${step} of 3\`;
});`,
          },
        ],
      },
    ],
  },
  {
    id: "p_atlas",
    name: "Atlas — design system",
    kind: "doc",
    glyph: "◇",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    board: [],
    blocks: [
      {
        id: "b_atlas_intro",
        type: "text",
        html: `<h1>Atlas</h1><p>Primitives, tokens and the rules that hold them together.</p><h2>Principles</h2><ol><li>One accent, used only where attention belongs.</li><li>Hairlines over shadows.</li><li>Motion under 200ms, or none at all.</li></ol>`,
      },
      {
        id: "b_atlas_slides",
        type: "slides",
        title: "Kickoff deck",
        slides: [
          {
            id: "s1",
            title: "Atlas",
            bullets: ["A design system for everything, in one"],
            note: "Set the frame — this is about cohesion, not components.",
          },
          {
            id: "s2",
            title: "Three principles",
            bullets: [
              "One accent, used sparingly",
              "Hairlines over shadows",
              "Fast motion, or none",
            ],
          },
          {
            id: "s3",
            title: "What ships first",
            bullets: ["Tokens", "Type scale", "The block primitives"],
          },
        ],
      },
    ],
  },
];

/**
 * What a new workspace actually contains: nothing.
 *
 * A first run full of somebody else's thesis is a demo wearing the product's
 * clothes. Every project here would have to be deleted before the tool could
 * be used, and until it was, nothing on screen would be true. The empty states
 * do the explaining instead.
 *
 * The samples are still one command away — ⌘K → "Load the sample workspace" —
 * and the landing page's demo frame loads them on its own.
 */
export const SEED_PROJECTS: Project[] = [];
