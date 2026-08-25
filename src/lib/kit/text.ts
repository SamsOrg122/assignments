"use client";

/**
 * Reading a kept file back as text.
 *
 * The shelf stores bytes as data URLs, which is what makes a file survive a
 * reload without a server; every caller that wants a file's words therefore
 * has to decode one first. That decoding is the whole of this module. The
 * reading itself belongs to `files/extract`, which the team chat uses too —
 * there is one answer to "what does this file say", not one per surface.
 */

import { extractText, type Extracted } from "../files/extract";

/** How much of a file is worth carrying. Callers pass their own ceiling. */
export const TEXT_CEILING = 200_000;

/**
 * The bytes behind a data URL, base64 or percent-encoded.
 *
 * Both forms turn up: the shelf writes base64, and a hand-made URL in a test
 * or a paste is often not. Getting `;base64` wrong produces plausible-looking
 * mojibake rather than an error, which is why there is one decoder.
 */
export function bytesOfDataUrl(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;

  const body = dataUrl.slice(comma + 1);
  try {
    if (/;base64/i.test(dataUrl.slice(0, comma))) {
      const raw = atob(body);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return null;
  }
}

/**
 * A kept file's words, or null when that kind of file has none.
 *
 * Null and a thrown error mean different things, and the difference is what
 * somebody is told. Null is a fact about pictures and fonts and archives, and
 * needs no apology. A throw is a file that should have had words and did not
 * give them up — a locked PDF, a .docx that is not really one — which is
 * worth a sentence, because the person can act on it and otherwise concludes
 * the tool is broken.
 */
export async function readAsText(
  dataUrl: string,
  mime: string,
  filename: string,
  cap: number = TEXT_CEILING,
): Promise<Extracted | null> {
  const data = bytesOfDataUrl(dataUrl);
  if (!data) return null;
  return extractText(data, mime, filename, cap);
}
