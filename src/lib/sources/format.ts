/**
 * Citation formatting.
 *
 * Four styles, written out rather than pulled from a CSL engine: the whole
 * point of this feature is that students stop hand-formatting, and the four
 * that get demanded cover almost every course. Each returns light HTML so
 * italics land where the style requires them.
 *
 * These implement the common cases faithfully (journal article, book, chapter,
 * web page) — not every edge of every manual. Where a style has a rule we don't
 * implement, we fall back to the closest sensible form rather than inventing.
 */

import type { CitationStyle, Source } from "../types";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const em = (s: string) => `<em>${escape(s)}</em>`;

/** Append a full stop unless the text already ends in one — "J." + "." = "J..". */
const dot = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const initials = (given?: string) =>
  (given ?? "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");

/* ── Author lists ───────────────────────────────────────── */

function authorsApa(source: Source): string {
  const names = source.authors.map((a) =>
    a.given ? `${a.family}, ${initials(a.given)}` : a.family,
  );
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20)
    return `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`;
  return `${names.slice(0, 19).join(", ")}, … ${names.at(-1)}`;
}

function authorsMla(source: Source): string {
  const [first, ...rest] = source.authors;
  if (!first) return "";
  const lead = first.given ? `${first.family}, ${first.given}` : first.family;
  if (rest.length === 0) return lead;
  // MLA 9: three or more authors collapse to "et al."
  if (rest.length >= 2) return `${lead}, et al.`;
  const second = rest[0];
  return `${lead}, and ${second.given ? `${second.given} ${second.family}` : second.family}`;
}

function authorsChicago(source: Source): string {
  const [first, ...rest] = source.authors;
  if (!first) return "";
  const lead = first.given ? `${first.family}, ${first.given}` : first.family;
  if (rest.length === 0) return lead;
  const others = rest.map((a) => (a.given ? `${a.given} ${a.family}` : a.family));
  if (others.length === 1) return `${lead}, and ${others[0]}`;
  return `${lead}, ${others.slice(0, -1).join(", ")}, and ${others.at(-1)}`;
}

function authorsHarvard(source: Source): string {
  const names = source.authors.map((a) =>
    a.given ? `${a.family}, ${initials(a.given).replace(/\s/g, "")}` : a.family,
  );
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/* ── Full references ────────────────────────────────────── */

const yearOf = (s: Source) => (s.year ? String(s.year) : "n.d.");

const accessedOn = (s: Source) =>
  s.accessed
    ? new Date(s.accessed).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

function apa(s: Source): string {
  const parts: string[] = [];
  const who = authorsApa(s);
  // APA keeps the initial's own full stop: "Nielsen, J. (1994)."
  parts.push(
    who
      ? `${escape(who)} (${yearOf(s)}).`
      : `${escape(s.title)} (${yearOf(s)}).`,
  );
  if (who) parts.push(dot(escape(s.title)));

  if (s.kind === "article" && s.container) {
    let ref = em(s.container);
    if (s.volume) ref += `, ${em(s.volume)}`;
    if (s.issue) ref += `(${escape(s.issue)})`;
    if (s.pages) ref += `, ${escape(s.pages)}`;
    parts.push(`${ref}.`);
  } else if (s.kind === "book" || s.kind === "report" || s.kind === "thesis") {
    if (s.publisher) parts.push(`${escape(s.publisher)}.`);
  } else if (s.container) {
    parts.push(`${em(s.container)}.`);
  }

  if (s.doi) parts.push(`https://doi.org/${escape(s.doi)}`);
  else if (s.url) parts.push(escape(s.url));

  return parts.filter(Boolean).join(" ");
}

function mla(s: Source): string {
  const parts: string[] = [];
  const who = authorsMla(s);
  if (who) parts.push(dot(escape(who)));
  parts.push(s.kind === "book" ? `${em(s.title)}.` : `“${escape(s.title)}.”`);

  if (s.container && s.kind !== "book") parts.push(`${em(s.container)},`);
  if (s.publisher) parts.push(`${escape(s.publisher)},`);
  if (s.volume) parts.push(`vol. ${escape(s.volume)},`);
  if (s.issue) parts.push(`no. ${escape(s.issue)},`);
  if (s.year) parts.push(`${s.year},`);
  if (s.pages) parts.push(`pp. ${escape(s.pages)}.`);
  if (s.url) parts.push(`${escape(s.url)}.`);
  if (s.accessed) parts.push(`Accessed ${accessedOn(s)}.`);

  return parts.join(" ").replace(/,\s*$/, ".");
}

function chicago(s: Source): string {
  const parts: string[] = [];
  const who = authorsChicago(s);
  if (who) parts.push(dot(escape(who)));
  parts.push(s.kind === "book" ? `${em(s.title)}.` : `“${escape(s.title)}.”`);
  if (s.container && s.kind !== "book") parts.push(`${em(s.container)}`);
  if (s.volume) parts.push(`${escape(s.volume)}`);
  if (s.issue) parts.push(`no. ${escape(s.issue)}`);
  if (s.year) parts.push(`(${s.year})`);
  if (s.pages) parts.push(`: ${escape(s.pages)}.`);
  else parts.push(".");
  if (s.publisher && s.kind === "book") parts.push(`${escape(s.publisher)}.`);
  if (s.doi) parts.push(`https://doi.org/${escape(s.doi)}.`);
  else if (s.url) parts.push(`${escape(s.url)}.`);

  return parts.join(" ").replace(/\s+([.:])/g, "$1");
}

function harvard(s: Source): string {
  const parts: string[] = [];
  const who = authorsHarvard(s);
  parts.push(`${escape(who || s.title)} (${yearOf(s)})`);
  if (who) parts.push(`${escape(s.title)}.`);
  if (s.container) parts.push(`${em(s.container)},`);
  if (s.volume) parts.push(`${escape(s.volume)}`);
  if (s.issue) parts.push(`(${escape(s.issue)}),`);
  if (s.pages) parts.push(`pp. ${escape(s.pages)}.`);
  if (s.publisher) parts.push(`${escape(s.publisher)}.`);
  if (s.url) parts.push(`Available at: ${escape(s.url)}`);
  if (s.accessed) parts.push(`(Accessed: ${accessedOn(s)}).`);

  return parts.join(" ").replace(/\s+([.,])/g, "$1");
}

export function formatReference(source: Source, style: CitationStyle): string {
  switch (style) {
    case "mla":
      return mla(source);
    case "chicago":
      return chicago(source);
    case "harvard":
      return harvard(source);
    default:
      return apa(source);
  }
}

/* ── In-text citations ──────────────────────────────────── */

/**
 * The marker that appears in the prose. Numeric styles would use an index;
 * all four here are author–date or author–page, so the marker is derived from
 * the source itself and never needs renumbering when sources are reordered.
 */
export function formatInline(source: Source, style: CitationStyle): string {
  const first = source.authors[0];
  const name = first?.family ?? (source.title || "Untitled").split(/\s+/)[0];
  const many = source.authors.length > 2;
  const two = source.authors.length === 2;

  const who = many
    ? `${name} et al.`
    : two
      ? `${name} & ${source.authors[1].family}`
      : name;

  switch (style) {
    case "mla":
      return `(${who}${source.pages ? ` ${source.pages.split("–")[0]}` : ""})`;
    case "chicago":
      return `(${who} ${yearOf(source)})`;
    case "harvard":
      return `(${who}, ${yearOf(source)})`;
    default:
      return `(${who}, ${yearOf(source)})`;
  }
}

/** Bibliographies sort by author family name, then year. */
export function sortSources(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => {
    const an = a.authors[0]?.family ?? a.title;
    const bn = b.authors[0]?.family ?? b.title;
    return an.localeCompare(bn) || (a.year ?? 0) - (b.year ?? 0);
  });
}

export const STYLE_LABELS: Record<CitationStyle, string> = {
  apa: "APA 7",
  mla: "MLA 9",
  chicago: "Chicago",
  harvard: "Harvard",
};
