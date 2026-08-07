"use client";

/**
 * Getting a picture in, fast, from wherever it came from.
 *
 * One path, used by documents, slides and the board: pick a file, drop one,
 * or paste from the clipboard. Two clicks at most, and paste is zero.
 *
 * The part that isn't obvious is the resizing. A photo off a phone is four
 * megabytes and 4,000 pixels wide; as a data URL in localStorage it is closer
 * to five and a half, and a browser's whole quota is often five to ten. Two
 * holiday photos would fill a workspace and start silently failing writes on
 * everything else — the thesis included. So every image is decoded, scaled to
 * something a screen can actually use, and re-encoded before it is stored.
 *
 * That is lossy and it is the right trade: this is a document tool, not a
 * photo library, and an image nobody can save is worth less than a slightly
 * smaller one.
 */

/** Longest edge, in device pixels. Comfortably above any slide or page width. */
export const MAX_EDGE = 2000;
/** JPEG quality for photographs. High enough that text in a screenshot holds. */
export const QUALITY = 0.86;
/** Anything below this is stored untouched — re-encoding would only add loss. */
const SMALL_ENOUGH = 180_000;

export interface PreparedImage {
  /** Data URL, ready to store. */
  src: string;
  width: number;
  height: number;
  /** Roughly what it will cost in storage, in bytes. */
  bytes: number;
  /** File name, for the alt text default. */
  name: string;
}

export class ImageError extends Error {}

const readAsDataURL = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("That file couldn't be read."));
    reader.readAsDataURL(file);
  });

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError("That file isn't an image."));
    img.src = src;
  });

/**
 * Decode, scale down if needed, re-encode.
 *
 * SVG is passed through untouched: it is already small, and rasterising it
 * would throw away the one thing it is good at.
 */
export async function prepareImage(file: File | Blob): Promise<PreparedImage> {
  const name = "name" in file && file.name ? file.name : "image";
  const type = file.type || "image/png";

  if (!type.startsWith("image/"))
    throw new ImageError("That isn't an image file.");

  const original = await readAsDataURL(file);

  if (type === "image/svg+xml" || file.size <= SMALL_ENOUGH) {
    const img = await load(original).catch(() => null);
    return {
      src: original,
      width: img?.naturalWidth ?? 0,
      height: img?.naturalHeight ?? 0,
      bytes: original.length,
      name,
    };
  }

  const img = await load(original);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { src: original, width, height, bytes: original.length, name };
  ctx.drawImage(img, 0, 0, width, height);

  // PNG keeps transparency; everything else is cheaper as JPEG. A screenshot
  // pasted from the clipboard arrives as PNG and often halves as a JPEG, but
  // losing its alpha would put a black box behind a logo.
  const keepAlpha = type === "image/png" || type === "image/webp";
  const encoded = canvas.toDataURL(
    keepAlpha ? "image/webp" : "image/jpeg",
    QUALITY,
  );

  // Re-encoding is not guaranteed to win — a small PNG can grow as a WebP.
  const src = encoded.length < original.length ? encoded : original;
  return { src, width, height, bytes: src.length, name };
}

/**
 * Open the system picker and prepare whatever comes back.
 *
 * A promise rather than a callback so a caller is one `await` from having the
 * picture, and resolves to null when the dialog is dismissed — cancelling is
 * not an error.
 */
export function pickImage(): Promise<PreparedImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      prepareImage(file).then(resolve, reject);
    };
    // Firefox needs the input in the document for `click()` to open anything.
    input.click();
  });
}

/** The first image in a drop or paste, if there is one. */
export function imageFrom(
  source: DataTransfer | ClipboardEvent["clipboardData"] | null,
): File | null {
  if (!source) return null;
  for (const item of Array.from(source.files ?? []))
    if (item.type.startsWith("image/")) return item;
  for (const item of Array.from(source.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

export function formatImageSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
