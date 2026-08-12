/**
 * The spreadsheet engine, from the outside.
 *
 * One table was never a workbook. A formula could reach the columns of its own
 * table and nothing else — no other table, no range of cells, no name standing
 * for a range — which ruled out most of what people open a spreadsheet to do.
 * That is what this package fixes, in three pieces:
 *
 *   `values.ts`     what a formula computes with, errors included
 *   `parse.ts`      source → tree, so branches can go un-evaluated
 *   `functions.ts`  the library
 *   `evaluate.ts`   the tree, against a workbook
 *
 * `computeFormulas(columns, rows)` still means what it always did, so every
 * caller that only has one table keeps working. Pass a workbook as well and
 * the same formulas can reach across it.
 */

import type { CellValue, Column, Row } from "../types";
import { createBook, type Sheet, type Workbook } from "./evaluate";
import { FUNCTION_NAMES, knownFunction } from "./functions";
import {
  FormulaSyntaxError,
  parseFormula,
  referencedColumns,
  type Node,
} from "./parse";
import { display, isFault } from "./values";

export type { Sheet, Workbook, NamedRange } from "./evaluate";
export type { Value, FormulaFault } from "./values";
export { isFault, display } from "./values";
export { createBook } from "./evaluate";
export { columnLetters, columnIndex } from "./parse";
export { FUNCTION_NAMES, knownFunction } from "./functions";

/**
 * The sentinel the table view still checks for.
 *
 * Errors now come with Excel's specific codes — `#DIV/0!`, `#N/A`, `#NAME?` —
 * which say far more than one flat `#ERR` ever did. `isErrorText` is the check
 * to use; this constant remains because a stored document may hold it.
 */
export const FORMULA_ERROR = "#ERR";

/** Whether a computed cell is an error of any kind. */
export const isErrorText = (v: unknown): boolean =>
  typeof v === "string" && v.startsWith("#") && v.length > 1;

/** Coerce any cell into a number for arithmetic. Blanks and text read as 0. */
export function toNumber(v: CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[$,\s%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Every formula cell of one table, as `rowId → columnId → display value`.
 *
 * With a workbook, the table is looked up inside it by id so that references
 * to other sheets resolve; without one, the table is the whole world, which is
 * what every existing caller means.
 */
export function computeFormulas(
  columns: Column[],
  rows: Row[],
  workbook?: Workbook,
  sheetId?: string,
): Record<string, Record<string, string | number>> {
  const own: Sheet = { id: sheetId ?? "sheet", name: "Sheet 1", columns, rows };
  const inBook = sheetId
    ? workbook?.sheets.find((s) => s.id === sheetId)
    : undefined;
  const book = createBook(inBook ? workbook : { sheets: [own] });
  return book.compute(inBook ?? own);
}

/**
 * Check a formula without running it, for the editor's inline feedback.
 *
 * Three separate things can be wrong and they deserve different sentences: the
 * shape (a missing bracket), the names (a column or function that doesn't
 * exist), and the result (a division by zero, which is only visible once it
 * runs). The first two are found here.
 */
export function checkFormula(
  formula: string,
  columns: Column[],
  workbook?: Workbook,
): string | null {
  const src = formula.trim().replace(/^=/, "");
  if (!src) return null;

  let tree: Node;
  try {
    tree = parseFormula(src);
  } catch (e) {
    return e instanceof FormulaSyntaxError ? e.message : "Invalid formula";
  }

  const here = new Set(columns.map((c) => c.name.trim().toLowerCase()));
  const sheets = new Map(
    (workbook?.sheets ?? []).map((s) => [
      s.name.trim().toLowerCase(),
      new Set(s.columns.map((c) => c.name.trim().toLowerCase())),
    ]),
  );

  for (const ref of referencedColumns(tree)) {
    if (!ref.sheet) {
      if (!here.has(ref.name.trim().toLowerCase()))
        return `There's no column called [${ref.name}]`;
      continue;
    }
    const other = sheets.get(ref.sheet.trim().toLowerCase());
    if (!other) return `There's no table called [${ref.sheet}]`;
    if (!other.has(ref.name.trim().toLowerCase()))
      return `[${ref.sheet}] has no column called [${ref.name}]`;
  }

  const missing = unknownFunctions(tree);
  if (missing.length) return `There's no function called ${missing[0]}`;

  return null;
}

function unknownFunctions(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    switch (n.k) {
      case "call":
        if (!knownFunction(n.fn)) out.push(n.fn);
        n.args.forEach(walk);
        return;
      case "bin":
        walk(n.l);
        walk(n.r);
        return;
      case "neg":
      case "pct":
        walk(n.e);
        return;
      default:
        return;
    }
  };
  walk(node);
  return out;
}

/**
 * What one expression comes to, right now — the formula editor's live preview
 * and the "what would this row give?" line under the input.
 */
export function previewFormula(
  formula: string,
  columns: Column[],
  rows: Row[],
  workbook?: Workbook,
  sheetId?: string,
): string {
  const own: Sheet = { id: sheetId ?? "sheet", name: "Sheet 1", columns, rows };
  const inBook = sheetId
    ? workbook?.sheets.find((s) => s.id === sheetId)
    : undefined;
  const sheet = inBook ?? own;
  const book = createBook(inBook ? workbook : { sheets: [own] });
  const value = book.run(formula, sheet, sheet.rows[0] ?? null);
  return isFault(value) ? `${value.code} — ${value.why}` : String(display(value));
}

/** Names the editor can offer, longest first so `COUNTIF` beats `COUNT`. */
export const FUNCTION_SUGGESTIONS = [...FUNCTION_NAMES].sort(
  (a, b) => b.length - a.length,
);

export { shiftFormula, isFormulaCell, cycleAnchor } from "./shift";
