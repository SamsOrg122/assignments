/**
 * Project templates.
 *
 * The board got templates first because a blank canvas is the most hostile
 * empty state in the app; a blank document is a close second. Same rule
 * applies: a template is a *shape with prompts in it*, not a title and four
 * empty headings. Every line here is a question the writer should be answering,
 * so the first thing you do is replace it — which is exactly the right first
 * thing to do.
 *
 * Deliberately not "AI-generated starter content": these are fixed, honest
 * skeletons. Nothing here pretends to know what your project is about.
 */

import { createSlidesBlock, createTableBlock, createTextBlock, uid } from "./factories";
import type { Block, ProjectKind } from "./types";

export interface ProjectTemplate {
  id: string;
  name: string;
  kind: ProjectKind;
  /** What it's for, in one line. */
  blurb: string;
  /** Section names, shown as the preview. */
  outline: string[];
  build: (name: string) => Block[];
}

const h = (level: 1 | 2, text: string) => `<h${level}>${text}</h${level}>`;
const p = (text: string) => `<p>${text}</p>`;
const hint = (text: string) => `<p><em>${text}</em></p>`;
const ul = (items: string[]) =>
  `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "thesis",
    name: "Thesis chapter",
    kind: "doc",
    blurb: "Question, method, results, discussion — with the word goals set.",
    outline: ["Introduction", "Method", "Results", "Discussion"],
    build: (name) => [
      createTextBlock(
        h(1, name) +
          hint("One sentence: what question does this chapter answer?") +
          h(2, "Introduction") +
          p("") +
          h(2, "Method") +
          hint("Design, participants, materials, procedure, analysis.") +
          p("") +
          h(2, "Results") +
          p("") +
          h(2, "Discussion") +
          hint("What it means, what it doesn't, and what you'd do next.") +
          p(""),
      ),
    ],
  },
  {
    id: "report",
    name: "Report",
    kind: "doc",
    blurb: "Recommendation first, evidence after — with a table and a chart.",
    outline: ["Recommendation", "What we found", "The numbers", "Risks"],
    build: (name) => {
      const table = createTableBlock();
      table.title = "The numbers";
      return [
        createTextBlock(
          h(1, name) +
            h(2, "Recommendation") +
            hint("Lead with the decision you want. One paragraph, no preamble.") +
            p("") +
            h(2, "What we found") +
            ul(["", "", ""]),
        ),
        table,
        createTextBlock(
          h(2, "Risks") +
            hint("What would have to be true for this to be wrong?") +
            p(""),
        ),
      ];
    },
  },
  {
    id: "meeting",
    name: "Meeting notes",
    kind: "notes",
    blurb: "Decisions and owners, not a transcript.",
    outline: ["Decisions", "Actions", "Open questions"],
    build: (name) => [
      createTextBlock(
        h(1, name) +
          h(2, "Decisions") +
          hint("What was actually decided. If nothing was, write that.") +
          ul([""]) +
          h(2, "Actions") +
          hint("Name, thing, date. An action without an owner isn't one.") +
          ul([""]) +
          h(2, "Open questions") +
          ul([""]),
      ),
    ],
  },
  {
    id: "reading",
    name: "Reading notes",
    kind: "notes",
    blurb: "One source, summarised in your own words, with the argument you'll use.",
    outline: ["Claim", "Evidence", "How I'll use it"],
    build: (name) => [
      createTextBlock(
        h(1, name) +
          h(2, "Claim") +
          hint("What is this source arguing? In your words, not theirs.") +
          p("") +
          h(2, "Evidence") +
          hint("What backs it up, and how strong is it really?") +
          p("") +
          h(2, "How I'll use it") +
          hint("Which section of your work does this belong in?") +
          p(""),
      ),
    ],
  },
  {
    id: "pitch",
    name: "Pitch deck",
    kind: "deck",
    blurb: "Problem, solution, evidence, ask — the shape every pitch is.",
    outline: ["The problem", "What we built", "Evidence", "The ask"],
    build: (name) => {
      const deck = createSlidesBlock();
      deck.title = name;
      deck.slides = [
        {
          id: uid(),
          title: name,
          bullets: ["One line on what this is"],
        },
        {
          id: uid(),
          title: "The problem",
          bullets: [
            "Who has it",
            "What it costs them today",
            "Why now",
          ],
        },
        {
          id: uid(),
          title: "What we built",
          bullets: ["The one thing it does", "Why that's the right one thing"],
        },
        {
          id: uid(),
          title: "Evidence",
          bullets: ["A number you can defend", "Where it came from"],
        },
        {
          id: uid(),
          title: "The ask",
          bullets: ["What you want", "What happens if you get it"],
        },
      ];
      return [deck];
    },
  },
  {
    id: "update",
    name: "Project update",
    kind: "deck",
    blurb: "Shipped, next, blocked. Five minutes, no filler.",
    outline: ["Where we are", "Shipped", "Next", "Blocked"],
    build: (name) => {
      const deck = createSlidesBlock();
      deck.title = name;
      deck.slides = [
        { id: uid(), title: name, bullets: ["Week of —"] },
        {
          id: uid(),
          title: "Where we are",
          bullets: ["On track / at risk / late — pick one and say why"],
        },
        { id: uid(), title: "Shipped", bullets: [""] },
        { id: uid(), title: "Next", bullets: [""] },
        {
          id: uid(),
          title: "Blocked",
          bullets: ["What's stuck, and who can unstick it"],
        },
      ];
      return [deck];
    },
  },
];

export const templatesFor = (kind: ProjectKind) =>
  PROJECT_TEMPLATES.filter((t) => t.kind === kind);
