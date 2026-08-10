"use client";

/**
 * Reading a `.docx`.
 *
 * The half that was missing entirely: a supervisor could be sent a file and
 * had no way to send one back. What comes in matters most is the parts people
 * put there deliberately — headings, lists, tables, footnotes, and above all
 * *tracked changes*, which is the whole reason a document comes back at all.
 *
 * Word's own XML is generous with formatting nobody asked for: a pasted
 * paragraph arrives carrying a font, a colour and a language. All of that is
 * dropped. What survives is structure and emphasis, which is what the document
 * model here can hold and what a person actually meant.
 */

import { unzipSync, strFromU8 } from "fflate";
import { uid } from "../factories";
import type { Block, TableBlock, TextBlock } from "../types";

export interface ImportedDoc {
  name: string;
  blocks: Block[];
  /** What could not be carried across, in words, for the person importing. */
  skipped: string[];
  notes: number;
  proposed: number;
}

const textOf = (el: Element, selector: string) =>
  Array.from(el.querySelectorAll(selector))
    .map((n) => n.textContent ?? "")
    .join("");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Local name, so `w:p` matches whatever prefix the file happens to use. */
const kids = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => c.localName === name);

const firstKid = (el: Element, name: string): Element | null =>
  kids(el, name)[0] ?? null;

/** One `w:r` as HTML, wrapped in whatever emphasis it carries. */
function runHtml(run: Element, revision?: "ins" | "del", noteMap?: Map<string, string>): string {
  const props = firstKid(run, "rPr");
  const has = (name: string) => Boolean(props && firstKid(props, name));

  const reference = firstKid(run, "footnoteReference");
  if (reference && noteMap) {
    const id = reference.getAttribute("w:id") ?? reference.getAttribute("id") ?? "";
    const note = noteMap.get(id);
    if (note !== undefined)
      return `<sup data-footnote="${uid()}" data-note="${escapeHtml(note).replace(/"/g, "&quot;")}" class="footnote-ref"></sup>`;
    return "";
  }

  const text = kids(run, "t")
    .concat(kids(run, "delText"))
    .map((t) => t.textContent ?? "")
    .join("");
  if (!text) return kids(run, "br").length ? "<br>" : "";

  let html = escapeHtml(text);
  if (has("b")) html = `<strong>${html}</strong>`;
  if (has("i")) html = `<em>${html}</em>`;
  if (has("u")) html = `<u>${html}</u>`;
  if (has("strike")) html = `<s>${html}</s>`;
  const vertical = props && firstKid(props, "vertAlign");
  const align = vertical?.getAttribute("w:val") ?? vertical?.getAttribute("val");
  if (align === "superscript") html = `<sup>${html}</sup>`;
  if (align === "subscript") html = `<sub>${html}</sub>`;

  if (revision)
    html =
      revision === "ins"
        ? `<ins data-suggest="insert" data-by="import" class="suggest-insert">${html}</ins>`
        : `<del data-suggest="delete" data-by="import" class="suggest-delete">${html}</del>`;

  return html;
}

interface ParagraphInfo {
  html: string;
  /** 1–3 for a heading, 0 for body text. */
  heading: number;
  list: "bullet" | "number" | null;
}

function paragraphInfo(p: Element, noteMap: Map<string, string>): ParagraphInfo {
  const props = firstKid(p, "pPr");
  const styleEl = props && firstKid(props, "pStyle");
  const style = (
    styleEl?.getAttribute("w:val") ??
    styleEl?.getAttribute("val") ??
    ""
  ).toLowerCase();
  const heading = /^heading([1-9])$/.exec(style.replace(/\s/g, ""));
  const outline = props && firstKid(props, "outlineLvl");
  const level = heading
    ? Number(heading[1])
    : outline
      ? Number(outline.getAttribute("w:val") ?? outline.getAttribute("val") ?? 9) + 1
      : 0;

  const numbered = props && firstKid(props, "numPr");
  const numId = numbered && firstKid(numbered, "numId");
  const list = numbered
    ? (numId?.getAttribute("w:val") ?? numId?.getAttribute("val")) === "2"
      ? ("number" as const)
      : ("bullet" as const)
    : null;

  // Children in document order: plain runs, and runs inside a revision.
  const parts: string[] = [];
  for (const child of Array.from(p.children)) {
    if (child.localName === "r") parts.push(runHtml(child, undefined, noteMap));
    else if (child.localName === "ins")
      for (const r of kids(child, "r")) parts.push(runHtml(r, "ins", noteMap));
    else if (child.localName === "del")
      for (const r of kids(child, "r")) parts.push(runHtml(r, "del", noteMap));
    else if (child.localName === "hyperlink")
      for (const r of kids(child, "r")) parts.push(runHtml(r, undefined, noteMap));
  }

  return { html: parts.join(""), heading: level > 3 ? 0 : level, list };
}

export async function importDocxFile(file: File): Promise<ImportedDoc> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch {
    throw new Error("That doesn't look like a .docx — it isn't a Word package.");
  }

  const main = files["word/document.xml"];
  if (!main)
    throw new Error(
      "That .docx has no document part. If it came from an old Word, save it again as .docx.",
    );

  const parser = new DOMParser();
  const doc = parser.parseFromString(strFromU8(main), "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("That .docx couldn't be read — its XML is damaged.");

  /* Footnote text, so a reference can carry its words rather than a number. */
  const noteMap = new Map<string, string>();
  const notesPart = files["word/footnotes.xml"];
  if (notesPart) {
    const notesDoc = parser.parseFromString(strFromU8(notesPart), "application/xml");
    for (const note of Array.from(notesDoc.getElementsByTagName("*"))) {
      if (note.localName !== "footnote") continue;
      const id = note.getAttribute("w:id") ?? note.getAttribute("id") ?? "";
      const type = note.getAttribute("w:type") ?? note.getAttribute("type");
      // 0 and 1 are Word's separators, not notes anybody wrote.
      if (type || id === "0" || id === "1") continue;
      noteMap.set(id, textOf(note, "*|t").trim());
    }
  }

  const bodyEl = Array.from(doc.getElementsByTagName("*")).find(
    (n) => n.localName === "body",
  );
  if (!bodyEl) throw new Error("That .docx has no body.");

  const blocks: Block[] = [];
  const skipped = new Set<string>();
  let proposed = 0;
  let html: string[] = [];
  let list: { type: "bullet" | "number"; items: string[] } | null = null;

  const closeList = () => {
    if (!list) return;
    const tag = list.type === "number" ? "ol" : "ul";
    html.push(`<${tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${tag}>`);
    list = null;
  };

  const flushText = () => {
    closeList();
    const body = html.join("");
    html = [];
    if (body.replace(/<[^>]+>/g, "").trim() || /<(img|sup)/.test(body))
      blocks.push({ id: uid(), type: "text", html: body } satisfies TextBlock);
  };

  for (const child of Array.from(bodyEl.children)) {
    if (child.localName === "p") {
      const info = paragraphInfo(child, noteMap);
      proposed += child.getElementsByTagName("*").length
        ? Array.from(child.children).filter(
            (c) => c.localName === "ins" || c.localName === "del",
          ).length
        : 0;

      if (info.list) {
        if (list && list.type !== info.list) closeList();
        list = list ?? { type: info.list, items: [] };
        list.items.push(info.html || "");
        continue;
      }
      closeList();

      if (!info.html.trim()) continue;
      html.push(
        info.heading
          ? `<h${info.heading}>${info.html}</h${info.heading}>`
          : `<p>${info.html}</p>`,
      );
      continue;
    }

    if (child.localName === "tbl") {
      flushText();
      const rows = kids(child, "tr");
      if (!rows.length) continue;
      const headerCells = kids(rows[0], "tc");
      const columns = headerCells.map((cell, i) => ({
        id: uid(),
        name: textOf(cell, "*|t").trim() || `Column ${i + 1}`,
        type: "text" as const,
      }));
      const body = rows.slice(1).map((row) => {
        const cells: Record<string, string> = {};
        kids(row, "tc").forEach((cell, i) => {
          if (columns[i]) cells[columns[i].id] = textOf(cell, "*|t").trim();
        });
        return { id: uid(), cells };
      });
      blocks.push({
        id: uid(),
        type: "table",
        title: "Imported table",
        columns,
        rows: body,
      } satisfies TableBlock);
      continue;
    }

    if (child.localName === "sectPr") continue;
    skipped.add(child.localName);
  }
  flushText();

  if (files["word/media"] || Object.keys(files).some((k) => k.startsWith("word/media/")))
    skipped.add("pictures");

  if (!blocks.length)
    blocks.push({ id: uid(), type: "text", html: "<p></p>" } satisfies TextBlock);

  return {
    name: file.name.replace(/\.docx$/i, ""),
    blocks,
    skipped: [...skipped].map((s) =>
      s === "pictures"
        ? "pictures"
        : s === "sdt"
          ? "content controls"
          : `<${s}> elements`,
    ),
    notes: noteMap.size,
    proposed,
  };
}
