"use client";

/**
 * Reading the words out of a PDF.
 *
 * The picker has always known a PDF is a PDF — `familyOf` has classified it
 * since the shelf existed — and then had nothing to do with one. Somebody
 * dropped a set of lecture slides on the note, asked for a summary, and got
 * a polite nothing. That is the single most obvious thing to ask a notepad
 * with an assistant in it, so it should not be the one thing it cannot do.
 *
 * Two decisions worth defending:
 *
 * The engine is loaded on demand. It is several megabytes, and the great
 * majority of visits never open a PDF; paying for it in the first load so
 * that a minority saves a second later is the wrong trade.
 *
 * It runs on the main thread. pdf.js prefers a web worker, and a worker is
 * genuinely better — it keeps the page responsive while a long document is
 * read. Getting the worker's URL, though, means asking the bundler to emit
 * an asset from inside `node_modules`, which is exactly the sort of thing
 * that works in development and produces a 404 in a release build. The
 * escape hatch pdf.js documents for this — putting the worker's message
 * handler on `globalThis` so it is used in place — costs a freeze bounded by
 * `PAGE_CEILING`, and buys a path that cannot break in a way only the
 * shipped build shows.
 */

/**
 * How many pages are worth reading.
 *
 * Not a performance guard so much as an honesty one: nothing useful comes of
 * sending four hundred pages to a model that will see the first fraction of
 * them anyway, and the caller's character ceiling would cut it there in any
 * case. A hundred covers a lecture deck, a paper, a chapter.
 */
const PAGE_CEILING = 100;

export interface PdfRead {
  /** The text, already cut to the caller's ceiling. */
  text: string;
  /** Pages the document has. */
  pages: number;
  /** Pages actually read — fewer when the document is longer than we go. */
  read: number;
  /** True when the text was cut short, by page count or by characters. */
  truncated: boolean;
}

/**
 * The engine, loaded once.
 *
 * The worker module is imported for its side effect: loading it in a window
 * puts `WorkerMessageHandler` on `globalThis`, which is the signal pdf.js
 * takes to run in place rather than spawn a worker it has no URL for.
 */
let engine: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs(): Promise<typeof import("pdfjs-dist")> {
  engine ??= (async () => {
    const [core] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs"),
    ]);
    return core;
  })();
  return engine;
}

/**
 * One page's text.
 *
 * pdf.js hands back positioned fragments, not lines — a fragment can be a
 * word, or half a word where the typesetter kerned it. `hasEOL` is the only
 * thing that knows where a line ended, so it is what the line breaks come
 * from; joining on anything else turns a two-column paper into interleaved
 * nonsense.
 */
const linesOf = (items: Array<{ str?: string; hasEOL?: boolean }>): string => {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
  }
  return out;
};

/**
 * A PDF's text, or a refusal that says why.
 *
 * Throws rather than returning null for the cases somebody can act on — a
 * password, a file that is not really a PDF — because "nothing came back" is
 * indistinguishable from an empty document, and the two want different
 * sentences from the person reading them.
 */
export async function readPdf(data: Uint8Array, cap: number): Promise<PdfRead> {
  const lib = await pdfjs();

  // The loading task, not the document, owns teardown — it is what holds the
  // worker state and the copy of the bytes.
  const task = lib.getDocument({
    data,
    // Nothing is drawn, so nothing needs a typeface. Skipping font
    // construction is the difference between reading a deck in a moment and
    // injecting a hundred `@font-face` rules to no purpose.
    disableFontFace: true,
    // The standard fonts and CMaps live on a CDN by default, and this app
    // does not talk to CDNs. Latin text needs neither.
    useSystemFonts: false,
    // Errors only. Without this, every ordinary document warns in the console
    // that `standardFontDataUrl` was not provided — true, deliberate, and of
    // no interest to anybody, since nothing here draws a glyph.
    verbosity: lib.VerbosityLevel.ERRORS,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    const name = (error as { name?: string }).name ?? "";
    if (name === "PasswordException")
      throw new Error("That PDF is password-protected.");
    if (name === "InvalidPDFException")
      throw new Error("That file isn't a readable PDF.");
    throw new Error("That PDF couldn't be opened.");
  }

  try {
    const pages = doc.numPages;
    const read = Math.min(pages, PAGE_CEILING);

    let text = "";
    let cut = false;
    for (let n = 1; n <= read; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      page.cleanup();

      text += linesOf(content.items as Array<{ str?: string; hasEOL?: boolean }>);
      text += "\n\n";
      if (text.length > cap) {
        text = text.slice(0, cap);
        cut = true;
        break;
      }
    }

    return {
      text: text.replace(/\n{3,}/g, "\n\n").trim(),
      pages,
      read,
      truncated: cut || read < pages,
    };
  } finally {
    await task.destroy();
  }
}
