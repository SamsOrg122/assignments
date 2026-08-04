/**
 * The AI seam.
 *
 * Everything the UI knows about AI is in this file. `askAI` returns a stream of
 * chunks and, optionally, a *structured change* the user can accept or reject —
 * the model never mutates the document directly. Wiring a real model in means
 * writing one `AIProvider` and registering it; no component changes.
 */

import type { Block, Column, CellValue } from "../types";

/** A compact, whole-project view handed to the provider as context. */
export interface AIContext {
  projectId: string;
  projectName: string;
  /** Every block in the project, flattened to text — not just the selection. */
  blocks: Array<{
    id: string;
    type: Block["type"];
    title?: string;
    /** Plain-text rendering of the block's content. */
    text: string;
  }>;
  /** What the user had selected when they invoked AI, if anything. */
  selection?: {
    blockId: string;
    blockType: Block["type"];
    text: string;
  };
}

/**
 * A proposed document edit. The UI renders a diff-ish preview and only applies
 * it on Accept — so a bad suggestion costs one keystroke, not an undo.
 */
export type AIChange =
  | {
      kind: "replace-text";
      blockId: string;
      /** Replacement HTML for a text block. */
      html: string;
      label: string;
    }
  | {
      kind: "insert-block";
      afterBlockId: string;
      block: Block;
      label: string;
    }
  | {
      kind: "add-column";
      blockId: string;
      column: Column;
      /** rowId → value. Omitted rows are left blank. */
      values: Record<string, CellValue>;
      /** Rows appended by the change (e.g. forecast periods). */
      appendRows?: Array<{ id: string; cells: Record<string, CellValue> }>;
      label: string;
    };

export type AIChunk =
  | { type: "text"; value: string }
  | { type: "change"; value: AIChange }
  | { type: "done" };

export interface AIRequest {
  prompt: string;
  context: AIContext;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  stream(req: AIRequest): AsyncIterable<AIChunk>;
}
