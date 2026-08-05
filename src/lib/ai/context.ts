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

import type { Block, Project } from "../types";
import type { KnowledgeEntry, TeamFile, Workspace } from "../team/types";
import { computeFormulas } from "../formula";
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
    case "text":
      return htmlToText(block.html);

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

    case "bibliography":
      // Rendered from project.sources, so the sources themselves are the
      // content worth handing over.
      return (project.sources ?? [])
        .map((s) => `${s.authors.map((a) => a.family).join(", ")} — ${s.title}`)
        .join("\n");
  }
}

/** Board items read as text too, so boards can be asked about. */
export function boardToText(project: Project): string {
  return project.board
    .map((i) => {
      if (i.kind === "sticky") return `[sticky] ${i.text}`;
      if (i.kind === "text") return i.text;
      if (i.kind === "image") return `[image] ${i.alt || "untitled"}`;
      return `[card] project ${i.projectId}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

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
    selection,
    team,
    words: blocks.reduce((n, b) => n + b.words, 0),
    wordGoal: project.wordGoal,
  };
}
