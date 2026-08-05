/**
 * Full-content search across the workspace, for ⌘K.
 *
 * The palette's fuzzy matcher ranks *names*; this scans *content* — prose,
 * table cells, slide titles and bullets, code — and returns the passage that
 * matched, so a result reads as evidence rather than a bare title. Plain
 * substring matching, case-insensitive: for "where did I mention the budget",
 * exactness beats cleverness.
 */

import type { Block, Project } from "./types";

export interface ContentHit {
  projectId: string;
  projectName: string;
  blockId: string;
  /** Where in the project the hit lives, e.g. "table · Budget". */
  where: string;
  /** The matching passage, trimmed around the hit. */
  snippet: string;
}

const strip = (html: string) => html.replace(/<[^>]+>/g, " ");

function* blockTexts(block: Block): Generator<{ where: string; text: string }> {
  switch (block.type) {
    case "text":
      yield { where: block.title ?? "text", text: strip(block.html) };
      break;
    case "table":
      for (const row of block.rows) {
        const cells = Object.values(row.cells)
          .filter((v) => v !== null && v !== "")
          .join(" ");
        if (cells) yield { where: block.title ?? "table", text: cells };
      }
      break;
    case "slides":
      for (const slide of block.slides)
        yield {
          where: "slide",
          text: `${slide.title} ${slide.bullets.join(" ")} ${slide.note ?? ""}`,
        };
      break;
    case "code":
      for (const file of block.files)
        yield { where: file.name, text: file.content };
      break;
    default:
      break;
  }
}

export function searchContent(
  projects: Project[],
  query: string,
  limit = 6,
): ContentHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];

  const hits: ContentHit[] = [];
  for (const project of projects) {
    for (const block of project.blocks) {
      for (const { where, text } of blockTexts(block)) {
        const at = text.toLowerCase().indexOf(q);
        if (at === -1) continue;
        const from = Math.max(0, at - 32);
        const snippet =
          (from > 0 ? "…" : "") +
          text.slice(from, at + q.length + 48).replace(/\s+/g, " ").trim() +
          (at + q.length + 48 < text.length ? "…" : "");
        hits.push({
          projectId: project.id,
          projectName: project.name,
          blockId: block.id,
          where,
          snippet,
        });
        if (hits.length >= limit) return hits;
        break; // one hit per block is enough for a palette row
      }
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
