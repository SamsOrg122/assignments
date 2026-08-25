"use client";

/**
 * Getting the words out of a file, whatever kind of file it is.
 *
 * There were two of these. The team chat had `ingest.ts`, which could read a
 * .docx and a .pptx and said in a comment that "PDF needs a real parser".
 * The notepad had `kit/text.ts`, which could read a .txt and nothing else.
 * So a lecture deck was readable in one half of the app and not the other,
 * for no reason anybody could have explained — the two had simply grown at
 * different times.
 *
 * This is the one answer. Both callers hand it bytes and get back words or a
 * null that means *there are no words in this kind of file*.
 *
 * Every engine is loaded on demand. The unzipper, the deck reader and the PDF
 * parser together are several megabytes, and most sessions open none of them.
 */

import { familyOf } from "../kit/mime";

/** Words, and anything the person should be told about how they got here. */
export interface Extracted {
  text: string;
  /** A short sentence: what was dropped, or how much was read. */
  note?: string;
}

/**
 * What counts as already-text.
 *
 * Broader than `familyOf`'s "text" family on purpose. `familyOf` exists to
 * pick an icon, so it calls a .csv a spreadsheet and a .py nothing in
 * particular — right for a picture of a file, wrong for reading one. Source
 * files and comma-separated values are text and have always been readable
 * here; narrowing to the icon's opinion would have quietly removed that.
 */
const TEXTUAL =
  /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript|sql))/;

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|r|sql|bib|tex|log)$/i;

const isTextual = (mime: string, filename: string) =>
  TEXTUAL.test(mime) || TEXT_EXTENSIONS.test(filename);

const ends = (filename: string, suffix: string) =>
  filename.toLowerCase().endsWith(suffix);

/**
 * Whether pointing `extractText` at this file is worth doing.
 *
 * Pickers ask this so they can grey out the rows that will not work, with a
 * reason, instead of offering them and failing afterwards.
 */
export function canExtract(mime: string, filename: string): boolean {
  return (
    isTextual(mime, filename) ||
    ends(filename, ".docx") ||
    ends(filename, ".pptx") ||
    familyOf(mime, filename) === "pdf"
  );
}

const clip = (text: string, cap: number): { text: string; cut: boolean } =>
  text.length > cap
    ? { text: `${text.slice(0, cap)}\n… [truncated for length]`, cut: true }
    : { text, cut: false };

/** DOCX, like PPTX, is a ZIP of XML — document.xml holds the prose. */
async function readDocx(data: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(data);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That .docx has no document in it.");
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

async function readPptx(data: Uint8Array): Promise<Extracted> {
  const { importPptx } = await import("../pptx");
  const deck = importPptx(data);
  const text = deck.slides
    .map(
      (slide, index) =>
        `Slide ${index + 1}: ${slide.title}\n` +
        slide.bullets.map((bullet) => `- ${bullet}`).join("\n") +
        (slide.note ? `\nNotes: ${slide.note}` : ""),
    )
    .join("\n\n");
  return { text, note: `${deck.slideCount} slides read as text` };
}

/**
 * Bytes in, words out — or null when this kind of file has none.
 *
 * The difference between null and a throw is what somebody gets told. Null is
 * a fact about pictures and fonts and archives, and needs no apology. A throw
 * is a file that should have had words and did not give them up: a locked
 * PDF, a .docx that is not really one. Those deserve a sentence, because the
 * person can act on them and otherwise concludes the tool is broken.
 */
export async function extractText(
  data: Uint8Array,
  mime: string,
  filename: string,
  cap: number,
): Promise<Extracted | null> {
  if (ends(filename, ".pptx")) {
    const deck = await readPptx(data);
    const { text } = clip(deck.text, cap);
    return { text, note: deck.note };
  }

  if (ends(filename, ".docx")) {
    const { text } = clip(await readDocx(data), cap);
    return { text, note: "Text extracted; formatting dropped" };
  }

  if (familyOf(mime, filename) === "pdf") {
    const { readPdf } = await import("../kit/pdf");
    const read = await readPdf(data, cap);
    if (read.text.trim().length === 0)
      throw new Error(
        "There is no text in that PDF — it looks like scanned pages rather than a document.",
      );
    return {
      text: read.text,
      note: read.truncated
        ? `Read ${read.read} of ${read.pages} page${read.pages === 1 ? "" : "s"}.`
        : undefined,
    };
  }

  if (isTextual(mime, filename)) {
    const decoded = new TextDecoder().decode(data);
    const { text, cut } = clip(decoded, cap);
    return { text, note: cut ? "Read the first part of the file." : undefined };
  }

  return null;
}
