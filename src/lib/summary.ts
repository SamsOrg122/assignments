/**
 * Cheap, synchronous descriptions of a project — used by Library rows, board
 * cards and the AI context builder. Kept out of components so all three agree
 * on what a project "is" at a glance.
 */

import { htmlToText } from "./ai/context";
import { KINDS } from "./kinds";
import type { Block, Project } from "./types";

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Words across every text block — the number a thesis writer actually wants. */
export function projectWordCount(project: Project): number {
  return project.blocks.reduce(
    (n, b) => (b.type === "text" ? n + countWords(htmlToText(b.html)) : n),
    0,
  );
}

/** The first meaningful line of prose, for previews. */
export function firstLine(project: Project, max = 120): string {
  for (const block of project.blocks) {
    if (block.type !== "text") continue;
    const text = htmlToText(block.html)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Skip the title if it just repeats the project name.
    for (const line of text) {
      if (line.toLowerCase() === project.name.toLowerCase()) continue;
      return line.length > max ? line.slice(0, max - 1) + "…" : line;
    }
  }
  if (project.kind === "board" && project.board.length) {
    const text = project.board.find(
      (i) => (i.kind === "text" || i.kind === "sticky") && i.text.trim(),
    );
    if (text && "text" in text)
      return text.text.length > max ? text.text.slice(0, max - 1) + "…" : text.text;
  }
  return "Empty";
}

/** One-line metadata: "12 slides", "1,240 words", "6 items · 2 cards". */
export function projectSummary(project: Project): string {
  switch (project.kind) {
    case "deck": {
      const slides = project.blocks.reduce(
        (n, b) => (b.type === "slides" ? n + b.slides.length : n),
        0,
      );
      return `${slides} slide${slides === 1 ? "" : "s"}`;
    }
    case "board": {
      const cards = project.board.filter((i) => i.kind === "card").length;
      return (
        `${project.board.length} item${project.board.length === 1 ? "" : "s"}` +
        (cards ? ` · ${cards} linked project${cards === 1 ? "" : "s"}` : "")
      );
    }
    case "code": {
      const files = project.blocks.reduce(
        (n, b) => (b.type === "code" ? n + b.files.length : n),
        0,
      );
      return `${files} file${files === 1 ? "" : "s"}`;
    }
    case "design":
      return KINDS.design.hint;
    default: {
      const words = projectWordCount(project);
      return words
        ? `${words.toLocaleString()} word${words === 1 ? "" : "s"}`
        : "Empty";
    }
  }
}

/** Headings in document order — powers the outline view and word goals. */
export interface Section {
  blockId: string;
  level: number;
  title: string;
  words: number;
}

export function outline(blocks: Block[]): Section[] {
  const out: Section[] = [];
  for (const block of blocks) {
    if (block.type !== "text") continue;
    const words = countWords(htmlToText(block.html));
    const match = /<h([1-3])[^>]*>(.*?)<\/h\1>/i.exec(block.html);
    out.push({
      blockId: block.id,
      level: match ? Number(match[1]) : 0,
      title: match
        ? htmlToText(match[2]).trim() || "Untitled section"
        : htmlToText(block.html).split("\n")[0]?.slice(0, 60) || "…",
      words,
    });
  }
  return out;
}
