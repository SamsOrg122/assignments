"use client";

/**
 * Reading a kept file back as text.
 *
 * Two callers want the same thing for different reasons: inserting a file
 * into a document puts its words in the page, and asking the assistant about
 * a file has to send its words to the model. Both have to answer the same
 * question first — *is this text at all* — and both have to decode a data URL
 * that may or may not be base64.
 *
 * It lived inside `insert.ts` as a private function until the assistant
 * needed it too. Copying it would have been two decoders and one of them
 * eventually wrong about `;base64`.
 */

import { familyOf } from "./mime";

/** How much of a file is worth carrying. Callers pass their own ceiling. */
export const TEXT_CEILING = 200_000;

/**
 * The file's text, or null when it is not text at all.
 *
 * Deliberately decided by family rather than by trying to decode and seeing
 * whether it looks like words: a PDF decodes to something, and that something
 * is binary noise that would be sent to a model as if it were a document.
 */
export function textOfDataUrl(
  dataUrl: string,
  mime: string,
  filename: string,
  cap: number = TEXT_CEILING,
): string | null {
  if (familyOf(mime, filename) !== "text") return null;

  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;

  try {
    const body = dataUrl.slice(comma + 1);
    const decoded = /;base64/i.test(dataUrl.slice(0, comma))
      ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
      : decodeURIComponent(body);
    return decoded.length > cap ? `${decoded.slice(0, cap)}\n\n…` : decoded;
  } catch {
    return null;
  }
}
