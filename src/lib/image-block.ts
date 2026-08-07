"use client";

/**
 * Add an image block, then immediately ask for the picture.
 *
 * Every route into an image block — the slash menu, the add bar, ⌘K — wants
 * the same two steps, and getting them out of sync is how one of them ends up
 * dropping an empty frame on the page and leaving the author to work out what
 * to do with it. One function, three call sites.
 */

import { useProjects } from "./store";
import { pickImage } from "./images";
import type { ImageBlock } from "./types";

export function fillImageBlock(
  projectId: string,
  blockId: string,
  onError: (message: string) => void,
): void {
  pickImage().then(
    (image) => {
      // Cancelling leaves the empty frame in place rather than removing the
      // block: the author asked for a picture here, they just haven't chosen
      // one yet, and the frame is a perfectly good place to try again.
      if (!image) return;
      useProjects.getState().updateBlock<ImageBlock>(projectId, blockId, {
        src: image.src,
        alt: image.name.replace(/\.[a-z0-9]+$/i, ""),
        naturalWidth: image.width,
        naturalHeight: image.height,
        bytes: image.bytes,
      });
    },
    (error: unknown) =>
      onError(
        error instanceof Error ? error.message : "That picture couldn't be read.",
      ),
  );
}
