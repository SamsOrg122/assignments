/**
 * Running a formula against a workbook.
 *
 * The workbook is the *project*: every table in it is a sheet, addressed by
 * its title. That is why `[Costs]![Amount]` and `Costs!B2:B40` work — they are
 * not a new storage concept, they are the tables already sitting in the
 * document, referred to by name.
 *
 * A formula column may now refer to another formula column. That used to be
 * banned outright, which made cycles impossible but also made half of what
 * people want impossible. Instead each cell is computed on demand, memoised,
 * and guarded: a cell that is asked for while it is already being computed
 * returns `#CYCLE!` rather than hanging the tab.
 *
 * Row 1 in an address is the first row of *data*. There is no header row to
 * skip — the header is the column's name, which is what `[Name]` is for.
 */

import type { CellValue, Column, Row } from "../types";
import {
  FUNCTIONS,
  type Arg,
} from "./functions";
import { ABSENT } from "./more";
import {
  columnIndex,
  parseFormula,
  type Addr,
  type Node,
  FormulaSyntaxError,
} from "./parse";
import {
  NAME,
  REF,
  VALUE,
  bool,
  compare,
  display,
  fault,
  isFault,
  num,
  str,
  type Value,
} from "./values";

export interface Sheet {
  /** The block id. Stable, and what a chart binds to. */
  id: string;
  /** The block's title, or a generated "Sheet 2". What formulas address. */
  name: string;
  columns: Column[];
  rows: Row[];
}

/** A name standing for a range, defined once and used anywhere. */
export interface NamedRange {
  id: string;
  /** No spaces, so it can't be confused with a function call. */
  name: string;
  /** Any reference a formula could have written: `Costs!B2:B40`, `[Amount]`. */
  ref: string;
  /** Which sheet an unqualified reference in `ref` belongs to. */
  sheetId?: string;
}

export interface Workbook {
  sheets: Sheet[];
  names?: NamedRange[];
}

const EMPTY: Workbook = { sheets: [] };

/** A range, kept rectangular so VLOOKUP knows how wide it is. */
interface Rect {
  values: Value[];
  width: number;
}

const scalarRect = (v: Value): Rect => ({ values: [v], width: 1 });

/** The cell as the engine sees it: `null` for blank, never `undefined`. */
const raw = (v: CellValue | undefined): Value => (v === undefined ? null : v);

export function createBook(workbook: Workbook = EMPTY) {
  const sheets = workbook.sheets;
  const byName = new Map<string, Sheet>();
  const byId = new Map<string, Sheet>();
  for (const sheet of sheets) {
    byName.set(sheet.name.trim().toLowerCase(), sheet);
    byId.set(sheet.id, sheet);
  }
  const names = new Map<string, NamedRange>();
  for (const n of workbook.names ?? [])
    names.set(n.name.trim().toLowerCase(), n);

  /** rowId → colId → value, per sheet. Memo and cycle guard in one. */
  const memo = new Map<string, Value>();
  const busy = new Set<string>();
  const trees = new Map<string, Node | FormulaSyntaxError>();

  const columnOf = (sheet: Sheet, name: string): Column | undefined =>
    sheet.columns.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

  function tree(source: string): Node | FormulaSyntaxError {
    const cached = trees.get(source);
    if (cached) return cached;
    let out: Node | FormulaSyntaxError;
    try {
      out = parseFormula(source);
    } catch (e) {
      out =
        e instanceof FormulaSyntaxError
          ? e
          : new FormulaSyntaxError("Invalid formula");
    }
    trees.set(source, out);
    return out;
  }

  /**
   * One cell, computing it first if it is a formula.
   *
   * Two ways a cell can be one, and both run through here so the memo and the
   * cycle guard cover them equally:
   *
   *   - The **column** carries the formula, and every row computes the same
   *     expression against its own row. That is the table way, and it is what
   *     keeps a thousand rows from holding a thousand copies of one idea.
   *   - The **cell** holds text beginning with `=`. That is the spreadsheet
   *     way, and it exists because somebody arriving from Excel types `=B2*C2`
   *     into a cell before they read anything, and an app that answers with
   *     the literal text "=B2*C2" has told them it is not a spreadsheet.
   *
   * A column formula wins where both exist: the column is a rule about every
   * row, and a rule that any single cell can quietly override is not a rule.
   */
  function cell(sheet: Sheet, column: Column, row: Row): Value {
    const stored = column.type === "formula" ? undefined : raw(row.cells[column.id]);
    const inCell =
      typeof stored === "string" && stored.length > 1 && stored.startsWith("=")
        ? stored.slice(1).trim()
        : null;
    if (column.type !== "formula" && !inCell) return stored as Value;

    const key = `${sheet.id}:${row.id}:${column.id}`;
    const done = memo.get(key);
    if (done !== undefined) return done;
    if (busy.has(key))
      return fault("#CYCLE!", "This formula ends up asking for itself.");

    const source = inCell ?? (column.formula ?? "").trim();
    if (!source) return "";

    busy.add(key);
    let out: Value;
    const parsed = tree(source);
    if (parsed instanceof FormulaSyntaxError) out = VALUE(parsed.message);
    else out = evaluate(parsed, { sheet, row, depth: 0 });
    busy.delete(key);
    memo.set(key, out);
    return out;
  }

  function cellAt(sheet: Sheet, at: Addr): Value {
    const column = sheet.columns[at.col];
    const row = sheet.rows[at.row];
    if (!column || !row) return REF("That cell is outside the table.");
    return cell(sheet, column, row);
  }

  interface Frame {
    sheet: Sheet;
    /** Null in a whole-column context, such as a named range's definition. */
    row: Row | null;
    depth: number;
  }

  function sheetFor(name: string | undefined, frame: Frame): Sheet | Value {
    if (!name) return frame.sheet;
    const found = byName.get(name.trim().toLowerCase());
    return found ?? REF(`There's no table called "${name}".`);
  }

  /**
   * A reference, as a rectangle.
   *
   * `wide` is the difference between the two things `[Amount]` can mean, and
   * getting it wrong is silent: in `[Amount] * 2` it is this row's cell, and
   * in `SUM([Amount])` it is the whole column. Which one applies is decided by
   * the position it appears in — a function that folds asks for the range, and
   * everything else asks for the value — rather than by a separate syntax for
   * "the column", which nobody would remember to use.
   */
  function rect(node: Node, frame: Frame, wide = false): Rect | Value {
    if (node.k === "col") {
      const sheet = sheetFor(node.sheet, frame);
      if (isFault(sheet)) return sheet;
      const column = columnOf(sheet as Sheet, node.name);
      if (!column) return NAME(`There's no column called "${node.name}".`);
      // Unqualified, inside a row, in a scalar position: this row's cell.
      // Anything else — qualified, row-less, or folded — is the whole column.
      if (!node.sheet && frame.row && !wide)
        return scalarRect(cell(frame.sheet, column, frame.row));
      return {
        values: (sheet as Sheet).rows.map((r) => cell(sheet as Sheet, column, r)),
        width: 1,
      };
    }

    if (node.k === "cells") {
      const sheet = sheetFor(node.sheet, frame);
      if (isFault(sheet)) return sheet;
      const s = sheet as Sheet;
      const from = node.from;
      const to = node.to ?? node.from;
      const c0 = Math.min(from.col, to.col);
      const c1 = Math.max(from.col, to.col);
      const r0 = Math.min(from.row, to.row);
      const r1 = Math.max(from.row, to.row);
      const values: Value[] = [];
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) values.push(cellAt(s, { col: c, row: r }));
      return { values, width: c1 - c0 + 1 };
    }

    if (node.k === "name") {
      const named = names.get(node.v.trim().toLowerCase());
      if (!named) return NAME(`"${node.v}" isn't a name this workbook knows.`);
      if (frame.depth > 8) return REF("Named ranges are nested too deep.");
      const parsed = tree(named.ref);
      if (parsed instanceof FormulaSyntaxError)
        return REF(`The name "${node.v}" points at something invalid.`);
      const home = named.sheetId ? byId.get(named.sheetId) : undefined;
      return rect(
        parsed,
        {
        sheet: home ?? frame.sheet,
        // A name is a range, never "this row" — it is defined once, away from
        // any particular row, and reading it as a row-local cell would make it
        // mean something different in every cell that used it.
        row: null,
        depth: frame.depth + 1,
        },
        true,
      );
    }

    return scalarRect(evaluate(node, frame));
  }

  function argFor(node: Node, frame: Frame): Arg & { width?: number } {
    let narrow: Rect | Value | undefined;
    let wide: Rect | Value | undefined;
    const asValue = () => (narrow ??= rect(node, frame, false));
    const asRange = () => (wide ??= rect(node, frame, true));
    return {
      get width() {
        const r = asRange();
        return isFault(r) ? 1 : (r as Rect).width;
      },
      value() {
        const r = asValue();
        if (isFault(r)) return r;
        const { values } = r as Rect;
        if (values.length === 1) return values[0];
        if (values.length === 0) return null;
        return VALUE("A range where a single value was expected.");
      },
      range() {
        const r = asRange();
        return isFault(r) ? [r] : (r as Rect).values;
      },
    };
  }

  function evaluate(node: Node, frame: Frame): Value {
    switch (node.k) {
      case "num":
        return node.v;
      case "str":
        return node.v;
      case "bool":
        return node.v;

      case "col":
      case "cells":
      case "name": {
        const r = rect(node, frame);
        if (isFault(r)) return r;
        const { values } = r as Rect;
        if (values.length === 1) return values[0];
        if (values.length === 0) return null;
        return VALUE("A range where a single value was expected.");
      }

      case "neg": {
        const v = num(evaluate(node.e, frame));
        return isFault(v) ? v : -v;
      }

      case "pct": {
        const v = num(evaluate(node.e, frame));
        return isFault(v) ? v : v / 100;
      }

      case "call": {
        const fn = FUNCTIONS[node.fn];
        if (!fn) {
          // A name we left out deliberately carries its reason with it. The
          // column editor already explains itself through `checkFormula`; a
          // formula typed straight into a cell never goes through that, and
          // "#NAME?" alone reads as a typo rather than as a decision.
          const why = ABSENT[node.fn];
          return NAME(
            why
              ? `${node.fn} isn't here. ${why}`
              : `There's no function called ${node.fn}.`,
          );
        }
        return fn(
          node.args.map((a) => argFor(a, frame)),
          node.fn,
        );
      }

      case "bin": {
        const op = node.op;
        if (op === "&") {
          const l = str(evaluate(node.l, frame));
          if (isFault(l)) return l;
          const r = str(evaluate(node.r, frame));
          return isFault(r) ? r : l + r;
        }

        const lv = evaluate(node.l, frame);
        if (isFault(lv)) return lv;
        const rv = evaluate(node.r, frame);
        if (isFault(rv)) return rv;

        if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
          const c = compare(lv, rv);
          if (isFault(c)) return c;
          switch (op) {
            case "=":
              return c === 0;
            case "<>":
              return c !== 0;
            case "<":
              return c < 0;
            case ">":
              return c > 0;
            case "<=":
              return c <= 0;
            default:
              return c >= 0;
          }
        }

        const l = num(lv);
        if (isFault(l)) return l;
        const r = num(rv);
        if (isFault(r)) return r;
        switch (op) {
          case "+":
            return l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return r === 0 ? fault("#DIV/0!", "Division by zero.") : l / r;
          case "^":
            return l ** r;
          default:
            return VALUE(`Unknown operator ${op}`);
        }
      }
    }
  }

  return {
    /**
     * Every formula cell of one sheet, ready to render.
     *
     * Formula *columns* are computed for every row; ordinary columns are
     * scanned for cells that begin with `=`. The scan is over stored strings
     * only, so a table with no cell formulas pays one `startsWith` per cell
     * and nothing else — which is what keeps a hundred thousand rows of plain
     * numbers as cheap as they were before cells could hold formulas.
     */
    compute(sheet: Sheet): Record<string, Record<string, string | number>> {
      const out: Record<string, Record<string, string | number>> = {};
      const formulaCols = sheet.columns.filter((c) => c.type === "formula");
      const plainCols = sheet.columns.filter((c) => c.type !== "formula");
      for (const row of sheet.rows) {
        let line: Record<string, string | number> | undefined;
        for (const column of formulaCols) {
          line ??= {};
          line[column.id] = display(cell(sheet, column, row));
        }
        for (const column of plainCols) {
          const stored = row.cells[column.id];
          if (typeof stored !== "string" || !stored.startsWith("=")) continue;
          line ??= {};
          line[column.id] = display(cell(sheet, column, row));
        }
        if (line) out[row.id] = line;
      }
      return out;
    },

    /** One expression, against a sheet and optionally a row. Used by pivots
     *  and by the formula editor's live preview. */
    run(source: string, sheet: Sheet, row: Row | null = null): Value {
      const parsed = tree(source.trim().replace(/^=/, ""));
      if (parsed instanceof FormulaSyntaxError) return VALUE(parsed.message);
      return evaluate(parsed, { sheet, row, depth: 0 });
    },

    /** For validation rules, which are expressions over a single value. */
    test(source: string, sheet: Sheet, row: Row): boolean {
      const v = this.run(source, sheet, row);
      const b = bool(v);
      return isFault(b) ? false : b;
    },

    cellAddress(sheet: Sheet, at: Addr): Value {
      return cellAt(sheet, at);
    },
  };
}

/** The column index a letter refers to, exported for the address bar. */
export { columnIndex };
