/**
 * The document as a set of tools.
 *
 * The model never writes to the document. It calls one of these, the call is
 * validated here against the context the request actually carried, and what
 * comes out is an `AIChange` the user still has to accept. Three gates, and
 * the middle one is this file.
 *
 * Validation is deliberately unforgiving. A model that invents a row id, names
 * a block that isn't in the project, or returns bullets as a string will have
 * its call *dropped*, not repaired — a change that half-applies to the wrong
 * rows is worse than no change, because the user accepted it believing the
 * preview.
 */

import { uid } from "../../factories";
import {
  DEFAULT_DECK_STYLE,
  type Block,
  type BoardItem,
  type BoardTone,
  type CellValue,
  type Column,
  type ColumnType,
  type DeckStyle,
  type ProjectKind,
  type Row,
  type Slide,
  type SlideLayout,
} from "../../types";
import type { AIChange, AIContext } from "../types";

/* ── Schema helpers ─────────────────────────────────────── */

type Schema = Record<string, unknown>;

const str = (description: string): Schema => ({ type: "string", description });
const num = (description: string): Schema => ({ type: "number", description });
const bool = (description: string): Schema => ({ type: "boolean", description });
const enumOf = (values: readonly string[], description: string): Schema => ({
  type: "string",
  enum: [...values],
  description,
});
const list = (items: Schema, description: string): Schema => ({
  type: "array",
  items,
  description,
});
const object = (
  properties: Record<string, Schema>,
  required: string[],
  description?: string,
): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
  ...(description ? { description } : {}),
});

const LABEL = str(
  "A short button label for the change, in the imperative — 'Tighten the introduction', 'Add a margin column'. Under six words.",
);

const CELL: Schema = {
  type: ["string", "number", "null"],
  description: "A cell value. Numbers as numbers, not strings.",
};

const COLUMN_TYPES = [
  "text",
  "number",
  "currency",
  "percent",
  "date",
  "checkbox",
  "select",
  "formula",
] as const satisfies readonly ColumnType[];

const LAYOUTS = [
  "auto",
  "title",
  "statement",
  "bullets",
  "split",
] as const satisfies readonly SlideLayout[];

const TONES = ["neutral", "accent", "mint", "warn"] as const satisfies readonly BoardTone[];

const PROJECT_KINDS = [
  "doc",
  "notes",
  "deck",
  "board",
  "code",
  "design",
] as const satisfies readonly ProjectKind[];

/** A block the model is asking to create, before it has any ids. */
const NEW_BLOCK = object(
  {
    kind: enumOf(["text", "table", "slides"], "What sort of block to make."),
    title: str("Optional label shown in the gutter."),
    html: str(
      "For kind 'text'. Simple HTML only: p, h1–h3, ul/ol/li, strong, em, blockquote, a, code, pre. No styles, scripts or classes.",
    ),
    columns: list(
      object(
        {
          name: str("Column heading."),
          type: enumOf(COLUMN_TYPES, "Column type."),
          formula: str(
            "For type 'formula'. Row expression referencing other columns by name in square brackets, e.g. [units] * [price].",
          ),
        },
        ["name", "type"],
      ),
      "For kind 'table'.",
    ),
    rows: list(
      object(
        { cells: list(CELL, "One value per column, in column order.") },
        ["cells"],
      ),
      "For kind 'table'. Formula columns are computed — leave their positions null.",
    ),
    slides: list(
      object(
        {
          title: str("Slide title."),
          bullets: list(str("One bullet."), "Three to five at most."),
          note: str("Speaker note."),
          layout: enumOf(LAYOUTS, "Layout, or omit for 'auto'."),
        },
        ["title", "bullets"],
      ),
      "For kind 'slides'.",
    ),
  },
  ["kind"],
);

export interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Schema };
}

const tool = (
  name: string,
  description: string,
  properties: Record<string, Schema>,
  required: string[],
): ChatTool => ({
  type: "function",
  function: {
    name,
    description,
    parameters: object({ ...properties, label: LABEL }, [...required, "label"]),
  },
});

export const TOOLS: ChatTool[] = [
  tool(
    "replace_text",
    "Rewrite a text block from top to bottom. Use for rewrites, tightening, tone changes and restructuring. The whole block is replaced, so return all of it.",
    { blockId: str("Id of the text block."), html: str("The complete new HTML.") },
    ["blockId", "html"],
  ),
  tool(
    "append_text",
    "Add to the end of a text block without touching what's already there. This is what dictation uses.",
    { blockId: str("Id of the text block."), html: str("HTML to append.") },
    ["blockId", "html"],
  ),
  tool(
    "insert_block",
    "Add a new block after an existing one.",
    { afterBlockId: str("Id of the block to insert after."), block: NEW_BLOCK },
    ["afterBlockId", "block"],
  ),
  tool(
    "create_project",
    "Spin a new project out of this one — a deck from a thesis, notes from a meeting. Use only when asked for something separate, not for adding to the current document.",
    {
      name: str("Name for the new project."),
      projectKind: enumOf(PROJECT_KINDS, "Which editor it opens in."),
      blocks: list(NEW_BLOCK, "The blocks it starts with."),
    },
    ["name", "projectKind", "blocks"],
  ),
  tool(
    "renumber_headings",
    "Number every section heading in the document in order. Carries no content — it is applied to the document as it stands when accepted.",
    {},
    [],
  ),
  tool(
    "remember",
    "Keep something about the person or their work that will matter next time. It lands unconfirmed for them to approve.",
    {
      kind: str("A short category, e.g. 'preference', 'deadline', 'style'."),
      subject: str("What it is about, a few words."),
      body: str("The fact itself, one sentence."),
    },
    ["kind", "subject", "body"],
  ),
  tool(
    "add_column",
    "Add a column to a table and fill it in. Use the row ids given in the context; a row you leave out is left blank.",
    {
      blockId: str("Id of the table block."),
      name: str("Column heading."),
      columnType: enumOf(COLUMN_TYPES, "Column type."),
      formula: str("For type 'formula'. e.g. [revenue] - [cost]."),
      values: list(
        object({ rowId: str("An existing row id."), value: CELL }, ["rowId", "value"]),
        "Values for existing rows. Omit entirely for a formula column.",
      ),
      appendRows: list(
        object(
          {
            cells: list(
              object({ columnId: str("An existing column id."), value: CELL }, [
                "columnId",
                "value",
              ]),
              "Values for the new row.",
            ),
            value: CELL,
          },
          ["cells"],
        ),
        "New rows to append, e.g. forecast periods. 'value' is this row's entry in the new column.",
      ),
    },
    ["blockId", "name", "columnType"],
  ),
  tool(
    "set_cells",
    "Edit individual cells — cleaning data, filling gaps, fixing units. Only the cells you list change.",
    {
      blockId: str("Id of the table block."),
      cells: list(
        object(
          {
            rowId: str("An existing row id."),
            columnId: str("An existing column id."),
            value: CELL,
          },
          ["rowId", "columnId", "value"],
        ),
        "The edits.",
      ),
      examples: list(
        object({ from: str("Before."), to: str("After.") }, ["from", "to"]),
        "Two or three before/after pairs for the preview.",
      ),
    },
    ["blockId", "cells"],
  ),
  tool(
    "set_slides",
    "Rewrite a deck: reorder, cut, split, rebalance. Return the deck you want to end up with, in order. Give 'ref' for a slide that already exists so its identity and any drawn objects survive.",
    {
      blockId: str("Id of the slides block."),
      slides: list(
        object(
          {
            ref: num(
              "1-based position of this slide in the current deck, if it is one that already exists.",
            ),
            title: str("Slide title."),
            bullets: list(str("One bullet."), "Three to five at most."),
            note: str("Speaker note."),
            layout: enumOf(LAYOUTS, "Layout, or omit for 'auto'."),
          },
          ["title", "bullets"],
        ),
        "The whole deck, in the order it should end up in.",
      ),
    },
    ["blockId", "slides"],
  ),
  tool(
    "set_deck_style",
    "Restyle a deck. Anything you leave out keeps its current value.",
    {
      blockId: str("Id of the slides block."),
      theme: enumOf(
        ["ink", "paper", "editorial", "signal", "slate"],
        "ink is dark and neutral, paper is light, editorial is serif, signal is bold, slate is cool grey.",
      ),
      scale: num("Type scale, 0.8–1.4. 1 is the default."),
      align: enumOf(["left", "centre"], "Where titles sit."),
      rule: bool("Accent rule under titles."),
      numbers: bool("Slide numbers."),
      footer: str("Footer text on every slide."),
      background: enumOf(["flat", "grain", "glow", "grid"], "Surface treatment."),
      transition: enumOf(["none", "fade", "rise"], "How slides give way."),
    },
    ["blockId"],
  ),
  tool(
    "board_ops",
    "Edit a board. Coordinates are the board's own; look at the items in the context for the space in use. Add frames around existing stickies by placing a frame that encloses them, and move stickies with patch.",
    {
      add: list(
        object(
          {
            kind: enumOf(
              ["sticky", "text", "frame", "connector"],
              "What to add.",
            ),
            x: num("Left, board coordinates."),
            y: num("Top, board coordinates."),
            width: num("Width."),
            height: num("Height."),
            text: str("For sticky and text."),
            title: str("For frame."),
            tone: enumOf(TONES, "Colour role."),
            fromId: str("For connector — id of the item it leaves."),
            toId: str("For connector — id of the item it points at."),
            label: str("For connector — words on the line."),
          },
          ["kind"],
        ),
        "New items.",
      ),
      patch: list(
        object(
          {
            id: str("An existing board item id."),
            x: num("New left."),
            y: num("New top."),
            width: num("New width."),
            height: num("New height."),
            text: str("New text."),
            title: str("New frame title."),
            tone: enumOf(TONES, "New colour role."),
          },
          ["id"],
        ),
        "Changes to existing items.",
      ),
    },
    [],
  ),
];

/* ── Validation ─────────────────────────────────────────── */

type Args = Record<string, unknown>;

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const asCell = (v: unknown): CellValue | undefined => {
  if (v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
};

const asArray = (v: unknown): Args[] =>
  Array.isArray(v) ? v.filter((i): i is Args => typeof i === "object" && i !== null) : [];

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined =>
  typeof v === "string" && (values as readonly string[]).includes(v)
    ? (v as T)
    : undefined;

/** The block the call names, if it is really in this project and of this type. */
function blockOf(
  context: AIContext,
  id: unknown,
  type: string,
): AIContext["blocks"][number] | undefined {
  const found = context.blocks.find((b) => b.id === id);
  return found?.type === type ? found : undefined;
}

/** A block the model described, given real ids. Null if it doesn't hold up. */
function buildBlock(spec: Args): Block | null {
  const kind = oneOf(spec.kind, ["text", "table", "slides"] as const);
  const title = asString(spec.title);

  if (kind === "text") {
    const html = asString(spec.html);
    if (!html) return null;
    return { id: uid(), type: "text", html, ...(title ? { title } : {}) };
  }

  if (kind === "table") {
    const columns: Column[] = asArray(spec.columns)
      .map((c) => {
        const name = asString(c.name);
        const type = oneOf(c.type, COLUMN_TYPES);
        if (!name || !type) return null;
        const formula = asString(c.formula);
        return {
          id: uid(),
          name,
          type,
          ...(type === "formula" && formula ? { formula } : {}),
        } satisfies Column;
      })
      .filter((c): c is Column => c !== null);
    if (!columns.length) return null;

    const rows: Row[] = asArray(spec.rows).map((r) => {
      const values = Array.isArray(r.cells) ? r.cells : [];
      const cells: Row["cells"] = {};
      columns.forEach((c, i) => {
        // Formula columns are derived, never stored — a value here would be
        // shadowed by the computed one and quietly disagree with it.
        if (c.type === "formula") return;
        cells[c.id] = asCell(values[i]) ?? null;
      });
      return { id: uid(), cells };
    });

    return { id: uid(), type: "table", columns, rows, ...(title ? { title } : {}) };
  }

  if (kind === "slides") {
    const slides: Slide[] = asArray(spec.slides)
      .map((s) => {
        const slideTitle = asString(s.title);
        if (!slideTitle) return null;
        const layout = oneOf(s.layout, LAYOUTS);
        const note = asString(s.note);
        return {
          id: uid(),
          title: slideTitle,
          bullets: asStrings(s.bullets),
          ...(note ? { note } : {}),
          ...(layout ? { layout } : {}),
        } satisfies Slide;
      })
      .filter((s): s is Slide => s !== null);
    if (!slides.length) return null;
    return { id: uid(), type: "slides", slides, ...(title ? { title } : {}) };
  }

  return null;
}

/**
 * Turn one validated tool call into a change, or nothing.
 *
 * `context` is not decoration: every id the model used is checked against it,
 * which is what stops a confidently hallucinated `blockId` from becoming a
 * change the user is invited to accept.
 */
export function buildChange(
  name: string,
  args: Args,
  context: AIContext,
): AIChange | null {
  const label = asString(args.label) ?? "Apply this";

  switch (name) {
    case "replace_text":
    case "append_text": {
      const block = blockOf(context, args.blockId, "text");
      const html = asString(args.html);
      if (!block || !html) return null;
      return {
        kind: name === "replace_text" ? "replace-text" : "append-text",
        blockId: block.id,
        html,
        label,
      };
    }

    case "insert_block": {
      const after = context.blocks.find((b) => b.id === args.afterBlockId);
      const spec = typeof args.block === "object" && args.block ? (args.block as Args) : null;
      if (!after || !spec) return null;
      const block = buildBlock(spec);
      if (!block) return null;
      return { kind: "insert-block", afterBlockId: after.id, block, label };
    }

    case "create_project": {
      const projectName = asString(args.name);
      const projectKind = oneOf(args.projectKind, PROJECT_KINDS);
      if (!projectName || !projectKind) return null;
      const blocks = asArray(args.blocks)
        .map(buildBlock)
        .filter((b): b is Block => b !== null);
      if (!blocks.length) return null;
      return { kind: "create-project", projectKind, name: projectName, blocks, label };
    }

    case "renumber_headings":
      return { kind: "renumber-headings", label };

    case "remember": {
      const entryKind = asString(args.kind);
      const subject = asString(args.subject);
      const body = asString(args.body);
      if (!entryKind || !subject || !body) return null;
      return { kind: "remember", entry: { kind: entryKind, subject, body }, label };
    }

    case "add_column": {
      const block = blockOf(context, args.blockId, "table");
      const columnName = asString(args.name);
      const columnType = oneOf(args.columnType, COLUMN_TYPES);
      if (!block || !columnName || !columnType) return null;

      const formula = asString(args.formula);
      if (columnType === "formula" && !formula) return null;

      const column: Column = {
        id: uid(),
        name: columnName,
        type: columnType,
        ...(formula && columnType === "formula" ? { formula } : {}),
      };

      const known = new Set(block.rowIds ?? []);
      const values: Record<string, CellValue> = {};
      for (const entry of asArray(args.values)) {
        const rowId = asString(entry.rowId);
        const value = asCell(entry.value);
        if (!rowId || !known.has(rowId) || value === undefined) continue;
        values[rowId] = value;
      }

      const columnIds = new Set((block.columns ?? []).map((c) => c.id));
      const appendRows = asArray(args.appendRows).map((r) => {
        const cells: Record<string, CellValue> = {};
        for (const cell of asArray(r.cells)) {
          const columnId = asString(cell.columnId);
          const value = asCell(cell.value);
          if (!columnId || !columnIds.has(columnId) || value === undefined) continue;
          cells[columnId] = value;
        }
        const own = asCell(r.value);
        if (own !== undefined) cells[column.id] = own;
        return { id: uid(), cells };
      });

      return {
        kind: "add-column",
        blockId: block.id,
        column,
        values,
        ...(appendRows.length ? { appendRows } : {}),
        label,
      };
    }

    case "set_cells": {
      const block = blockOf(context, args.blockId, "table");
      if (!block) return null;
      const rows = new Set(block.rowIds ?? []);
      const columns = new Map((block.columns ?? []).map((c) => [c.id, c]));

      const cells = asArray(args.cells)
        .map((c) => {
          const rowId = asString(c.rowId);
          const columnId = asString(c.columnId);
          const value = asCell(c.value);
          if (!rowId || !columnId || value === undefined) return null;
          if (!rows.has(rowId) || !columns.has(columnId)) return null;
          // A formula column has no stored cell to set; writing one would be
          // silently discarded on the next render.
          if (columns.get(columnId)!.type === "formula") return null;
          return { rowId, columnId, value };
        })
        .filter((c): c is { rowId: string; columnId: string; value: CellValue } => c !== null);
      if (!cells.length) return null;

      const examples = asArray(args.examples)
        .map((e) => ({ from: asString(e.from) ?? "", to: asString(e.to) ?? "" }))
        .filter((e) => e.from || e.to)
        .slice(0, 3);

      return { kind: "set-cells", blockId: block.id, cells, examples, label };
    }

    case "set_slides": {
      const block = blockOf(context, args.blockId, "slides");
      if (!block) return null;
      const existing = block.slideIds ?? [];

      const slides: Slide[] = asArray(args.slides)
        .map((s) => {
          const slideTitle = asString(s.title);
          if (!slideTitle) return null;
          // `ref` carries identity across the rewrite: keeping the id is what
          // lets the applier preserve anything drawn on that slide.
          const ref = asNumber(s.ref);
          const id =
            ref !== undefined && existing[Math.round(ref) - 1]
              ? existing[Math.round(ref) - 1]
              : uid();
          const note = asString(s.note);
          const layout = oneOf(s.layout, LAYOUTS);
          return {
            id,
            title: slideTitle,
            bullets: asStrings(s.bullets),
            ...(note ? { note } : {}),
            ...(layout ? { layout } : {}),
          } satisfies Slide;
        })
        .filter((s): s is Slide => s !== null);
      if (!slides.length) return null;

      // A ref used twice would give two slides the same id, and React would
      // then render one of them wherever the other belongs.
      const seen = new Set<string>();
      for (const slide of slides) {
        if (seen.has(slide.id)) slide.id = uid();
        seen.add(slide.id);
      }

      return { kind: "set-slides", blockId: block.id, slides, label };
    }

    case "set_deck_style": {
      const block = blockOf(context, args.blockId, "slides");
      if (!block) return null;
      const current = block.deckStyle ?? DEFAULT_DECK_STYLE;

      const scale = asNumber(args.scale);
      const footer = asString(args.footer);
      const style: DeckStyle = {
        ...current,
        theme:
          oneOf(args.theme, ["ink", "paper", "editorial", "signal", "slate"] as const) ??
          current.theme,
        scale: scale === undefined ? current.scale : Math.min(1.4, Math.max(0.8, scale)),
        align: oneOf(args.align, ["left", "centre"] as const) ?? current.align,
        rule: typeof args.rule === "boolean" ? args.rule : current.rule,
        numbers: typeof args.numbers === "boolean" ? args.numbers : current.numbers,
        background:
          oneOf(args.background, ["flat", "grain", "glow", "grid"] as const) ??
          current.background,
        transition:
          oneOf(args.transition, ["none", "fade", "rise"] as const) ?? current.transition,
        ...(footer ? { footer } : {}),
      };
      return { kind: "set-deck-style", blockId: block.id, style, label };
    }

    case "board_ops": {
      const items = context.board?.items ?? [];
      const known = new Set(items.map((i) => i.id));
      const top = items.reduce((n, i) => Math.max(n, i.z), 0);

      const add: BoardItem[] = [];
      for (const spec of asArray(args.add)) {
        const kind = oneOf(spec.kind, ["sticky", "text", "frame", "connector"] as const);
        if (!kind) continue;
        const tone = oneOf(spec.tone, TONES) ?? "neutral";
        const base = {
          id: uid(),
          x: asNumber(spec.x) ?? 0,
          y: asNumber(spec.y) ?? 0,
          width: asNumber(spec.width) ?? 200,
          height: asNumber(spec.height) ?? 160,
          z: top + add.length + 1,
        };

        if (kind === "connector") {
          const fromId = asString(spec.fromId);
          const toId = asString(spec.toId);
          // A connector to a phantom would render as a line to nowhere.
          if (!fromId || !toId || !known.has(fromId) || !known.has(toId)) continue;
          const connectorLabel = asString(spec.label);
          add.push({
            ...base,
            kind: "connector",
            fromId,
            toId,
            arrow: "end",
            route: "curve",
            tone,
            ...(connectorLabel ? { label: connectorLabel } : {}),
          });
          continue;
        }

        if (kind === "frame") {
          const frameTitle = asString(spec.title) ?? "Untitled";
          // Frames sit behind everything, and a frame added on top would
          // swallow every click meant for what's inside it.
          add.push({ ...base, z: 0, kind: "frame", title: frameTitle, tone });
          continue;
        }

        const text = asString(spec.text);
        if (!text) continue;
        add.push(
          kind === "sticky"
            ? { ...base, kind: "sticky", text, tone }
            : { ...base, kind: "text", text },
        );
      }

      const patch: Record<string, Partial<BoardItem>> = {};
      for (const spec of asArray(args.patch)) {
        const id = asString(spec.id);
        if (!id || !known.has(id)) continue;
        const item = items.find((i) => i.id === id)!;
        const next: Record<string, unknown> = {};
        for (const key of ["x", "y", "width", "height"] as const) {
          const value = asNumber(spec[key]);
          if (value !== undefined) next[key] = value;
        }
        const tone = oneOf(spec.tone, TONES);
        if (tone && "tone" in item) next.tone = tone;
        const text = asString(spec.text);
        if (text && "text" in item) next.text = text;
        const title = asString(spec.title);
        if (title && item.kind === "frame") next.title = title;
        if (Object.keys(next).length) patch[id] = next as Partial<BoardItem>;
      }

      if (!add.length && !Object.keys(patch).length) return null;
      return { kind: "board-ops", add, patch, label };
    }

    default:
      return null;
  }
}
