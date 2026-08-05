"use client";

/**
 * File ingestion — "give this to the AI".
 *
 * One seam, `ingestFile(file)`, returning extracted text. What it can read
 * locally it reads properly; what it can't, it says so about rather than
 * storing an empty record that quietly contributes nothing to context.
 *
 * A server-side extractor (PDF, DOCX, OCR) implements the same interface and
 * replaces `setFileExtractor` — nothing above this file changes.
 */

import { unzipSync, strFromU8 } from "fflate";
import { uid } from "../factories";
import { LOCAL_USER } from "../realtime";
import { importPptx } from "../pptx";
import type { TeamFile } from "../team/types";

export interface FileExtractor {
  readonly name: string;
  extract(file: File): Promise<{ text: string; note?: string } | null>;
}

/** Anything larger is truncated — context has a budget, and so does storage. */
const MAX_TEXT = 60_000;

const TEXTUAL =
  /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript|sql))/;

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|r|sql|bib|tex|log)$/i;

const clip = (text: string) =>
  text.length > MAX_TEXT
    ? text.slice(0, MAX_TEXT) + "\n… [truncated for length]"
    : text;

/** DOCX, like PPTX, is a ZIP of XML — document.xml holds the prose. */
function extractDocx(data: Uint8Array): string {
  const files = unzipSync(data);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("No document.xml");
  const xml = strFromU8(doc);
  return xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const localExtractor: FileExtractor = {
  name: "local",

  async extract(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith(".pptx")) {
      const deck = importPptx(new Uint8Array(await file.arrayBuffer()));
      const text = deck.slides
        .map(
          (s, i) =>
            `Slide ${i + 1}: ${s.title}\n` +
            s.bullets.map((b) => `- ${b}`).join("\n") +
            (s.note ? `\nNotes: ${s.note}` : ""),
        )
        .join("\n\n");
      return {
        text: clip(text),
        note: `${deck.slideCount} slides read as text`,
      };
    }

    if (name.endsWith(".docx")) {
      const text = extractDocx(new Uint8Array(await file.arrayBuffer()));
      return { text: clip(text), note: "Text extracted; formatting dropped" };
    }

    if (TEXTUAL.test(file.type) || TEXT_EXTENSIONS.test(name)) {
      return { text: clip(await file.text()) };
    }

    // PDF needs a real parser; claiming to have read one would be a lie.
    return null;
  },
};

let extractor: FileExtractor = localExtractor;

export function setFileExtractor(next: FileExtractor | null) {
  extractor = next ?? localExtractor;
}

export function fileExtractorName(): string {
  return extractor.name;
}

export async function ingestFile(file: File): Promise<TeamFile> {
  const base = {
    id: uid(),
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: LOCAL_USER.id,
    at: Date.now(),
  };

  try {
    const result = await extractor.extract(file);
    if (!result)
      return {
        ...base,
        text: "",
        status: "unsupported",
        note: `${file.name.split(".").pop()?.toUpperCase() ?? "This type"} needs a server-side extractor`,
      };

    if (!result.text.trim())
      return {
        ...base,
        text: "",
        status: "failed",
        note: "No readable text found",
      };

    return { ...base, text: result.text, status: "ready", note: result.note };
  } catch (error) {
    return {
      ...base,
      text: "",
      status: "failed",
      note: error instanceof Error ? error.message : "Could not read the file",
    };
  }
}
