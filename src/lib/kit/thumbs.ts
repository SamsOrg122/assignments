"use client";

/**
 * Small pictures of big pictures.
 *
 * The shelf used to load every asset at full resolution and shrink it with
 * CSS, which means twenty logos are twenty full decodes every time the page
 * is opened — a megabyte each for a 96-pixel square. A thumbnail is stored
 * beside the original under `${id}:thumb`, and the shelf reads that.
 *
 * Falling back is the whole contract. A browser without `OffscreenCanvas`,
 * a format it cannot decode, an SVG with a foreign object in it — every one
 * of those returns null and the caller shows the full image or a mime icon
 * instead. A thumbnail is an optimisation; a shelf that refuses to draw
 * because one could not be made is a bug.
 *
 * Stored as WebP because it is the only format that is both widely encodable
 * from a canvas and small at this size; the quality is deliberately low,
 * since nothing here is ever shown above 128 logical pixels.
 */

const EDGE = 256;
const QUALITY = 0.72;

/** Where a thumbnail lives, given the asset it belongs to. */
export const thumbKey = (id: string): string => `${id}:thumb`;

/**
 * Decode, shrink, re-encode — off the main thread where the browser allows
 * it. Returns null rather than throwing: every caller treats a missing
 * thumbnail as normal.
 */
export async function makeThumb(
  dataUrl: string,
  mime: string,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  if (!mime.startsWith("image/")) return null;
  // An SVG is already tiny and scales perfectly; rasterising one would cost
  // bytes and lose the only thing it is good at.
  if (mime === "image/svg+xml") return null;

  try {
    const source = blobOfDataUrl(dataUrl);
    if (!source) return null;
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const blob = await canvas.convertToBlob({
        type: "image/webp",
        quality: QUALITY,
      });
      return await asDataUrl(blob);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/webp", QUALITY);
  } catch {
    return null;
  }
}

/**
 * A data URL, decoded here rather than by `fetch`.
 *
 * `fetch("data:…")` is the obvious way to get a Blob and it does not work:
 * the app's `connect-src` is an allowlist of real origins and deliberately
 * does not carry `data:`, so the request is refused by the content policy.
 * The failure is silent — a rejected promise indistinguishable from an
 * unreadable image — which is exactly how every thumbnail quietly stopped
 * being made. Decoding is four lines and asks the page for nothing.
 */
function blobOfDataUrl(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? "application/octet-stream";

  if (!/;base64/i.test(head)) {
    try {
      return new Blob([decodeURIComponent(body)], { type: mime });
    } catch {
      return null;
    }
  }

  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(blob);
  });
}
