/**
 * Local source parsing.
 *
 * No network: everything here is derived from the string the user pasted. That
 * sounds limiting, but a DOI, an arXiv id, a BibTeX record and a well-formed
 * URL all carry real structure, and reading it beats an empty form. Whatever
 * had to be inferred is reported in `uncertain` so the UI can flag it.
 */

import { uid } from "../factories";
import type { Source, SourceKind } from "../types";

/* ── Detectors ──────────────────────────────────────────── */

const DOI = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;
const ARXIV = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})|(?:^|\s)arXiv:(\d{4}\.\d{4,5})/i;
const ISBN = /\b(?:ISBN[-\s]?(?:1[03])?:?\s*)?((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])\b/;

export type InputKind = "doi" | "arxiv" | "isbn" | "bibtex" | "url" | "citation";

export function detect(input: string): InputKind {
  const s = input.trim();
  if (/^@\w+\s*\{/.test(s)) return "bibtex";
  if (ARXIV.test(s)) return "arxiv";
  if (DOI.test(s)) return "doi";
  if (/^https?:\/\//i.test(s)) return "url";
  if (ISBN.test(s)) return "isbn";
  return "citation";
}

/* ── BibTeX ─────────────────────────────────────────────── */

const BIBTEX_KIND: Record<string, SourceKind> = {
  article: "article",
  book: "book",
  incollection: "chapter",
  inbook: "chapter",
  inproceedings: "article",
  techreport: "report",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  misc: "web",
  online: "web",
};

function parseBibtex(input: string): Source {
  const typeMatch = /^@(\w+)/.exec(input.trim());
  const fields: Record<string, string> = {};

  // Braced or quoted values, one field per match.
  for (const m of input.matchAll(/(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|([^,\n}]+))/g)) {
    const key = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim().replace(/\s+/g, " ");
    if (value) fields[key] = value;
  }

  const authors = (fields.author ?? "")
    .split(/\s+and\s+/i)
    .map(parseAuthor)
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return {
    id: uid(),
    kind: BIBTEX_KIND[typeMatch?.[1].toLowerCase() ?? ""] ?? "article",
    authors,
    title: strip(fields.title ?? "Untitled"),
    container: strip(fields.journal ?? fields.booktitle ?? fields.publisher ?? ""),
    publisher: strip(fields.publisher ?? fields.school ?? fields.institution ?? ""),
    year: toYear(fields.year),
    volume: fields.volume,
    issue: fields.number,
    pages: fields.pages?.replace(/--/g, "–"),
    doi: fields.doi,
    url: fields.url,
    raw: input,
    uncertain: [],
  };
}

const strip = (s: string) => s.replace(/[{}]/g, "").trim();

/** "Chen, Mira" and "Mira Chen" both arrive; normalise to family/given. */
function parseAuthor(raw: string): { family: string; given?: string } | null {
  const name = strip(raw);
  if (!name) return null;
  if (name.includes(",")) {
    const [family, given] = name.split(",");
    return { family: family.trim(), given: given?.trim() || undefined };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { family: parts[0] };
  return { family: parts.at(-1)!, given: parts.slice(0, -1).join(" ") };
}

const toYear = (s?: string) => {
  const n = Number((s ?? "").match(/\d{4}/)?.[0]);
  return Number.isFinite(n) ? n : undefined;
};

/* ── URLs ───────────────────────────────────────────────── */

/** Publishers whose domain tells us more than the slug does. */
const KNOWN_HOSTS: Record<string, string> = {
  "nature.com": "Nature",
  "science.org": "Science",
  "acm.org": "ACM Digital Library",
  "dl.acm.org": "ACM Digital Library",
  "ieee.org": "IEEE",
  "ieeexplore.ieee.org": "IEEE Xplore",
  "springer.com": "Springer",
  "link.springer.com": "Springer",
  "sciencedirect.com": "ScienceDirect",
  "jstor.org": "JSTOR",
  "pubmed.ncbi.nlm.nih.gov": "PubMed",
  "arxiv.org": "arXiv",
  "nytimes.com": "The New York Times",
  "theguardian.com": "The Guardian",
  "bbc.co.uk": "BBC News",
  "wikipedia.org": "Wikipedia",
};

/** Turn a URL slug into something title-shaped. Always flagged uncertain. */
function titleFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  // Prefer the most word-like segment rather than the last plausible one:
  // "/articles/s41586-023-06004-9" should not become "Articles", and
  // "/2024/05/why-density-costs" should become the slug, not the month.
  const scored = segments
    .filter((s) => /[a-z]{3,}/i.test(s) && !/^\d+$/.test(s))
    .map((s) => ({
      s,
      words: s.split(/[-_+]/).filter((w) => /^[a-z]{3,}$/i.test(w)).length,
    }))
    .sort((a, b) => b.words - a.words);
  const last = scored[0]?.s ?? url.hostname;
  return last
    .replace(/\.(html?|php|aspx?|pdf)$/i, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function parseUrl(input: string): Source {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return bare(input);
  }

  const host = url.hostname.replace(/^www\./, "");
  const container =
    KNOWN_HOSTS[host] ??
    host
      .split(".")
      .slice(0, -1)
      .join(".")
      .replace(/^\w/, (c) => c.toUpperCase());

  // A date in the path is a strong signal on news and blog URLs.
  const year = toYear(url.pathname.match(/\/(19|20)\d{2}\//)?.[0]);

  return {
    id: uid(),
    kind: "web",
    authors: [],
    title: titleFromUrl(url),
    container,
    year,
    url: url.toString(),
    accessed: Date.now(),
    raw: input,
    // Everything here was inferred from the URL, not read from the page.
    uncertain: ["title", "authors", ...(year ? [] : ["year"])],
  };
}

/* ── Identifiers ────────────────────────────────────────── */

function parseDoi(input: string): Source {
  const doi = DOI.exec(input)![1];
  return {
    id: uid(),
    kind: "article",
    authors: [],
    title: "",
    doi,
    url: `https://doi.org/${doi}`,
    raw: input,
    // A DOI is an exact handle to metadata we can't fetch offline. Say so.
    uncertain: ["title", "authors", "year", "container"],
  };
}

function parseArxiv(input: string): Source {
  const m = ARXIV.exec(input)!;
  const id = m[1] ?? m[2];
  const year = 2000 + Number(id.slice(0, 2));
  return {
    id: uid(),
    kind: "article",
    authors: [],
    title: "",
    container: "arXiv",
    year: Number.isFinite(year) ? year : undefined,
    url: `https://arxiv.org/abs/${id}`,
    raw: input,
    uncertain: ["title", "authors"],
  };
}

function parseIsbn(input: string): Source {
  return {
    id: uid(),
    kind: "book",
    authors: [],
    title: "",
    raw: input.trim(),
    uncertain: ["title", "authors", "year", "publisher"],
  };
}

/* ── Free-text citations ────────────────────────────────── */

/**
 * A pasted reference like:
 *   Chen, M., & Raman, D. (2024). Interface density. Journal of X, 12(3), 1–20.
 * Enough structure survives most styles to pull authors, year and title out.
 */
function parseCitation(input: string): Source {
  const text = input.trim().replace(/\s+/g, " ");
  const uncertain: string[] = [];

  const year = toYear(text.match(/\((\d{4})[a-z]?\)/)?.[1] ?? text.match(/\b(19|20)\d{2}\b/)?.[0]);
  if (!year) uncertain.push("year");

  // Authors are whatever precedes the first "(year)" or the first full stop.
  const split = text.match(/^(.*?)\(\s*\d{4}[a-z]?\s*\)\.?\s*(.*)$/);
  const authorPart = split ? split[1] : text.split(/\.\s/)[0];
  const rest = split ? split[2] : text.split(/\.\s/).slice(1).join(". ");

  // "Nielsen, J." and "Chen, M., & Raman, D." — pair each family name with the
  // initials that follow it. Splitting naively on commas would separate the two
  // and throw the initials away.
  const paired = [
    ...authorPart.matchAll(
      /([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?),\s*((?:[A-Z]\.\s*){1,4})/gu,
    ),
  ].map((m) => ({ family: m[1].trim(), given: m[2].trim() }));

  const authors = paired.length
    ? paired.slice(0, 8)
    : authorPart
        .replace(/&/g, ",")
        .split(/,(?![^(]*\))/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && /[a-z]/i.test(s))
        // Bare initials with no family name attached carry nothing.
        .filter((s) => !/^[A-Z]\.?( [A-Z]\.?)*$/.test(s))
        .map((s) => ({ family: s.replace(/\.$/, "").trim() }))
        .slice(0, 8);
  if (authors.length === 0) uncertain.push("authors");

  const [title, ...tail] = rest.split(/\.\s+/);
  // Trailing full stops belong to the citation's punctuation, not the field —
  // keeping them produces "Morgan Kaufmann.." once the formatter adds its own.
  const trailing = tail
    .join(". ")
    .replace(/,?\s*\d+\(\d+\).*$/, "")
    .replace(/[.,;\s]+$/, "")
    .trim();

  const pages = text.match(/\b(\d+\s*[–-]\s*\d+)\b\.?$/)?.[1]?.replace(/\s*[–-]\s*/, "–");
  const volumeIssue = text.match(/\b(\d+)\((\d+)\)/);

  // Volume/issue/page numbers are what distinguish a journal article from a
  // book. Without them the trailing segment is a publisher, and italicising it
  // as a container would be wrong in every style.
  const isArticle = Boolean(volumeIssue || pages);

  return {
    id: uid(),
    kind: isArticle ? "article" : trailing ? "book" : "web",
    authors,
    title: (title ?? text).replace(/[.,;\s]+$/, "").trim() || "Untitled",
    container: isArticle ? trailing || undefined : undefined,
    publisher: isArticle ? undefined : trailing || undefined,
    year,
    volume: volumeIssue?.[1],
    issue: volumeIssue?.[2],
    pages,
    doi: DOI.exec(text)?.[1],
    raw: input,
    uncertain,
  };
}

function bare(input: string): Source {
  return {
    id: uid(),
    kind: "web",
    authors: [],
    title: input.trim().slice(0, 120) || "Untitled",
    raw: input,
    uncertain: ["title", "authors", "year"],
  };
}

/* ── Entry point ────────────────────────────────────────── */

export function parseSource(input: string): Source {
  switch (detect(input)) {
    case "bibtex":
      return parseBibtex(input);
    case "arxiv":
      return parseArxiv(input);
    case "doi":
      return parseDoi(input);
    case "url":
      return parseUrl(input);
    case "isbn":
      return parseIsbn(input);
    default:
      return parseCitation(input);
  }
}
