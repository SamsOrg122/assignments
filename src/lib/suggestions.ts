"use client";

/**
 * Accepting and rejecting proposed changes.
 *
 * Works on the stored HTML rather than through an editor, because the review
 * happens in a panel that stands outside every block — and because "accept
 * everything" has to reach blocks nobody has opened.
 *
 * `DOMParser` rather than regular expressions: these are nested inline
 * elements with marks inside them, and unwrapping one correctly means knowing
 * where its children end. That is a parser's job, and the detached document it
 * builds runs nothing.
 */

export interface SuggestionRun {
  kind: "insert" | "delete";
  text: string;
  by: string;
  /** Position among the runs in this block, for accepting one at a time. */
  index: number;
}

const parse = (html: string): Document =>
  new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

const runsIn = (doc: Document): Element[] =>
  Array.from(doc.body.querySelectorAll("[data-suggest]"));

/** Every proposed change in a block, in reading order. */
export function suggestionRuns(html: string): SuggestionRun[] {
  if (!html.includes("data-suggest")) return [];
  return runsIn(parse(html)).map((el, index) => ({
    kind: el.getAttribute("data-suggest") === "delete" ? "delete" : "insert",
    text: el.textContent ?? "",
    by: el.getAttribute("data-by") ?? "",
    index,
  }));
}

export const countSuggestions = (html: string) =>
  html.includes("data-suggest") ? suggestionRuns(html).length : 0;

/** Replace an element with its own children. */
function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * Apply a verdict.
 *
 * Accepting an insertion keeps the words and drops the marking; accepting a
 * deletion removes the words. Rejecting is the mirror. `index` of `null` means
 * every run in the block.
 */
export function resolveSuggestions(
  html: string,
  verdict: "accept" | "reject",
  index: number | null = null,
): string {
  if (!html.includes("data-suggest")) return html;
  const doc = parse(html);
  const runs = runsIn(doc);
  const chosen = index === null ? runs : runs[index] ? [runs[index]] : [];

  for (const el of chosen) {
    const isInsert = el.getAttribute("data-suggest") !== "delete";
    const keep = verdict === "accept" ? isInsert : !isInsert;
    if (keep) unwrap(el);
    else el.parentNode?.removeChild(el);
  }
  return doc.body.innerHTML;
}
