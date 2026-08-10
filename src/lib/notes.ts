/**
 * Notes, gathered in document order.
 *
 * On screen the numbering is a CSS counter and nothing needs computing. This
 * is for everywhere the counter cannot reach: the notes list under the
 * document, the exported file, and what the assistant is shown.
 *
 * Parsed with regular expressions rather than `DOMParser` on purpose — export
 * and the AI context both run through code paths that must work without a DOM,
 * and a second implementation that only works in the browser is a second
 * implementation that drifts.
 */

import type { Block } from "./types";

export interface Note {
  /** Stable id, so a marker can link to its note and back. */
  id: string;
  text: string;
  /** Which block it sits in — enough to scroll back to it. */
  blockId: string;
  /** 1-based, in document order. The number a reader sees. */
  number: number;
}

/** Where notes are printed. Screen always shows them at the end. */
export type NotePlacement = "foot" | "end";

const unescapeHtml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    // Ampersand last, or "&amp;lt;" would come out as "<".
    .replace(/&amp;/g, "&");

export const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One attribute out of a tag, whatever order the attributes are written in. */
const attr = (tag: string, name: string): string => {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match ? unescapeHtml(match[1]) : "";
};

const MARKER = /<sup\b[^>]*\bdata-footnote="[^"]*"[^>]*>(?:<\/sup>)?/gi;

/** Every note in the project, numbered the way a reader would number them. */
export function collectNotes(blocks: Block[]): Note[] {
  const notes: Note[] = [];
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const tag of block.html.match(MARKER) ?? []) {
      const id = attr(tag, "data-footnote");
      if (!id) continue;
      notes.push({
        id,
        text: attr(tag, "data-note"),
        blockId: block.id,
        number: notes.length + 1,
      });
    }
  }
  return notes;
}

/**
 * The same HTML with each marker turned into a real, numbered link.
 *
 * Used by export, where there is no stylesheet of ours to carry the counter
 * and the number has to be in the markup. Anchors point both ways so a reader
 * can get to the note and back — the thing that makes notes usable on screen
 * and the first thing a naive exporter loses.
 */
export function renderMarkers(html: string, notes: Note[]): string {
  const byId = new Map(notes.map((n) => [n.id, n]));
  return html.replace(MARKER, (tag) => {
    const note = byId.get(attr(tag, "data-footnote"));
    if (!note) return "";
    return `<sup class="noteref" id="noteref-${note.id}" data-n="${note.number}"><a href="#note-${note.id}">${note.number}</a></sup>`;
  });
}

/** How many notes a block contains. Used to seed the next block's numbering. */
export const countMarkers = (html: string) => (html.match(MARKER) ?? []).length;

/** Strip markers entirely — for plain text renderings that carry notes separately. */
export const stripMarkers = (html: string) => html.replace(MARKER, "");
