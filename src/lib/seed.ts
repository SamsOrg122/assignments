/**
 * First-run content. Ids are hard-coded (not generated) so the seed is
 * byte-identical on the server and the client — otherwise the persisted store
 * and the SSR pass would disagree and React would flag a hydration mismatch.
 */

import type { Project } from "./types";

const SEED_TS = 1767225600000; // 2026-01-01T00:00:00Z — fixed, so SSR is stable.

export const SEED_PROJECTS: Project[] = [
  {
    id: "p_orbit",
    name: "Orbit — Q3 review",
    glyph: "◆",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
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
    glyph: "◇",
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
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
