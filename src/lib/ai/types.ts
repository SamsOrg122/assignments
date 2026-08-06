/**
 * The AI seam.
 *
 * Everything the UI knows about AI is in this file. `askAI` returns a stream of
 * chunks and, optionally, a *structured change* the user can accept or reject —
 * the model never mutates the document directly. Wiring a real model in means
 * writing one `AIProvider` and registering it; no component changes.
 */

import type {
  Block,
  BoardItem,
  CellValue,
  Column,
  DeckStyle,
  ProjectKind,
  Slide,
} from "../types";
import type { KnowledgeEntry, Member, TeamFile, Workspace } from "../team/types";

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
    /** 1 for a document title, 2+ for sections. */
    headingLevel?: number;
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

  /**
   * The block the question was asked from, selection or not. Distinct from
   * `selection`: clicking Ask AI on the second table in a document selects no
   * text, but the question is unambiguously about *that* table.
   */
  targetBlockId?: string;

  /** What the user had selected when they invoked AI, if anything. */
  selection?: {
    blockId: string;
    blockType: Block["type"];
    text: string;
  };

  /**
   * The board, with geometry. Board questions are spatial — "turn these into a
   * plan" needs to know how big the stickies are and which ones were picked —
   * and none of that survives being flattened to text.
   */
  board?: {
    items: BoardItem[];
    /** Ids the user had selected, if any. */
    selection: string[];
  };

  /**
   * Who this team is and what it knows.
   *
   * The third ring, and the one that makes answers feel like they come from a
   * colleague rather than a stranger: roles, the institution, the group's
   * conventions, and the files it has been handed. Unconfirmed entries are
   * marked so a provider can weigh them differently from established fact.
   */
  team?: {
    workspaceName: string;
    kind: Workspace["kind"];
    context?: Workspace["context"];
    members: Array<{
      name: string;
      role: Member["role"];
      title?: string;
      about?: string;
      isYou: boolean;
    }>;
    knowledge: Array<
      Pick<KnowledgeEntry, "kind" | "subject" | "body" | "confirmed" | "source">
    >;
    files: Array<Pick<TeamFile, "id" | "name" | "text" | "status">>;
    /**
     * Ids of files this particular question is *about* — the ones just
     * attached to it, as opposed to the workspace's standing collection.
     * Attaching a file and asking "summarise this" has to answer from the
     * file, not from an empty document.
     */
    focusFiles?: string[];
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
      /**
       * Something the assistant inferred and offers to keep. It lands
       * unconfirmed, so a wrong guess is visible rather than silently becoming
       * workspace fact.
       */
      kind: "remember";
      entry: { kind: string; subject: string; body: string };
      label: string;
    }
  | {
      /**
       * A document-wide formatting pass. Carries no payload: the operation is
       * named and applied by the client, so it always acts on the current
       * document rather than a snapshot taken when the answer was generated.
       */
      kind: "renumber-headings";
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
    }
  | {
      /**
       * Individual cell edits — "clean this data" and friends. Cells rather
       * than whole rows so the change applies to the *live* table: anything the
       * user typed while reading the answer survives.
       */
      kind: "set-cells";
      blockId: string;
      cells: Array<{ rowId: string; columnId: string; value: CellValue }>;
      /** A few before → after pairs, for the preview. */
      examples: Array<{ from: string; to: string }>;
      label: string;
    }
  | {
      /** Whole-deck edits: reorder, trim, rebalance a layout. */
      kind: "set-slides";
      blockId: string;
      slides: Slide[];
      label: string;
    }
  | {
      kind: "set-deck-style";
      blockId: string;
      style: DeckStyle;
      label: string;
    }
  | {
      /**
       * Board edits, as concrete items and patches. General on purpose: the
       * same shape carries "turn these stickies into a plan" (add frames, move
       * the stickies into them) and "connect these into a flow" (add
       * connectors), so the client stays a dumb applier of geometry it didn't
       * have to compute.
       */
      kind: "board-ops";
      add: BoardItem[];
      patch: Record<string, Partial<BoardItem>>;
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
