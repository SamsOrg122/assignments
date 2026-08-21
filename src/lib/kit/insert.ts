"use client";

/**
 * Taking something off the shelf.
 *
 * Every route in — the `/` menu, ⌘K, the add bar — goes through here, so a
 * piece behaves the same however you reached for it. Two rules do all the
 * work:
 *
 *   • It is **copied**, deeply, with fresh ids. A piece dropped twice into the
 *     same document must be two blocks, not one block rendered twice; and a
 *     block still holding the id it had in the kit would collide with itself
 *     the second time.
 *   • The kit never learns it was used. No back-reference, no count, nothing
 *     to keep in step. Deleting the piece afterwards cannot touch the work.
 */

import type { Block, Slide, SlideObject } from "../types";
import { createBlock, createImageBlock, uid } from "../factories";
import { useProjects } from "../store";
import { familyOf, labelFor } from "./mime";
import { textOfDataUrl } from "./text";
import {
  assetData,
  formatBytes,
  type KitFile,
  type KitImage,
  type KitPiece,
} from ".";

/** A block with every id inside it made new. */
function freshBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = uid();

  if (copy.type === "table") {
    // Columns and rows are referenced by id from formulas, sorts, filters and
    // format rules — so renaming them would mean rewriting all four. The ids
    // are only ever compared within one block, so leaving them is correct and
    // rewriting them would be the bug.
    return copy;
  }
  if (copy.type === "slides") {
    copy.slides = copy.slides.map((slide) => ({
      ...slide,
      id: uid(),
      objects: slide.objects?.map((o) => ({ ...o, id: uid() })),
    }));
  }
  if (copy.type === "chart") {
    // A chart reads a table by id, and the table it read is in another
    // project. Arriving unbound is honest — the block says so and offers the
    // tables that are actually here.
    copy.sourceId = null;
  }
  return copy;
}

function freshSlide(slide: Slide): Slide {
  return {
    ...structuredClone(slide),
    id: uid(),
    objects: slide.objects?.map((o) => ({ ...o, id: uid() })),
  };
}

/** Drop a saved block into a project, after `afterBlockId` if given. */
export function insertPiece(
  projectId: string,
  piece: KitPiece,
  afterBlockId?: string,
): string | null {
  if (piece.of !== "block") return null;
  const block = freshBlock(piece.payload as Block);
  return useProjects.getState().insertBlock(projectId, block, afterBlockId);
}

/** Drop a saved slide into a deck block. */
export function insertSlidePiece(
  projectId: string,
  blockId: string,
  piece: KitPiece,
  after: number,
): void {
  if (piece.of !== "slide") return;
  const slide = freshSlide(piece.payload as Slide);
  useProjects.getState().updateBlock<Extract<Block, { type: "slides" }>>(
    projectId,
    blockId,
    (b) => ({
      slides: [...b.slides.slice(0, after + 1), slide, ...b.slides.slice(after + 1)],
    }),
  );
}

/**
 * A kit picture, ready to place.
 *
 * Its bytes live in IndexedDB, so this is async where a freshly-picked file is
 * not — every caller already awaits `prepareImage`, so the shapes match.
 */
export async function kitImage(
  id: string,
  name: string,
  width: number,
  height: number,
): Promise<{ src: string; width: number; height: number; name: string } | null> {
  const src = await assetData(id);
  return src ? { src, width, height, name } : null;
}

/**
 * Put a kept file into a document.
 *
 * The kind the drop-anything promise exists to serve was the one kind that
 * could not reach a document at all: a PDF a teacher sent, a spreadsheet of
 * results, a zip of sources — all findable on the shelf and impossible to
 * cite in the essay they belong to.
 *
 * Deliberately routed through the two block types that already exist rather
 * than adding a third. A `"file"` block would be a twenty-seven file change
 * across every switch, every `Record<BlockType, …>` and a persisted-data
 * migration, for a shape that is a paragraph with a link in it. So:
 *
 *   • Anything the browser can draw becomes an image block, captioned with
 *     the original filename, so it prints and exports like any picture.
 *   • Everything else becomes a paragraph carrying the file's name, its
 *     size and its bytes as a download link — which survives export,
 *     search and a round-trip through the editor with no new machinery.
 *
 * The copy rule holds either way: the bytes are embedded, never referenced.
 * Deleting the file from the shelf afterwards cannot gut the document.
 */
export async function insertKitFile(
  projectId: string,
  asset: KitFile | KitImage,
  afterBlockId?: string,
): Promise<string | null> {
  const data = await assetData(asset.id);
  if (!data) return null;

  const store = useProjects.getState();

  if (asset.kind === "image") {
    const block = createImageBlock();
    return store.insertBlock(
      projectId,
      {
        ...block,
        src: data,
        alt: asset.name,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
        bytes: asset.bytes,
      },
      afterBlockId,
    );
  }

  if (familyOf(asset.mime, asset.filename) === "image") {
    const block = createImageBlock();
    return store.insertBlock(
      projectId,
      { ...block, src: data, alt: asset.name, caption: asset.filename, bytes: asset.bytes },
      afterBlockId,
    );
  }

  const block = createBlock("text");
  if (block.type !== "text") return null;
  return store.insertBlock(
    projectId,
    { ...block, html: attachmentHtml(asset, data) },
    afterBlockId,
  );
}

/**
 * What a file becomes when it is not a picture.
 *
 * Two answers, and the difference matters.
 *
 * A file that *is* text — a brief, a set of notes, a CSV of results — goes
 * in as its text. That is what somebody inserting it wanted: the words, in
 * the document, editable.
 *
 * Everything else goes in as a line naming it. Deliberately not a download
 * link: an anchor with the bytes in its href is a `data:` URL, and the
 * sanitiser refuses those on links for a good reason — `data:text/html` is
 * a whole document with scripts in it, and the rule cannot be relaxed for
 * "just attachments" without relaxing it for everything. So the document
 * says which file this is and the bytes stay on the shelf, where there is a
 * download button and nothing has to be trusted.
 */
function attachmentHtml(asset: KitFile, dataUrl: string): string {
  const kind = escapeHtml(labelFor(asset.mime, asset.filename));
  const size = escapeHtml(formatBytes(asset.bytes));
  const label = escapeHtml(asset.name);

  const text = textOfDataUrl(dataUrl, asset.mime, asset.filename);
  if (text !== null) {
    const body = text
      .split(/\n{2,}/)
      .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
      .join("");
    return `<p><strong>${label}</strong> — ${kind}, ${size}</p>${body}`;
  }

  return `<p><strong>${label}</strong> — ${kind}, ${size}, kept in your kit</p>`;
}

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A slide object for a kit picture, at its own proportions. */
export function imageObject(
  src: string,
  width: number,
  height: number,
  alt: string,
): SlideObject {
  const ratio = width && height ? width / height : 1.5;
  let boxWidth = 52;
  let boxHeight = (boxWidth * (16 / 9)) / ratio;
  if (boxHeight > 64) {
    boxWidth = (boxWidth * 64) / boxHeight;
    boxHeight = 64;
  }
  return {
    id: uid(),
    kind: "image",
    x: Math.round((100 - boxWidth) / 2),
    y: Math.round((100 - boxHeight) / 2),
    width: Math.round(boxWidth),
    height: Math.round(boxHeight),
    z: Date.now(),
    src,
    alt,
    fit: "cover",
    radius: 0,
  };
}
