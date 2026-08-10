/**
 * Figure and table numbers.
 *
 * Two sequences, not one: "Figure 3" and "Table 3" can both exist in the same
 * document and every style guide expects them to. Pictures and charts share
 * the figure sequence, because a reader looking at a bar chart under a caption
 * calls it a figure.
 *
 * Nothing is stored, for the same reason nothing is stored for notes: insert a
 * picture halfway through and every number after it changes. A stored number
 * is a number that is wrong as soon as the document is edited, which is the
 * entire point of having the feature.
 */

import type { Block } from "./types";

export type FigureKind = "figure" | "table";

export interface Figure {
  blockId: string;
  kind: FigureKind;
  number: number;
  /** "Figure 3", "Table 1" — what a caption opens with and a reference says. */
  label: string;
  /** The author's own caption, if there is one. */
  caption?: string;
}

const kindOf = (block: Block): FigureKind | null => {
  if (block.type === "image" || block.type === "chart") return "figure";
  if (block.type === "table") return "table";
  return null;
};

/** Every numbered thing in the document, in order. */
export function figures(blocks: Block[]): Figure[] {
  const counts: Record<FigureKind, number> = { figure: 0, table: 0 };
  const out: Figure[] = [];
  for (const block of blocks) {
    const kind = kindOf(block);
    if (!kind) continue;
    // An empty picture frame is not a figure yet. Numbering it would make
    // every reference below it point one place too far.
    if (block.type === "image" && !block.src) continue;
    counts[kind] += 1;
    out.push({
      blockId: block.id,
      kind,
      number: counts[kind],
      label: `${kind === "figure" ? "Figure" : "Table"} ${counts[kind]}`,
      caption:
        block.type === "image"
          ? block.caption
          : block.type === "table" || block.type === "chart"
            ? block.title
            : undefined,
    });
  }
  return out;
}

/** blockId → "Figure 3". What a cross-reference renders as. */
export function figureLabels(blocks: Block[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of figures(blocks)) map[f.blockId] = f.label;
  return map;
}

/** This block's number, or nothing if it isn't a numbered thing. */
export const figureFor = (blocks: Block[], blockId: string): Figure | undefined =>
  figures(blocks).find((f) => f.blockId === blockId);

const MARKER = /<span\b[^>]*\bdata-ref="[^"]*"[^>]*>(?:[\s\S]*?<\/span>)?/gi;

const refTarget = (tag: string): string => {
  const match = /data-ref="([^"]*)"/.exec(tag);
  return match ? match[1] : "";
};

/**
 * Cross-references, resolved into text.
 *
 * For export and anywhere else without an editor to decorate the markers. A
 * reference whose target has been deleted becomes a visible "[missing
 * reference]" rather than disappearing — a sentence that reads "as shown in ,
 * the effect" is worse than one that admits the problem.
 */
export function renderRefs(html: string, labels: Record<string, string>): string {
  return html.replace(MARKER, (tag) => {
    const target = refTarget(tag);
    const label = labels[target];
    // `xref-static` rather than `xref`: the editor's markers carry their text
    // in an attribute and CSS writes it out, and these already have real text.
    return label
      ? `<a href="#block-${target}" class="xref-static">${label}</a>`
      : `<span class="xref-static xref-missing">[missing reference]</span>`;
  });
}

/** Reference markers as plain text, for renderings that have no markup. */
export const refsToText = (html: string, labels: Record<string, string>) =>
  html.replace(MARKER, (tag) => labels[refTarget(tag)] ?? "[missing reference]");
