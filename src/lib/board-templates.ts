/**
 * Board templates.
 *
 * A template is a layout plus a *worked example*, not an empty grid. "Kanban"
 * with three labelled but empty columns tells you nothing you couldn't guess;
 * three columns with a card in each shows you what the board is for and gives
 * you something to edit instead of something to start. Every sticky here is
 * placeholder text the user is expected to overwrite immediately.
 *
 * Layout is authored in local coordinates and translated to wherever the user
 * dropped it, so a template can be stamped anywhere on the infinite canvas.
 */

import { uid } from "./factories";
import type { BoardItem, BoardTone, ConnectorRoute } from "./types";

interface Spec {
  /** Local key so connectors can name their endpoints before ids exist. */
  key?: string;
  kind: "frame" | "sticky" | "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  tone?: BoardTone;
}

interface Link {
  from: string;
  to: string;
  label?: string;
  route?: ConnectorRoute;
  dashed?: boolean;
}

export interface BoardTemplate {
  id: string;
  name: string;
  /** One line on the card — what this board is *for*, not what's in it. */
  blurb: string;
  items: Spec[];
  links?: Link[];
}

const F = (
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  tone: BoardTone = "neutral",
): Spec => ({ kind: "frame", x, y, width, height, text, tone });

const S = (
  x: number,
  y: number,
  text: string,
  tone: BoardTone = "neutral",
  key?: string,
): Spec => ({ kind: "sticky", x, y, width: 180, height: 150, text, tone, key });

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "brainstorm",
    name: "Brainstorm",
    blurb: "Diverge, then cluster. Three buckets and room to make a mess.",
    items: [
      F(0, 0, 400, 460, "Ideas", "accent"),
      F(430, 0, 400, 460, "Maybe", "neutral"),
      F(860, 0, 400, 460, "Parked", "warn"),
      S(40, 70, "Write one idea per note.", "accent"),
      S(230, 70, "No editing while adding.", "accent"),
      S(40, 250, "Move it here when it needs a champion.", "neutral"),
      S(470, 70, "Good, wrong quarter.", "neutral"),
      S(900, 70, "Revisit after the pilot.", "warn"),
    ],
  },
  {
    id: "kanban",
    name: "Kanban",
    blurb: "Backlog, doing, blocked, done — with the work-in-progress visible.",
    items: [
      F(0, 0, 260, 620, "Backlog"),
      F(285, 0, 260, 620, "In progress", "accent"),
      F(570, 0, 260, 620, "Blocked", "warn"),
      F(855, 0, 260, 620, "Done", "mint"),
      S(40, 70, "Draft the recruitment mail", "neutral"),
      S(40, 240, "Book the two labs", "neutral"),
      S(325, 70, "Write the method section", "accent"),
      S(610, 70, "Ethics approval — waiting on the board", "warn"),
      S(895, 70, "Pilot with three participants", "mint"),
    ],
  },
  {
    id: "mindmap",
    name: "Mind map",
    blurb: "A centre and its branches, connected — the shape of a thought.",
    items: [
      { kind: "sticky", x: 420, y: 260, width: 200, height: 110, text: "Central question", tone: "accent", key: "hub" },
      S(80, 60, "Branch one", "neutral", "b1"),
      S(760, 60, "Branch two", "neutral", "b2"),
      S(80, 460, "Branch three", "neutral", "b3"),
      S(760, 460, "Branch four", "neutral", "b4"),
      S(80, 240, "Supporting note", "mint", "s1"),
    ],
    links: [
      { from: "hub", to: "b1", route: "curve" },
      { from: "hub", to: "b2", route: "curve" },
      { from: "hub", to: "b3", route: "curve" },
      { from: "hub", to: "b4", route: "curve" },
      { from: "b1", to: "s1", route: "curve", dashed: true },
    ],
  },
  {
    id: "flow",
    name: "Flow",
    blurb: "Steps and decisions, with labelled arrows between them.",
    items: [
      { kind: "sticky", x: 0, y: 200, width: 180, height: 110, text: "Start", tone: "mint", key: "a" },
      { kind: "sticky", x: 280, y: 200, width: 180, height: 110, text: "Do the thing", tone: "neutral", key: "b" },
      { kind: "sticky", x: 560, y: 200, width: 180, height: 110, text: "Did it work?", tone: "accent", key: "c" },
      { kind: "sticky", x: 840, y: 60, width: 180, height: 110, text: "Ship", tone: "mint", key: "d" },
      { kind: "sticky", x: 840, y: 340, width: 180, height: 110, text: "Fix and retry", tone: "warn", key: "e" },
    ],
    links: [
      { from: "a", to: "b", route: "elbow" },
      { from: "b", to: "c", route: "elbow" },
      { from: "c", to: "d", label: "yes", route: "elbow" },
      { from: "c", to: "e", label: "no", route: "elbow" },
      { from: "e", to: "b", route: "curve", dashed: true },
    ],
  },
  {
    id: "moodboard",
    name: "Moodboard",
    blurb: "A wall for references, with a strip for the words that go with them.",
    items: [
      F(0, 0, 900, 520, "References"),
      { kind: "image", x: 40, y: 70, width: 260, height: 190 },
      { kind: "image", x: 320, y: 70, width: 260, height: 190 },
      { kind: "image", x: 600, y: 70, width: 260, height: 190 },
      { kind: "image", x: 40, y: 290, width: 400, height: 200 },
      { kind: "image", x: 460, y: 290, width: 400, height: 200 },
      F(930, 0, 320, 520, "Direction", "accent"),
      S(970, 70, "Three words for the feeling.", "accent"),
      S(970, 250, "One thing it must never look like.", "warn"),
    ],
  },
  {
    id: "plan",
    name: "Project plan",
    blurb: "Now, next, later — plus the risks nobody wants to write down.",
    items: [
      F(0, 0, 380, 420, "Now", "accent"),
      F(410, 0, 380, 420, "Next"),
      F(820, 0, 380, 420, "Later"),
      F(0, 450, 1200, 260, "Risks", "warn"),
      S(40, 70, "The one thing in flight.", "accent"),
      S(450, 70, "Starts when Now lands.", "neutral"),
      S(860, 70, "Only if the pilot works.", "neutral"),
      S(40, 520, "What would make this slip a month?", "warn"),
      S(240, 520, "Who has to say yes?", "warn"),
    ],
  },
];

/**
 * Instantiate a template at a world point. Returns plain items ready for
 * `addBoardItems`, with connector endpoints resolved from the local keys.
 */
export function stampTemplate(
  template: BoardTemplate,
  at: { x: number; y: number },
): BoardItem[] {
  const ids = new Map<string, string>();
  const now = Date.now();
  const out: BoardItem[] = [];

  template.items.forEach((spec, n) => {
    const id = uid();
    if (spec.key) ids.set(spec.key, id);
    const base = {
      id,
      x: Math.round(at.x + spec.x),
      y: Math.round(at.y + spec.y),
      width: spec.width,
      height: spec.height,
      // Frames sit under everything; the stamp order gives the rest a
      // stable stacking that matches reading order.
      z: spec.kind === "frame" ? -1000 + n : now + n,
    };

    if (spec.kind === "frame")
      out.push({
        ...base,
        kind: "frame",
        title: spec.text ?? "Section",
        tone: spec.tone ?? "neutral",
      });
    else if (spec.kind === "sticky")
      out.push({
        ...base,
        kind: "sticky",
        text: spec.text ?? "",
        tone: spec.tone ?? "neutral",
      });
    else if (spec.kind === "text")
      out.push({ ...base, kind: "text", text: spec.text ?? "" });
    else out.push({ ...base, kind: "image", src: "", alt: "" });
  });

  for (const link of template.links ?? []) {
    const fromId = ids.get(link.from);
    const toId = ids.get(link.to);
    if (!fromId || !toId) continue;
    out.push({
      id: uid(),
      kind: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      z: -500,
      fromId,
      toId,
      label: link.label,
      arrow: "end",
      route: link.route ?? "curve",
      tone: "neutral",
      dashed: link.dashed,
    });
  }

  return out;
}
