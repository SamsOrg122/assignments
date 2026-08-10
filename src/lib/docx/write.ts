"use client";

/**
 * A real `.docx`.
 *
 * The old Word export was Word-flavoured HTML with a `.doc` extension. Word
 * opens it, which is why it survived so long — but it is a one-way door: turn
 * on track changes, send it back, and there is nothing on this side that can
 * read it. And it has no footnotes, no headers, no page numbers, because HTML
 * has none of those.
 *
 * This writes OOXML. The parts that matter, and why each one is here rather
 * than approximated:
 *
 *   - **Footnotes** become real footnotes, so Word lays them out at the foot
 *     of the page — the thing a browser cannot do and the reason the choice
 *     between foot and end has been waiting for this file.
 *   - **Proposed changes** become `w:ins` and `w:del`: Word's own tracked
 *     changes, reviewable in Word by whoever you sent it to.
 *   - **Headers, footers and page numbers** become a header and footer part
 *     with a PAGE field, which is the other half of the page-setup panel.
 *   - **The contents page** becomes a TOC field with the current entries
 *     baked in as its result, so it reads correctly before anyone presses F9
 *     and updates properly when they do.
 *
 * Equations are the honest gap: they go in as their LaTeX source in a
 * monospaced run. Converting LaTeX to OMML is a compiler, not a function, and
 * a half-working one would produce equations that are quietly wrong.
 */

import { zipSync, strToU8 } from "fflate";
import type { Project } from "../types";
import { DEFAULT_PAGE, paperSize } from "../page";
import { collectNotes } from "../notes";
import { figureFor } from "../figures";
import { headings } from "../toc";
import { formatReference, sortSources } from "../sources";
import { computeFormulas } from "../formula";
import {
  DOC_NS,
  HEAD,
  contentTypes,
  emu,
  numbering,
  packageRels,
  styles,
  twips,
  xmlEscape,
} from "./ooxml";

interface Media {
  path: string;
  type: string;
  bytes: Uint8Array;
  relId: string;
  width: number;
  height: number;
}

/* ── Inline conversion ──────────────────────────────────── */

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** Inside a proposed insertion or deletion. */
  proposed?: "ins" | "del";
}

const runProps = (style: RunStyle) => {
  const parts: string[] = [];
  if (style.bold) parts.push("<w:b/>");
  if (style.italic) parts.push("<w:i/>");
  if (style.underline) parts.push('<w:u w:val="single"/>');
  if (style.strike) parts.push("<w:strike/>");
  if (style.code) parts.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  if (style.superscript) parts.push('<w:vertAlign w:val="superscript"/>');
  if (style.subscript) parts.push('<w:vertAlign w:val="subscript"/>');
  return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
};

/**
 * One run of text.
 *
 * `xml:space="preserve"` is not optional: without it Word collapses the space
 * between two runs, so "the **bold** word" comes out as "thebold word".
 */
const run = (text: string, style: RunStyle) =>
  `<w:r>${runProps(style)}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;

/**
 * A proposed change wraps its runs.
 *
 * A deletion's text lives in `w:delText` rather than `w:t` — using the wrong
 * one makes Word show the deleted words as ordinary text with a revision mark
 * around them, which reads as the opposite of what was meant.
 */
const revision = (inner: string, kind: "ins" | "del", author: string, at: string) => {
  const attrs = `w:id="${Math.floor(Math.random() * 1e6)}" w:author="${xmlEscape(author)}" w:date="${at}"`;
  if (kind === "ins") return `<w:ins ${attrs}>${inner}</w:ins>`;
  return `<w:del ${attrs}>${inner.replace(/<w:t /g, "<w:delText ").replace(/<\/w:t>/g, "</w:delText>")}</w:del>`;
};

interface InlineContext {
  notes: Map<string, number>;
  media: Map<string, Media>;
  author: string;
  stamp: string;
}

/** Walk an element's children, emitting runs. */
function inlineFrom(node: Node, style: RunStyle, ctx: InlineContext): string {
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    if (!text) return "";
    const body = run(text, style);
    return style.proposed
      ? revision(body, style.proposed, ctx.author, ctx.stamp)
      : body;
  }
  if (node.nodeType !== 1) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const next: RunStyle = { ...style };

  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s") next.strike = true;
  if (tag === "code") next.code = true;
  if (tag === "sub") next.subscript = true;
  if (tag === "ins" && el.hasAttribute("data-suggest")) next.proposed = "ins";
  if (tag === "del" && el.hasAttribute("data-suggest")) next.proposed = "del";

  // A footnote marker is a reference, not text.
  if (tag === "sup" && el.hasAttribute("data-footnote")) {
    const number = ctx.notes.get(el.getAttribute("data-footnote") ?? "");
    return number === undefined
      ? ""
      : `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${number + 1}"/></w:r>`;
  }
  if (tag === "sup") next.superscript = true;

  // An equation goes in as its source. See the note at the top of this file.
  if (tag === "span" && el.hasAttribute("data-math"))
    return run(` ${el.getAttribute("data-math") ?? ""} `, { ...next, code: true });

  if (tag === "br") return "<w:r><w:br/></w:r>";

  if (tag === "a") {
    // As plain underlined text: a real hyperlink needs its own relationship
    // per link, and the words are what matters in a printed thesis.
    const inner = Array.from(el.childNodes)
      .map((child) => inlineFrom(child, { ...next, underline: true }, ctx))
      .join("");
    return inner;
  }

  return Array.from(el.childNodes)
    .map((child) => inlineFrom(child, next, ctx))
    .join("");
}

const paragraph = (inner: string, props = "") =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;

/** A text block's HTML as Word paragraphs. */
function paragraphsFrom(html: string, ctx: InlineContext): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: string[] = [];

  const walk = (parent: Element, listType?: "bullet" | "number", depth = 0) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "ul") {
        walk(child, "bullet", listType ? depth + 1 : 0);
        continue;
      }
      if (tag === "ol") {
        walk(child, "number", listType ? depth + 1 : 0);
        continue;
      }
      if (tag === "li") {
        out.push(
          paragraph(
            inlineFrom(child, {}, ctx),
            `<w:numPr><w:ilvl w:val="${Math.min(depth, 2)}"/><w:numId w:val="${listType === "number" ? 2 : 1}"/></w:numPr>`,
          ),
        );
        continue;
      }
      if (/^h[1-3]$/.test(tag)) {
        out.push(
          paragraph(
            inlineFrom(child, {}, ctx),
            `<w:pStyle w:val="Heading${tag[1]}"/>`,
          ),
        );
        continue;
      }
      if (tag === "blockquote") {
        out.push(paragraph(inlineFrom(child, {}, ctx), '<w:pStyle w:val="Quote"/>'));
        continue;
      }
      if (tag === "pre") {
        out.push(paragraph(inlineFrom(child, { code: true }, ctx)));
        continue;
      }
      out.push(paragraph(inlineFrom(child, {}, ctx)));
    }
  };

  walk(doc.body);
  return out.join("");
}

/* ── Pictures ───────────────────────────────────────────── */

function mediaFrom(project: Project): Map<string, Media> {
  const media = new Map<string, Media>();
  let n = 0;
  for (const block of project.blocks) {
    if (block.type !== "image" || !block.src.startsWith("data:")) continue;
    const [meta, data] = block.src.split(",", 2);
    const type = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
    const ext = type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const binary = atob(data ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    n += 1;
    media.set(block.id, {
      path: `media/image${n}.${ext}`,
      type,
      bytes,
      relId: `rIdImg${n}`,
      width: block.naturalWidth ?? 600,
      height: block.naturalHeight ?? 400,
    });
  }
  return media;
}

/** A picture, scaled to the text width so it never runs off the page. */
function drawing(image: Media, widthTwips: number, scale: number): string {
  const maxEmu = Math.round((widthTwips / 1440) * 914400 * (scale / 100));
  const ratio = image.height / Math.max(1, image.width);
  const cx = Math.min(maxEmu, emu(image.width));
  const cy = Math.round(cx * ratio);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
  <wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${Math.floor(Math.random() * 1e6)}" name="Picture"/>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr>
    <pic:blipFill><a:blip r:embed="${image.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
  </a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/* ── The document ───────────────────────────────────────── */

export function buildDocx(project: Project): Uint8Array {
  const page = { ...DEFAULT_PAGE, ...project.page };
  const paper = paperSize(page);
  const contentWidth = twips(paper.width - page.margins.left - page.margins.right);
  const noteList = collectNotes(project.blocks);
  const notes = new Map(noteList.map((n) => [n.id, n.number]));
  const media = mediaFrom(project);
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const ctx: InlineContext = { notes, media, author: "Assignments", stamp };
  const style = project.citationStyle ?? "apa";

  const body: string[] = [];

  for (const block of project.blocks) {
    switch (block.type) {
      case "text":
        body.push(paragraphsFrom(block.html, ctx));
        break;

      case "toc": {
        const entries = headings(project.blocks).filter(
          (h) => h.level <= (block.depth ?? 3),
        );
        if (!entries.length) break;
        body.push(
          paragraph(
            run(block.title ?? "Contents", { bold: true }),
            '<w:pStyle w:val="Heading1"/>',
          ),
        );
        // A real field, with the current entries as its result. It reads
        // correctly the moment the file opens and updates on F9 — the static
        // list alone would go stale, and the field alone shows "press F9".
        body.push(
          `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
            `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r>` +
            `<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>` +
            entries
              .map((h) =>
                paragraph(
                  run(h.text, {}),
                  `<w:ind w:left="${(h.level - 1) * 360}"/>`,
                ),
              )
              .join("") +
            `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
        );
        break;
      }

      case "image": {
        const image = media.get(block.id);
        if (!image) break;
        body.push(
          paragraph(
            drawing(image, contentWidth, block.align === "full" ? 100 : (block.scale ?? 100)),
            block.align === "left" ? "" : '<w:jc w:val="center"/>',
          ),
        );
        const figure = figureFor(project.blocks, block.id);
        const caption = [figure ? `${figure.label}.` : "", block.caption ?? ""]
          .filter(Boolean)
          .join(" ");
        if (caption)
          body.push(
            paragraph(
              run(caption, {}),
              '<w:pStyle w:val="Caption"/>' +
                (block.align === "left" ? "" : '<w:jc w:val="center"/>'),
            ),
          );
        break;
      }

      case "table": {
        const figure = figureFor(project.blocks, block.id);
        const caption = [figure ? `${figure.label}.` : "", block.title ?? ""]
          .filter(Boolean)
          .join(" ");
        if (caption)
          body.push(paragraph(run(caption, {}), '<w:pStyle w:val="Caption"/>'));

        const derived = computeFormulas(block.columns, block.rows);
        const width = Math.floor(contentWidth / Math.max(1, block.columns.length));
        const cell = (text: string, bold = false) =>
          `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(run(text, { bold }))}</w:tc>`;
        const rows = [
          `<w:tr>${block.columns.map((c) => cell(c.name, true)).join("")}</w:tr>`,
          ...block.rows.map(
            (r) =>
              `<w:tr>${block.columns
                .map((c) =>
                  cell(
                    String(
                      c.type === "formula"
                        ? (derived[r.id]?.[c.id] ?? "")
                        : (r.cells[c.id] ?? ""),
                    ),
                  ),
                )
                .join("")}</w:tr>`,
          ),
        ];
        body.push(
          `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>` +
            `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
              .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="999999"/>`)
              .join("")}</w:tblBorders></w:tblPr>${rows.join("")}</w:tbl>`,
        );
        // Word needs a paragraph after a table, or the next block is welded
        // to it and the document cannot be edited between the two.
        body.push(paragraph(""));
        break;
      }

      case "slides":
        for (const slide of block.slides) {
          body.push(paragraph(run(slide.title, {}), '<w:pStyle w:val="Heading2"/>'));
          for (const bullet of slide.bullets.filter(Boolean))
            body.push(
              paragraph(
                run(bullet, {}),
                '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
              ),
            );
        }
        break;

      case "code":
        for (const file of block.files) {
          body.push(paragraph(run(file.name, { bold: true })));
          for (const line of file.content.split("\n"))
            body.push(paragraph(run(line, { code: true })));
        }
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
        body.push(
          paragraph(run(block.title ?? "References", {}), '<w:pStyle w:val="Heading1"/>'),
        );
        for (const source of sortSources(pool))
          body.push(
            paragraph(
              run(stripTags(formatReference(source, style)), {}),
              '<w:ind w:left="720" w:hanging="720"/>',
            ),
          );
        break;
      }

      case "chart":
        body.push(
          paragraph(
            run(`[${figureFor(project.blocks, block.id)?.label ?? "Chart"}. ${block.title ?? ""}]`, {
              italic: true,
            }),
          ),
        );
        break;
    }
  }

  /* Section properties: paper, margins, and which header and footer to use. */
  const sect =
    `<w:sectPr>` +
    (page.header?.trim()
      ? '<w:headerReference w:type="default" r:id="rIdHeader"/>'
      : page.numbers === "header-right"
        ? '<w:headerReference w:type="default" r:id="rIdHeader"/>'
        : "") +
    (page.footer?.trim() || page.numbers.startsWith("footer")
      ? '<w:footerReference w:type="default" r:id="rIdFooter"/>'
      : "") +
    `<w:pgSz w:w="${twips(paper.width)}" w:h="${twips(paper.height)}"${
      page.orientation === "landscape" ? ' w:orient="landscape"' : ""
    }/>` +
    `<w:pgMar w:top="${twips(page.margins.top)}" w:right="${twips(page.margins.right)}" w:bottom="${twips(page.margins.bottom)}" w:left="${twips(page.margins.left)}" w:header="708" w:footer="708" w:gutter="0"/>` +
    (page.startAt ? `<w:pgNumType w:start="${page.startAt}"/>` : "") +
    `</w:sectPr>`;

  const document = `${HEAD}
<w:document ${DOC_NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;

  /* Footnotes. Ids 0 and 1 are reserved by Word for the separators. */
  const footnotes = `${HEAD}
<w:footnotes ${DOC_NS}>
<w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
${noteList
  .map(
    (note) =>
      `<w:footnote w:id="${note.number + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
      `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>` +
      `${run(` ${note.text}`, {})}</w:p></w:footnote>`,
  )
  .join("")}
</w:footnotes>`;

  const pageField = (align: string) =>
    `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>1</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;

  const header = `${HEAD}
<w:hdr ${DOC_NS}>${
    page.header?.trim() ? paragraph(run(page.header, {})) : ""
  }${page.numbers === "header-right" ? pageField("right") : ""}${
    page.header?.trim() || page.numbers === "header-right" ? "" : "<w:p/>"
  }</w:hdr>`;

  const footer = `${HEAD}
<w:ftr ${DOC_NS}>${page.footer?.trim() ? paragraph(run(page.footer, {})) : ""}${
    page.numbers === "footer-right"
      ? pageField("right")
      : page.numbers === "footer-centre"
        ? pageField("center")
        : ""
  }${page.footer?.trim() || page.numbers.startsWith("footer") ? "" : "<w:p/>"}</w:ftr>`;

  const mediaList = [...media.values()];
  const documentRels = `${HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
${mediaList
  .map(
    (m) =>
      `<Relationship Id="${m.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.path}"/>`,
  )
  .join("")}
</Relationships>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes(mediaList)),
    "_rels/.rels": strToU8(packageRels),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(documentRels),
    "word/styles.xml": strToU8(
      styles(project.typography?.fontSize ?? 12, "Georgia"),
    ),
    "word/numbering.xml": strToU8(numbering),
    "word/footnotes.xml": strToU8(footnotes),
    "word/header1.xml": strToU8(header),
    "word/footer1.xml": strToU8(footer),
  };
  for (const m of mediaList) files[`word/${m.path}`] = m.bytes;

  return zipSync(files, { level: 6 });
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");
