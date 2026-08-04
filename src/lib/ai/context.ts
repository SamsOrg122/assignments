/**
 * Flattens a project into the plain-text view handed to the AI provider.
 *
 * This is where "AI is aware of the whole project" is actually implemented:
 * every block contributes, not just the one the user is standing in.
 */

import type { Block, Project } from "../types";
import { computeFormulas } from "../formula";
import type { AIContext } from "./types";

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
  }
}

export function buildContext(
  project: Project,
  selection?: AIContext["selection"],
): AIContext {
  return {
    projectId: project.id,
    projectName: project.name,
    blocks: project.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      text: blockToText(b, project),
    })),
    selection,
  };
}
