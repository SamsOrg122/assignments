"use client";

/**
 * Export.
 *
 * One interface, four targets. Everything is generated from the document model
 * rather than scraped from the DOM, so what you get doesn't depend on what
 * happened to be on screen or which panels were open.
 *
 * A note on Word: this produces Word-compatible HTML (`.doc`), not OOXML
 * (`.docx`). Word opens it correctly and keeps headings, emphasis, lists,
 * tables and citations — which is what a supervisor asking for "a Word file"
 * actually needs. Real `.docx` means a ZIP of OOXML parts and belongs behind
 * this same `exportProject` call when it lands; nothing above here changes.
 */

import { formatReference, sortSources } from "./sources";
import { htmlToText } from "./ai/context";
import { computeFormulas } from "./formula";
import { collectNotes, renderMarkers } from "./notes";
import { anchorHeadings, headings } from "./toc";
import { DEFAULT_PAGE, pageCss, textWidth } from "./page";
import { figureFor, figureLabels, renderRefs } from "./figures";
import { renderMathIn } from "./math";
import type { Project } from "./types";

export type ExportFormat = "pdf" | "doc" | "html" | "markdown";

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  doc: "Word (.doc)",
  html: "Web page",
  markdown: "Markdown",
};

/* ── Document body ──────────────────────────────────────── */

/** Every block as HTML, in document order. */
function bodyHtml(project: Project): string {
  const style = project.citationStyle ?? "apa";
  const notes = collectNotes(project.blocks);
  const heads = headings(project.blocks);
  const labels = figureLabels(project.blocks);
  const parts: string[] = [];

  for (const block of project.blocks) {
    switch (block.type) {
      case "text":
        // Markers become numbered anchors here: the number is a decoration on
        // screen, and an exported file has no editor to decorate it.
        parts.push(
          anchorHeadings(
            renderMathIn(
              renderRefs(renderMarkers(block.html, notes), labels),
              true,
            ),
            block.id,
          ),
        );
        break;

      case "toc": {
        const entries = heads.filter((h) => h.level <= (block.depth ?? 3));
        if (!entries.length) break;
        parts.push(
          `<nav class="toc"><h2>${esc(block.title ?? "Contents")}</h2><ol>` +
            entries
              .map(
                (h) =>
                  `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`,
              )
              .join("") +
            `</ol></nav>`,
        );
        break;
      }

      case "table": {
        const derived = computeFormulas(block.columns, block.rows);
        const head = block.columns.map((c) => `<th>${esc(c.name)}</th>`).join("");
        const rows = block.rows
          .map(
            (r) =>
              `<tr>${block.columns
                .map((c) => {
                  const v =
                    c.type === "formula"
                      ? (derived[r.id]?.[c.id] ?? "")
                      : (r.cells[c.id] ?? "");
                  return `<td>${esc(String(v))}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("");
        const caption = figureFor(project.blocks, block.id);
        parts.push(
          `<table id="block-${block.id}"><caption>${
            caption ? `${esc(caption.label)}. ` : ""
          }${esc(block.title ?? "")}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
        );
        break;
      }

      case "slides":
        parts.push(
          block.slides
            .map(
              (s) =>
                `<h2>${esc(s.title)}</h2><ul>${s.bullets
                  .filter(Boolean)
                  .map((b) => `<li>${esc(b)}</li>`)
                  .join("")}</ul>`,
            )
            .join(""),
        );
        break;

      case "code":
        parts.push(
          block.files
            .map(
              (f) =>
                `<h3>${esc(f.name)}</h3><pre><code>${esc(f.content)}</code></pre>`,
            )
            .join(""),
        );
        break;

      case "image":
        // Data URLs survive PDF, HTML and Word alike — an exported document
        // that lost its figures would be the wrong kind of portable.
        if (block.src)
          parts.push(
            `<figure id="block-${block.id}" class="figure figure-${block.align ?? "centre"}">` +
              `<img src="${block.src}" alt="${esc(block.alt)}" style="width:${
                block.align === "full" ? 100 : (block.scale ?? 100)
              }%" />` +
              (() => {
                const figure = figureFor(project.blocks, block.id);
                const words = [figure ? `${figure.label}.` : "", block.caption ?? ""]
                  .filter(Boolean)
                  .join(" ");
                return words ? `<figcaption>${esc(words)}</figcaption>` : "";
              })() +
              `</figure>`,
          );
        break;

      case "bibliography": {
        const cited = new Set<string>();
        for (const b of project.blocks)
          if (b.type === "text")
            for (const m of b.html.matchAll(/data-citation="([^"]+)"/g))
              cited.add(m[1]);

        const pool =
          block.scope === "cited"
            ? (project.sources ?? []).filter((s) => cited.has(s.id))
            : (project.sources ?? []);

        parts.push(
          `<h2>${esc(block.title ?? "References")}</h2>` +
            sortSources(pool)
              .map((s) => `<p class="reference">${formatReference(s, style)}</p>`)
              .join(""),
        );
        break;
      }

      case "chart":
        // Charts are canvas-rendered; a caption beats a blank rectangle.
        parts.push(
          `<p id="block-${block.id}"><em>[${esc(
            figureFor(project.blocks, block.id)?.label ?? "Chart",
          )}. ${esc(block.title ?? "")} — ${esc(block.kind)} chart]</em></p>`,
        );
        break;
    }
  }

  /*
   * The notes themselves, at the end.
   *
   * "Footnotes" and "endnotes" differ by where they are printed, and a browser
   * cannot print at the foot of a page — `float: footnote` is in the CSS spec
   * and in no shipping engine. So both settings produce a list at the end
   * here, and the heading says which it is rather than pretending. The Word
   * export is where the distinction becomes real, because OOXML has footnotes
   * the word processor lays out itself.
   */
  if (notes.length)
    parts.push(
      `<section class="notes"><h2>${
        project.notePlacement === "end" ? "Endnotes" : "Notes"
      }</h2><ol>` +
        notes
          .map(
            (n) =>
              `<li id="note-${n.id}">${esc(n.text)} <a href="#noteref-${n.id}" class="note-back">↩</a></li>`,
          )
          .join("") +
        `</ol></section>`,
    );

  return parts.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── Targets ────────────────────────────────────────────── */

/**
 * Print styling that survives the transition to paper.
 *
 * `@page` is generated from the project's own setup, so "A4, 2.5 cm margins"
 * is a setting rather than a hope. The measure follows the margins instead of
 * a fixed `40em`, which used to leave a wide margin *inside* the margin and
 * quietly make every page narrower than the one that was asked for.
 */
const printCss = (project: Project) => {
  const page = { ...DEFAULT_PAGE, ...project.page };
  return `
  ${pageCss(page)}
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.7;
    color: #111;
    max-width: ${textWidth(page)}mm;
    margin: 0 auto;
  }
  h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 .6em; }
  h2 { font-size: 15pt; line-height: 1.25; margin: 1.6em 0 .4em; page-break-after: avoid; }
  h3 { font-size: 12.5pt; margin: 1.2em 0 .3em; page-break-after: avoid; }
  p  { margin: 0 0 .8em; }
  blockquote { margin: 1em 0 1em 1.5em; color: #444; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 10.5pt; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; }
  caption { text-align: left; font-weight: bold; padding-bottom: .4em; }
  pre { background: #f4f4f4; padding: 10px; overflow-x: auto; font-size: 9.5pt; }
  .reference { padding-left: 2em; text-indent: -2em; margin-bottom: .5em; }
  .citation { white-space: nowrap; }
  figure { margin: 1.2em 0; page-break-inside: avoid; }
  figure img { max-width: 100%; height: auto; }
  .figure-centre { text-align: center; }
  figcaption { font-size: 10pt; color: #555; margin-top: .4em; }
  .notes { border-top: 1px solid #999; margin-top: 2em; padding-top: .8em; font-size: 10pt; }
  .notes h2 { font-size: 11pt; margin: 0 0 .5em; }
  .notes li { margin-bottom: .35em; }
  .note-back { text-decoration: none; color: #777; }
  .toc { margin: 1.5em 0 2em; page-break-after: avoid; }
  .toc h2 { font-size: 13pt; margin: 0 0 .5em; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { margin-bottom: .2em; }
  .toc a { color: inherit; text-decoration: none; }
  .xref-static { color: inherit; text-decoration: none; }
  .xref-missing { color: #b00; }
  .toc-l2 { padding-left: 1.2em; }
  .toc-l3 { padding-left: 2.4em; font-size: 11pt; }
  sup a { text-decoration: none; }
`;
};

function wrapDocument(project: Project, extraHead = ""): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(project.name)}</title>
${extraHead}
<style>${printCss(project)}</style>
</head><body>
${bodyHtml(project)}
</body></html>`;
}

/** Markdown, for anywhere that wants plain text with structure. */
function toMarkdown(project: Project): string {
  const html = bodyHtml(project);
  return html
    // Images first: the data URL has to survive the tag-stripping pass below,
    // and it goes in verbatim — a Markdown file that dropped its figures
    // wouldn't be the same document.
    .replace(
      /<img\s+src="([^"]*)"\s+alt="([^"]*)"[^>]*\/?>/gi,
      (_m, src, alt) => `\n![${alt}](${src})\n`,
    )
    .replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi, (_m, t) => `\n*${htmlToText(t)}*\n`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n# ${htmlToText(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n## ${htmlToText(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n### ${htmlToText(t)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `- ${htmlToText(t)}\n`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, t) => `\n> ${htmlToText(t)}\n`)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, t) => `**${htmlToText(t)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, t) => `_${htmlToText(t)}_`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => `\n${htmlToText(t)}\n`)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick — Safari needs the URL alive through the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "document";

export function exportProject(project: Project, format: ExportFormat): void {
  const name = slug(project.name);

  switch (format) {
    case "pdf": {
      // Print the *document*, not the app: a clean window means panels,
      // cursors and chrome can't leak into the output.
      const win = window.open("", "_blank", "width=820,height=1000");
      if (!win) {
        window.print();
        return;
      }
      win.document.write(wrapDocument(project));
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
      return;
    }

    case "doc":
      download(
        `${name}.doc`,
        wrapDocument(
          project,
          `<meta name="ProgId" content="Word.Document" /><meta name="Generator" content="Assignments" />`,
        ),
        "application/msword",
      );
      return;

    case "html":
      download(`${name}.html`, wrapDocument(project), "text/html");
      return;

    case "markdown":
      download(`${name}.md`, toMarkdown(project), "text/markdown");
      return;
  }
}
