/**
 * A very small, dependency-free spreadsheet expression engine.
 *
 * Deliberately not `eval`: expressions come from user content and would
 * otherwise be an injection vector. This is a hand-written recursive-descent
 * parser over a fixed grammar, so the worst a malicious formula can do is
 * produce `#ERR`.
 *
 * Grammar:
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/" | "%") unary)*
 *   unary   := "-" unary | power
 *   power   := primary ("^" unary)?
 *   primary := number | ref | call | "(" expr ")"
 *   ref     := "[" column name "]"          → this row's value in that column
 *   call    := NAME "(" [expr ("," expr)*] ")"
 *
 * Aggregate functions (SUM, AVG, MIN, MAX, COUNT) take a column reference and
 * fold over every row, which is what makes `[units] / SUM([units])` work.
 */

import type { CellValue, Column, Row } from "./types";

type Token =
  | { k: "num"; v: number }
  | { k: "ref"; v: string }
  | { k: "name"; v: string }
  | { k: "op"; v: string };

const OPS = new Set(["+", "-", "*", "/", "%", "^", "(", ")", ","]);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      const end = src.indexOf("]", i);
      if (end === -1) throw new Error("unclosed [");
      out.push({ k: "ref", v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const n = Number(src.slice(i, j).replace(/_/g, ""));
      if (Number.isNaN(n)) throw new Error("bad number");
      out.push({ k: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: "name", v: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    if (OPS.has(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected ${c}`);
  }
  return out;
}

/** Everything the evaluator needs to resolve a `[column]` reference. */
interface Scope {
  /** Value of `name` in the row currently being computed. */
  cell(name: string): number;
  /** Every numeric value of `name` across the table, for aggregates. */
  column(name: string): number[];
}

const AGGREGATES: Record<string, (xs: number[]) => number> = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  AVG: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  MIN: (xs) => (xs.length ? Math.min(...xs) : 0),
  MAX: (xs) => (xs.length ? Math.max(...xs) : 0),
  COUNT: (xs) => xs.length,
};

const SCALARS: Record<string, (...a: number[]) => number> = {
  ABS: Math.abs,
  ROUND: (x, p = 0) => {
    const f = 10 ** p;
    return Math.round(x * f) / f;
  },
  FLOOR: Math.floor,
  CEIL: Math.ceil,
  SQRT: Math.sqrt,
  POW: (x, y) => x ** y,
  IF: (c, a, b) => (c ? a : b),
};

function parse(tokens: Token[], scope: Scope): number {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v: string) => {
    const t = tokens[p];
    if (!t || t.k !== "op" || t.v !== v) throw new Error(`expected ${v}`);
    p++;
  };

  function expr(): number {
    let left = term();
    for (;;) {
      const t = peek();
      if (t?.k === "op" && (t.v === "+" || t.v === "-")) {
        p++;
        const right = term();
        left = t.v === "+" ? left + right : left - right;
      } else return left;
    }
  }

  function term(): number {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t?.k === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
        p++;
        const right = unary();
        if (t.v === "*") left = left * right;
        else if (t.v === "/") {
          if (right === 0) throw new Error("div by zero");
          left = left / right;
        } else {
          if (right === 0) throw new Error("mod by zero");
          left = left % right;
        }
      } else return left;
    }
  }

  function unary(): number {
    const t = peek();
    if (t?.k === "op" && t.v === "-") {
      p++;
      return -unary();
    }
    return power();
  }

  function power(): number {
    const base = primary();
    const t = peek();
    if (t?.k === "op" && t.v === "^") {
      p++;
      return base ** unary();
    }
    return base;
  }

  function primary(): number {
    const t = peek();
    if (!t) throw new Error("unexpected end");

    if (t.k === "num") {
      p++;
      return t.v;
    }
    if (t.k === "ref") {
      p++;
      return scope.cell(t.v);
    }
    if (t.k === "op" && t.v === "(") {
      p++;
      const v = expr();
      eat(")");
      return v;
    }
    if (t.k === "name") {
      const fn = t.v;
      p++;
      eat("(");

      // Aggregates fold a whole column rather than evaluating an expression.
      const agg = AGGREGATES[fn];
      if (agg) {
        const arg = peek();
        if (!arg || arg.k !== "ref")
          throw new Error(`${fn} expects a [column]`);
        p++;
        eat(")");
        return agg(scope.column(arg.v));
      }

      const args: number[] = [];
      if (!(peek()?.k === "op" && (peek() as { v: string }).v === ")")) {
        args.push(expr());
        while (peek()?.k === "op" && (peek() as { v: string }).v === ",") {
          p++;
          args.push(expr());
        }
      }
      eat(")");

      const scalar = SCALARS[fn];
      if (!scalar) throw new Error(`unknown function ${fn}`);
      return scalar(...args);
    }
    throw new Error("unexpected token");
  }

  const value = expr();
  if (p !== tokens.length) throw new Error("trailing input");
  return value;
}

/** Coerce any cell into a number for arithmetic. Blanks and text read as 0. */
export function toNumber(v: CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[$,\s%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const FORMULA_ERROR = "#ERR";

/**
 * Compute every formula column for every row, returning a
 * `rowId → columnId → displayValue` lookup.
 *
 * Formula columns may not reference other formula columns; that keeps
 * evaluation single-pass and makes cycles impossible by construction.
 */
export function computeFormulas(
  columns: Column[],
  rows: Row[],
): Record<string, Record<string, string | number>> {
  const byName = new Map<string, Column>();
  for (const c of columns) byName.set(c.name.toLowerCase(), c);

  const columnCache = new Map<string, number[]>();
  const columnValues = (name: string): number[] => {
    const key = name.toLowerCase();
    const cached = columnCache.get(key);
    if (cached) return cached;
    const col = byName.get(key);
    // Aggregating a formula column is not supported — treat as empty.
    const vals =
      col && col.type !== "formula"
        ? rows.map((r) => toNumber(r.cells[col.id]))
        : [];
    columnCache.set(key, vals);
    return vals;
  };

  const out: Record<string, Record<string, string | number>> = {};
  const formulaCols = columns.filter((c) => c.type === "formula");
  if (formulaCols.length === 0) return out;

  for (const row of rows) {
    const rowOut: Record<string, string | number> = {};
    for (const col of formulaCols) {
      const src = (col.formula ?? "").trim().replace(/^=/, "");
      if (!src) {
        rowOut[col.id] = "";
        continue;
      }
      try {
        const value = parse(tokenize(src), {
          cell: (name) => {
            const target = byName.get(name.toLowerCase());
            if (!target) throw new Error(`no column ${name}`);
            if (target.type === "formula")
              throw new Error("formula → formula reference");
            return toNumber(row.cells[target.id]);
          },
          column: columnValues,
        });
        rowOut[col.id] = Number.isFinite(value)
          ? Math.round(value * 1e6) / 1e6
          : FORMULA_ERROR;
      } catch {
        rowOut[col.id] = FORMULA_ERROR;
      }
    }
    out[row.id] = rowOut;
  }
  return out;
}

/** Validate a formula without a table, for inline editor feedback. */
export function checkFormula(
  formula: string,
  columns: Column[],
): string | null {
  const src = formula.trim().replace(/^=/, "");
  if (!src) return null;
  const names = new Set(columns.map((c) => c.name.toLowerCase()));
  try {
    const tokens = tokenize(src);
    for (const t of tokens) {
      if (t.k === "ref" && !names.has(t.v.toLowerCase()))
        return `Unknown column [${t.v}]`;
    }
    parse(tokens, { cell: () => 1, column: () => [1] });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid formula";
  }
}
