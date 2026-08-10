/**
 * The headings of a document, in order.
 *
 * Distinct from `summary.ts`'s `outline`, which describes *blocks* — one entry
 * each, whether or not it opens with a heading — because that is what a
 * navigation sidebar wants. A table of contents wants the headings themselves:
 * all of them, including three in one block and none in the next.
 *
 * Nothing is stored. A contents page that can disagree with the document is
 * worse than none, and every word processor that stores one has a "update
 * field" ritual to paper over the gap.
 */

import type { Block } from "./types";
import { htmlToText } from "./ai/context";

export interface Heading {
  /** Where it lives, so a click can scroll to it. */
  blockId: string;
  /** Which heading it is *within that block*, from zero. */
  index: number;
  level: number;
  text: string;
  /** Stable anchor, derived rather than stored. */
  id: string;
}

const HEADING = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

export function headings(blocks: Block[]): Heading[] {
  const found: Heading[] = [];
  for (const block of blocks) {
    if (block.type !== "text") continue;
    let index = 0;
    for (const match of block.html.matchAll(HEADING)) {
      const text = htmlToText(match[2]).trim();
      // A heading someone has emptied but not deleted is not a section.
      if (text)
        found.push({
          blockId: block.id,
          index,
          level: Number(match[1]),
          text,
          id: `h-${block.id}-${index}`,
        });
      index += 1;
    }
  }
  return found;
}

/**
 * The same HTML with an anchor on every heading.
 *
 * Only export needs this. On screen the contents page finds its target by
 * walking the block's headings in the DOM, which avoids writing ids into
 * everybody's stored markup for a feature most documents never use.
 */
export function anchorHeadings(html: string, blockId: string): string {
  let index = -1;
  return html.replace(/<h([1-3])\b([^>]*)>/gi, (_whole, level: string, rest: string) => {
    index += 1;
    return `<h${level}${rest} id="h-${blockId}-${index}">`;
  });
}
