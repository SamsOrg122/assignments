"use client";

/**
 * Source resolution entry point.
 *
 * `resolveSource(input)` is the only thing the UI calls. The shipped resolver
 * parses locally and never touches the network; registering a fetching
 * resolver (Crossref for DOIs, OpenLibrary for ISBNs, a readability service
 * for URLs) with `setSourceResolver` upgrades every path at once.
 */

import { parseSource, detect } from "./parse";
import type { SourceResolver } from "./types";
import type { Source } from "../types";

export { parseSource, detect } from "./parse";
export {
  formatReference,
  formatInline,
  sortSources,
  STYLE_LABELS,
} from "./format";
export type { SourceResolver } from "./types";

const localResolver: SourceResolver = {
  name: "local",
  canHandle: () => true,
  async resolve(input) {
    // A beat of latency so the resolving state is visible rather than a flash.
    await new Promise((r) => setTimeout(r, 260));
    return parseSource(input);
  },
};

let resolver: SourceResolver = localResolver;

export function setSourceResolver(next: SourceResolver | null) {
  resolver = next ?? localResolver;
}

export function sourceResolverName(): string {
  return resolver.name;
}

export function resolveSource(
  input: string,
  signal?: AbortSignal,
): Promise<Source> {
  const trimmed = input.trim();
  if (!trimmed) return Promise.reject(new Error("Nothing to resolve"));
  return resolver.canHandle(trimmed)
    ? resolver.resolve(trimmed, signal)
    : localResolver.resolve(trimmed, signal);
}

/** Human label for what the resolver thinks it was handed. */
export function describeInput(input: string): string {
  switch (detect(input)) {
    case "doi":
      return "DOI";
    case "arxiv":
      return "arXiv";
    case "isbn":
      return "ISBN";
    case "bibtex":
      return "BibTeX";
    case "url":
      return "link";
    default:
      return "citation";
  }
}
