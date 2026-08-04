/**
 * The AI seam.
 *
 * Everything the UI knows about AI is in this file. `askAI` returns a stream of
 * chunks and, optionally, a *structured change* the user can accept or reject —
 * the model never mutates the document directly. Wiring a real model in means
 * writing one `AIProvider` and registering it; no component changes.
 */

import type { Block, Column, CellValue, ProjectKind } from "../types";

/**
 * What the provider gets to see.
 *
 * Two rings: the whole *project* verbatim (every block, flattened to text) and
 * the whole *workspace* in summary (every other project's name, kind and word
 * count). That's the wedge — a question like "is this consistent with what I
 * argued in chapter 2" can only be answered by something holding the document,
 * not the paragraph.
 */
export interface AIContext {
  projectId: string;
  projectName: string;
  projectKind: ProjectKind;

  /** Every block in the project, flattened to text — not just the selection. */
  blocks: Array<{
    id: string;
    type: Block["type"];
    title?: string;
    /** Heading text, when the block opens with one. */
    heading?: string;
    /** Plain-text rendering of the block's content. */
    text: string;
    words: number;
  }>;

  /** Everything else in the library, summarised. */
  workspace: Array<{
    id: string;
    name: string;
    kind: ProjectKind;
    summary: string;
  }>;

  /** What the user had selected when they invoked AI, if anything. */
  selection?: {
    blockId: string;
    blockType: Block["type"];
    text: string;
  };

  /** Total words in the project, and the target if one is set. */
  words: number;
  wordGoal?: number;
}

/**
 * Long projects get chunked before they reach a real model. The budget lives
 * here rather than in the provider so every provider truncates identically and
 * the UI can say honestly how much was read.
 */
export const CONTEXT_CHAR_BUDGET = 48_000;

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
      /** Append to a text block — used by dictation, which never overwrites. */
      kind: "append-text";
      blockId: string;
      html: string;
      label: string;
    }
  | {
      /** Spin a whole new Library project out of this one. */
      kind: "create-project";
      projectKind: ProjectKind;
      name: string;
      blocks: Block[];
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
