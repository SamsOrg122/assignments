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
import { uid } from "../factories";
import { useProjects } from "../store";
import { assetData, type KitPiece } from ".";

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
