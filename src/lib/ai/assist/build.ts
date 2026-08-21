/**
 * Turning what a model proposes into blocks the app already knows.
 *
 * The desktop note has no project, no block ids and no store — it is a
 * 340-pixel textarea. So when its assistant is asked to *make* something,
 * the shape it produces is built here, on the server, where the types live
 * and where `lib/types` can be imported. Rust receives a finished artefact
 * and writes it to the account; it never learns what a slide is.
 *
 * The governing rule is the one the editor's own tools follow: **drop, never
 * repair.** A table with no columns, a chart naming a table that is not in
 * the same artefact, a slide with no title — every one of those is discarded
 * and counted, and the count is said out loud. A model that half-understood
 * the question should produce less, not something subtly wrong that somebody
 * has to notice.
 */

import { uid } from "../../factories";
import {
  DEFAULT_DECK_STYLE,
  NUMERIC_COLUMN_TYPES,
  type Block,
  type CellValue,
  type Column,
  type Row,
  type Slide,
} from "../../types";

type Args = Record<string, unknown>;

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asArray = (value: unknown): Args[] =>
  Array.isArray(value) ? value.filter((v): v is Args => Boolean(v) && typeof v === "object") : [];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(Boolean) : [];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;

// The offerable subset. `formula` is left out deliberately: a formula
// column is derived, and a model inventing one would produce a table whose
// values disagree with themselves the moment anything is edited.
const COLUMN_TYPES = [
  "text",
  "number",
  "currency",
  "percent",
  "date",
  "select",
  "checkbox",
] as const;
const CHART_KINDS = ["bar", "line", "area", "pie"] as const;
const LAYOUTS = ["auto", "title", "statement", "bullets", "split"] as const;

/** Escape, because a model's prose lands inside a text block's markup. */
const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Prose to paragraphs. Blank lines separate; single newlines are breaks. */
export function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface Built {
  blocks: Block[];
  /** How many proposed blocks did not hold up. Said out loud, never hidden. */
  dropped: number;
}

/**
 * Build the artefact's blocks in order.
 *
 * Charts are resolved in a second pass because a chart names its table by
 * the *title* the model gave it — the real ids are minted here and the model
 * has never seen them. A chart naming a table that was itself dropped is
 * dropped too rather than arriving unbound, which is the difference between
 * a document and a document with an empty box in it.
 */
export function buildBlocks(specs: unknown): Built {
  const list = asArray(specs);
  const blocks: Block[] = [];
  const tablesByTitle = new Map<string, string>();
  const chartsToBind: Array<{ index: number; wants: string }> = [];
  let dropped = 0;

  for (const spec of list) {
    const kind = oneOf(spec.kind, ["text", "table", "chart", "slides"] as const);
    if (!kind) {
      dropped += 1;
      continue;
    }
    const title = asString(spec.title);

    if (kind === "text") {
      const text = asString(spec.text);
      if (!text) {
        dropped += 1;
        continue;
      }
      blocks.push({
        id: uid(),
        type: "text",
        html: paragraphs(text),
        ...(title ? { title } : {}),
      });
      continue;
    }

    if (kind === "table") {
      const columns: Column[] = asArray(spec.columns)
        .map((c): Column | null => {
          const name = asString(c.name);
          const type = oneOf(c.type, COLUMN_TYPES);
          if (!name || !type) return null;
          return { id: uid(), name, type };
        })
        .filter((c): c is Column => c !== null);
      if (!columns.length) {
        dropped += 1;
        continue;
      }

      const rows: Row[] = asArray(spec.rows).map((r) => {
        const values = Array.isArray(r.cells) ? r.cells : [];
        const cells: Row["cells"] = {};
        columns.forEach((c, i) => {
          const raw = values[i];
          // A cell is a string, a number or nothing. A boolean arriving for
          // a checkbox column becomes the string the grid stores.
          const value: CellValue =
            typeof raw === "string" || typeof raw === "number"
              ? raw
              : typeof raw === "boolean"
                ? raw
                  ? "true"
                  : ""
                : null;
          cells[c.id] = value;
        });
        return { id: uid(), cells };
      });

      const block: Block = {
        id: uid(),
        type: "table",
        columns,
        rows,
        ...(title ? { title } : {}),
      };
      blocks.push(block);
      if (title) tablesByTitle.set(title.toLowerCase(), block.id);
      continue;
    }

    if (kind === "chart") {
      const chartKind = oneOf(spec.kind_of_chart, CHART_KINDS) ?? "bar";
      const wants = asString(spec.of);
      if (!wants) {
        dropped += 1;
        continue;
      }
      chartsToBind.push({ index: blocks.length, wants: wants.toLowerCase() });
      blocks.push({
        id: uid(),
        type: "chart",
        sourceId: null,
        kind: chartKind,
        xColumnId: null,
        yColumnIds: [],
        ...(title ? { title } : {}),
      });
      continue;
    }

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
    if (!slides.length) {
      dropped += 1;
      continue;
    }
    blocks.push({
      id: uid(),
      type: "slides",
      slides,
      style: DEFAULT_DECK_STYLE,
      ...(title ? { title } : {}),
    });
  }

  // Second pass: bind each chart to the table it named, and drop the ones
  // that named something that is not here.
  const doomed = new Set<number>();
  for (const { index, wants } of chartsToBind) {
    const sourceId = tablesByTitle.get(wants);
    const block = blocks[index];
    if (!sourceId || !block || block.type !== "chart") {
      doomed.add(index);
      dropped += 1;
      continue;
    }
    const table = blocks.find((b) => b.id === sourceId);
    if (!table || table.type !== "table") {
      doomed.add(index);
      dropped += 1;
      continue;
    }
    // The x axis is the first column that is not a number; the y axes are
    // the numeric ones. A chart of a table whose columns are all text has
    // nothing to plot and is dropped rather than drawn empty.
    const x =
      table.columns.find((c) => !NUMERIC_COLUMN_TYPES.has(c.type)) ?? table.columns[0];
    const ys = table.columns.filter(
      (c) => NUMERIC_COLUMN_TYPES.has(c.type) && c.id !== x?.id,
    );
    if (!x || ys.length === 0) {
      doomed.add(index);
      dropped += 1;
      continue;
    }
    blocks[index] = {
      ...block,
      sourceId,
      xColumnId: x.id,
      yColumnIds: ys.map((c) => c.id),
    };
  }

  return { blocks: blocks.filter((_, i) => !doomed.has(i)), dropped };
}
