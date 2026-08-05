/**
 * Find & replace over a project's prose.
 *
 * Operates on *text nodes* via a real parser, never on the raw HTML string —
 * a naive string replace would happily rewrite tag names and attribute values
 * the moment someone searches for "div". Marks, links and citations survive
 * because only the text between tags is touched.
 */

import type { Block, TextBlock } from "./types";

export interface FindOptions {
  regex: boolean;
  caseSensitive: boolean;
}

function pattern(query: string, options: FindOptions): RegExp | null {
  if (!query) return null;
  try {
    const source = options.regex
      ? query
      : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(source, options.caseSensitive ? "g" : "gi");
  } catch {
    // A half-typed regex is not an error state, just not a search yet.
    return null;
  }
}

/** Total matches across every text block. */
export function countMatches(
  blocks: Block[],
  query: string,
  options: FindOptions,
): number {
  const re = pattern(query, options);
  if (!re) return 0;
  let count = 0;
  for (const block of blocks) {
    if (block.type !== "text") continue;
    const doc = new DOMParser().parseFromString(block.html, "text/html");
    count += (doc.body.textContent ?? "").match(re)?.length ?? 0;
  }
  return count;
}

/** Replace across all text blocks, returning the new blocks and the count. */
export function replaceAll(
  blocks: Block[],
  query: string,
  replacement: string,
  options: FindOptions,
): { blocks: Block[]; replaced: number } {
  const re = pattern(query, options);
  if (!re) return { blocks, replaced: 0 };

  let replaced = 0;
  const next = blocks.map((block) => {
    if (block.type !== "text") return block;
    const doc = new DOMParser().parseFromString(block.html, "text/html");
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let touched = false;

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      replaced += text.match(re)?.length ?? 0;
      node.nodeValue = text.replace(re, replacement);
      touched = true;
    }

    return touched
      ? ({ ...block, html: doc.body.innerHTML } as TextBlock)
      : block;
  });

  return { blocks: next, replaced };
}
