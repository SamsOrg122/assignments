/**
 * The table's view pipeline — filter, sort, format — as pure functions.
 *
 * Kept out of the component so the same rules drive the grid, exports, and
 * anything else that shows a table. None of this ever mutates row order in
 * the stored data: sort and filter are how you *look* at a table, not what
 * the table is.
 */

import { FORMULA_ERROR, toNumber } from "./formula";
import {
  NUMERIC_COLUMN_TYPES,
  sortsOf,
  type CellValue,
  type Column,
  type FormatRule,
  type Row,
  type TableBlock,
  type TableFilter,
} from "./types";

export type Derived = Record<string, Record<string, string | number>>;

/** A cell's effective value: derived for formula columns, stored otherwise. */
export function readCell(
  row: Row,
  column: Column,
  derived: Derived,
): CellValue {
  return column.type === "formula"
    ? ((derived[row.id]?.[column.id] ?? null) as CellValue)
    : (row.cells[column.id] ?? null);
}

/* ── Filters ────────────────────────────────────────────── */

export function passesFilter(
  filter: TableFilter,
  raw: CellValue,
  column: Column,
): boolean {
  const blank = raw === null || raw === undefined || raw === "";
  switch (filter.op) {
    case "empty":
      return blank;
    case "notEmpty":
      return !blank;
    case "contains":
      return String(raw ?? "")
        .toLowerCase()
        .includes((filter.value ?? "").toLowerCase());
    case "eq":
    case "neq": {
      const hit = NUMERIC_COLUMN_TYPES.has(column.type)
        ? toNumber(raw) === toNumber(filter.value ?? "")
        : String(raw ?? "").toLowerCase() ===
          (filter.value ?? "").toLowerCase();
      return filter.op === "eq" ? hit : !hit;
    }
    case "gt":
      return !blank && toNumber(raw) > toNumber(filter.value ?? "");
    case "lt":
      return !blank && toNumber(raw) < toNumber(filter.value ?? "");
  }
}

/* ── The pipeline ───────────────────────────────────────── */

/** Filtered and sorted rows, ready to render. */
export function viewRows(block: TableBlock, derived: Derived): Row[] {
  const byId = new Map(block.columns.map((c) => [c.id, c]));

  let rows = block.rows;

  const filters = block.filters ?? [];
  if (filters.length) {
    rows = rows.filter((row) =>
      filters.every((f) => {
        const column = byId.get(f.columnId);
        return column ? passesFilter(f, readCell(row, column, derived), column) : true;
      }),
    );
  }

  const keys = sortsOf(block);
  if (keys.length) {
    rows = [...rows].sort((a, b) => {
      for (const key of keys) {
        const column = byId.get(key.columnId);
        if (!column) continue;
        const av = readCell(a, column, derived);
        const bv = readCell(b, column, derived);
        const blankA = av === null || av === "";
        const blankB = bv === null || bv === "";
        if (blankA && blankB) continue;
        if (blankA) return 1; // blanks always sink, whatever the direction
        if (blankB) return -1;
        const cmp = NUMERIC_COLUMN_TYPES.has(column.type)
          ? toNumber(av) - toNumber(bv)
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
        if (cmp !== 0) return key.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }

  return rows;
}

/* ── Conditional formatting ─────────────────────────────── */

/** First matching rule wins. Returns its tone, or null. */
export function formatTone(
  rules: FormatRule[],
  column: Column,
  raw: CellValue,
): FormatRule["tone"] | null {
  for (const rule of rules) {
    if (rule.columnId !== column.id) continue;
    const blank = raw === null || raw === undefined || raw === "";
    const hit =
      rule.op === "contains"
        ? String(raw ?? "")
            .toLowerCase()
            .includes(rule.value.toLowerCase())
        : rule.op === "eq"
          ? NUMERIC_COLUMN_TYPES.has(column.type)
            ? !blank && toNumber(raw) === toNumber(rule.value)
            : String(raw ?? "").toLowerCase() === rule.value.toLowerCase()
          : rule.op === "gt"
            ? !blank && toNumber(raw) > toNumber(rule.value)
            : !blank && toNumber(raw) < toNumber(rule.value);
    if (hit) return rule.tone;
  }
  return null;
}

/* ── Display formatting ─────────────────────────────────── */

const CURRENCY = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 6 });

/** A cell's display string. The raw value stays what the user typed. */
export function displayCell(raw: CellValue, column: Column): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (raw === FORMULA_ERROR) return FORMULA_ERROR;

  switch (column.type) {
    case "currency":
      return CURRENCY.format(toNumber(raw));
    case "percent":
      // Stored as the number the user typed: 12 displays as 12%.
      return `${PLAIN.format(toNumber(raw))}%`;
    case "number":
    case "formula":
      return typeof raw === "number" ? PLAIN.format(raw) : String(raw);
    case "date": {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime())
        ? String(raw)
        : d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
    }
    default:
      return String(raw);
  }
}

/** True for values a checkbox column treats as ticked. Stored as 1 / null. */
export const isChecked = (raw: CellValue): boolean =>
  raw === 1 || raw === "1" || raw === "true" || raw === "yes" || raw === "x";
