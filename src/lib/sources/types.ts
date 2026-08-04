/**
 * The source-resolution seam.
 *
 * `resolveSource(input)` takes whatever the user pasted — a URL, a DOI, an
 * arXiv id, a BibTeX record, or a bare citation string — and returns structured
 * metadata. The shipped resolver parses locally; a real one calls Crossref /
 * OpenLibrary / Unpaywall and returns the same shape.
 *
 * Anything the resolver *guessed* rather than read is listed in `uncertain`, so
 * the UI can mark those fields for checking instead of quietly presenting a
 * guess as a fact. That distinction is the whole reason this is an interface.
 */

import type { Source } from "../types";

export interface SourceResolver {
  readonly name: string;
  /** True when this resolver recognises the input at all. */
  canHandle(input: string): boolean;
  resolve(input: string, signal?: AbortSignal): Promise<Source>;
}
