/**
 * The frames that travel between `/api/ai` and the browser.
 *
 * Newline-delimited JSON rather than SSE: the client is a `fetch` reader, not
 * an `EventSource`, so the event framing would buy nothing and cost a parser.
 * One JSON object per line, and a line is only ever emitted whole.
 *
 * A superset of `AIChunk`, because two things the UI wants to say are not
 * document content: which model actually answered, and why nothing answered.
 */

import type { AIChange } from "../types";

export type AIFrame =
  | { type: "model"; value: string }
  | { type: "text"; value: string }
  | { type: "change"; value: AIChange }
  | { type: "error"; value: string }
  | { type: "done" };

export const encodeFrame = (frame: AIFrame) => JSON.stringify(frame) + "\n";

/**
 * Split a byte stream into frames.
 *
 * Keeps a tail buffer, because a chunk boundary lands mid-line often enough
 * that ignoring it would corrupt roughly one answer in five.
 */
export function frameReader() {
  let tail = "";
  return {
    push(text: string): AIFrame[] {
      tail += text;
      const lines = tail.split("\n");
      tail = lines.pop() ?? "";
      return lines
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as AIFrame];
          } catch {
            return [];
          }
        });
    },
    /** Whatever was left when the stream ended — a truncated line is dropped. */
    flush(): AIFrame[] {
      const line = tail.trim();
      tail = "";
      if (!line) return [];
      try {
        return [JSON.parse(line) as AIFrame];
      } catch {
        return [];
      }
    },
  };
}
