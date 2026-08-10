/**
 * Flattens a project — and the workspace around it — into what the provider
 * sees.
 *
 * This is where "AI is aware of the whole project" is actually implemented:
 * every block contributes, not just the one the caret is in. Long documents
 * are trimmed to a fixed character budget from the middle outward, so the
 * opening and the conclusion (the two things consistency questions hinge on)
 * always survive.
 */

import { DEFAULT_DECK_STYLE, type Block, type Project } from "../types";
import type { KnowledgeEntry, TeamFile, Workspace } from "../team/types";
import { computeFormulas } from "../formula";
import { collectNotes, stripMarkers } from "../notes";
import { CONTEXT_CHAR_BUDGET, type AIContext } from "./types";

/** Strip HTML to text without a DOM, so this is safe on the server too. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|div|pre)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The heading a text block opens with, and at what level. */
export function blockHeading(
  block: Block,
): { text: string; level: number } | undefined {
  if (block.type !== "text")
    return block.title ? { text: block.title, level: 2 } : undefined;
  const match = /<h([1-3])[^>]*>(.*?)<\/h\1>/i.exec(block.html);
  if (!match) return undefined;
  const text = htmlToText(match[2]).trim();
  return text ? { text, level: Number(match[1]) } : undefined;
}

/** One block, as text a language model can read. */
export function blockToText(block: Block, project: Project): string {
  switch (block.type) {
    case "text": {
      // Note text lives in an attribute, so tag-stripping alone would hand the
      // model a document with the notes silently missing — and then have it
      // confidently say the argument is unsupported.
      const notes = collectNotes([block]);
      const body = htmlToText(stripMarkers(block.html));
      return notes.length
        ? `${body}\n\nNotes in this block:\n${notes
            .map((n, i) => `[${i + 1}] ${n.text}`)
            .join("\n")}`
        : body;
    }

    case "table": {
      const derived = computeFormulas(block.columns, block.rows);
      const header = block.columns.map((c) => c.name).join(" | ");
      const body = block.rows
        .map((r) =>
          block.columns
            .map((c) =>
              c.type === "formula"
                ? String(derived[r.id]?.[c.id] ?? "")
                : String(r.cells[c.id] ?? ""),
            )
            .join(" | "),
        )
        .join("\n");
      return `${header}\n${body}`;
    }

    case "chart": {
      const source = project.blocks.find((b) => b.id === block.sourceId);
      const name =
        source?.type === "table" ? (source.title ?? "a table") : "no source";
      return `${block.kind} chart bound to ${name}`;
    }

    case "slides":
      return block.slides
        .map((s) => `${s.title}\n${s.bullets.map((b) => `- ${b}`).join("\n")}`)
        .join("\n\n");

    case "code":
      return block.files
        .map((f) => `// ${f.name}\n${f.content.slice(0, 1200)}`)
        .join("\n\n");

    case "image":
      // A model can't see the picture, so give it what a reader would take
      // from it: what it's called, and what it's said to show.
      return [block.alt, block.caption].filter(Boolean).join(" — ") ||
        "an image with no description";

    case "bibliography":
      // Rendered from project.sources, so the sources themselves are the
      // content worth handing over.
      return (project.sources ?? [])
        .map((s) => `${s.authors.map((a) => a.family).join(", ")} — ${s.title}`)
        .join("\n");

    case "toc":
      // Derived from the headings the model can already see. Repeating them
      // would spend context on saying the same thing twice.
      return "[contents page — built from the headings below]";
  }
}

/**
 * Board items read as text too, so boards can be asked about.
 *
 * Structure is part of the meaning on a board: which frame a sticky sits in,
 * and what points at what. A flat list of note text throws both away, so items
 * are reported under their frame and connectors are spelled out as arrows.
 */
export function boardToText(project: Project): string {
  const label = (id: string): string => {
    const i = project.board.find((b) => b.id === id);
    if (!i) return "?";
    if (i.kind === "frame") return i.title;
    if ("text" in i) return i.text.split("\n")[0].slice(0, 40) || "untitled";
    if (i.kind === "image") return i.alt || "image";
    return "card";
  };

  const describe = (i: (typeof project.board)[number]): string => {
    if (i.kind === "sticky") return `[sticky] ${i.text}`;
    if (i.kind === "text") return i.text;
    if (i.kind === "image") return `[image] ${i.alt || "untitled"}`;
    if (i.kind === "card") return `[card] project ${i.projectId}`;
    return "";
  };

  const frames = project.board.filter((i) => i.kind === "frame");
  const inside = (i: (typeof project.board)[number]) =>
    frames.find(
      (f) =>
        i.kind !== "connector" &&
        i.kind !== "frame" &&
        i.x + i.width / 2 > f.x &&
        i.x + i.width / 2 < f.x + f.width &&
        i.y + i.height / 2 > f.y &&
        i.y + i.height / 2 < f.y + f.height,
    );

  const parts: string[] = [];
  for (const f of frames) {
    const children = project.board.filter((i) => inside(i)?.id === f.id);
    parts.push(
      `## ${f.title}\n${children.map(describe).filter(Boolean).join("\n")}`.trim(),
    );
  }
  const loose = project.board.filter(
    (i) => i.kind !== "frame" && i.kind !== "connector" && !inside(i),
  );
  parts.push(...loose.map(describe).filter(Boolean));

  const links = project.board
    .filter((i) => i.kind === "connector")
    .map((c) =>
      c.kind === "connector"
        ? `${label(c.fromId)} →${c.label ? ` ${c.label} →` : ""} ${label(c.toId)}`
        : "",
    )
    .filter(Boolean);
  if (links.length) parts.push(`## Connections\n${links.join("\n")}`);

  return parts.filter(Boolean).join("\n\n");
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Row ids beyond this are omitted; the text rendering still carries the data. */
const ROW_ID_CAP = 200;

/**
 * The ids a change needs to address this block.
 *
 * Only for the block types whose changes are addressed by id — everything
 * else contributes nothing and stays out of the payload.
 */
function handles(block: Block): Partial<AIContext["blocks"][number]> {
  if (block.type === "table")
    return {
      columns: block.columns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        formula: c.formula,
      })),
      rowIds: block.rows.slice(0, ROW_ID_CAP).map((r) => r.id),
      moreRows: Math.max(0, block.rows.length - ROW_ID_CAP) || undefined,
    };

  if (block.type === "slides")
    return {
      slideIds: block.slides.map((s) => s.id),
      deckStyle: block.style ?? DEFAULT_DECK_STYLE,
    };

  return {};
}

/**
 * Trim to the character budget by shrinking the *middle* blocks first. An
 * opening and a conclusion are what cross-document questions compare, so they
 * are the last things to go.
 */
function fitToBudget(blocks: AIContext["blocks"]): AIContext["blocks"] {
  let total = blocks.reduce((n, b) => n + b.text.length, 0);
  if (total <= CONTEXT_CHAR_BUDGET) return blocks;

  const order = blocks
    .map((_, i) => i)
    .sort((a, b) => {
      // Distance from either end — middle blocks have the highest score.
      const da = Math.min(a, blocks.length - 1 - a);
      const db = Math.min(b, blocks.length - 1 - b);
      return db - da;
    });

  const out = [...blocks];
  for (const i of order) {
    if (total <= CONTEXT_CHAR_BUDGET) break;
    const block = out[i];
    if (block.text.length < 400) continue;
    const keep = Math.max(300, Math.floor(block.text.length / 3));
    total -= block.text.length - keep;
    out[i] = {
      ...block,
      text: block.text.slice(0, keep) + "\n… [trimmed for length] …",
    };
  }
  return out;
}

/** The workspace half of the context, assembled once and reused. */
export function buildTeamContext(
  workspace: Workspace,
  knowledge: KnowledgeEntry[],
  files: TeamFile[],
  nameOf: (id: string) => string,
  localUserId: string,
): NonNullable<AIContext["team"]> {
  return {
    workspaceName: workspace.name,
    kind: workspace.kind,
    context: workspace.context,
    members: workspace.members.map((m) => ({
      name: nameOf(m.id),
      role: m.role,
      title: m.title,
      about: m.about,
      isYou: m.id === localUserId,
    })),
    // Unconfirmed entries still travel — flagged, so a provider can hedge
    // rather than treating a guess as established.
    knowledge: knowledge.map((k) => ({
      kind: k.kind,
      subject: k.subject,
      body: k.body,
      confirmed: k.confirmed,
      source: k.source,
    })),
    files: files
      .filter((f) => f.status === "ready" && !f.muted)
      .map((f) => ({
        id: f.id,
        name: f.name,
        // Files share the budget with the document; a long PDF must not
        // crowd out the thing being written.
        text: f.text.slice(0, 8000),
        status: f.status,
      })),
  };
}

export function buildContext(
  project: Project,
  allProjects: Project[],
  selection?: AIContext["selection"],
  team?: AIContext["team"],
  boardSelection?: string[],
  targetBlockId?: string,
): AIContext {
  const blocks: AIContext["blocks"] =
    project.kind === "board"
      ? [
          {
            id: "board",
            type: "text",
            title: "Board",
            text: boardToText(project),
            words: countWords(boardToText(project)),
          },
        ]
      : project.blocks.map((b) => {
          const text = blockToText(b, project);
          const heading = blockHeading(b);
          return {
            id: b.id,
            type: b.type,
            title: b.title,
            heading: heading?.text,
            headingLevel: heading?.level,
            text,
            words: b.type === "text" ? countWords(text) : 0,
            ...handles(b),
          };
        });

  return {
    projectId: project.id,
    projectName: project.name,
    projectKind: project.kind,
    blocks: fitToBudget(blocks),
    workspace: allProjects
      .filter((p) => p.id !== project.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        summary:
          p.kind === "board"
            ? `${p.board.length} board items`
            : `${p.blocks.length} blocks`,
      })),
    targetBlockId,
    selection,
    board: project.board.length
      ? { items: project.board, selection: boardSelection ?? [] }
      : undefined,
    team,
    words: blocks.reduce((n, b) => n + b.words, 0),
    wordGoal: project.wordGoal,
  };
}
