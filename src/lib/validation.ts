/**
 * What a column will accept, and what to say when it doesn't.
 *
 * The rule never blocks typing. A cell that fails is kept and marked, for one
 * reason: rules are written by people, and a rule that deletes what you typed
 * because the rule itself was wrong is a rule that loses work. Word processors
 * and spreadsheets both learned this the hard way — Excel's "retry/cancel"
 * dialog on a validated cell is the thing everyone turns off.
 *
 * So this reports. The table paints the cell and puts the sentence in a title,
 * a filter can find every row that fails, and export says how many there were.
 */

import type { CellValue, Column, Row, Validation } from "./types";
import { createBook, type Sheet, type Workbook } from "./formula";

export interface Failure {
  rowId: string;
  columnId: string;
  /** One sentence, addressed to whoever typed it. */
  message: string;
}

const isBlank = (v: CellValue | undefined) =>
  v === null || v === undefined || v === "";

const asNumber = (v: CellValue): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v ?? "").replace(/[€$£,\s]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** One cell against one column's rule. Null when it passes. */
export function checkCell(
  value: CellValue | undefined,
  column: Column,
  context: { others: CellValue[] } = { others: [] },
): string | null {
  const rule: Validation | undefined = column.validation;
  if (!rule) return null;

  if (isBlank(value))
    return rule.required ? (rule.message ?? `${column.name} can't be empty.`) : null;

  const text = String(value);

  switch (rule.is) {
    case "number":
    case "integer": {
      const n = asNumber(value);
      if (n === null) return rule.message ?? `${column.name} has to be a number.`;
      if (rule.is === "integer" && !Number.isInteger(n))
        return rule.message ?? `${column.name} has to be a whole number.`;
      break;
    }
    case "date":
      if (!ISO.test(text.slice(0, 10)) || Number.isNaN(Date.parse(text)))
        return rule.message ?? `${column.name} has to be a date, as 2026-08-11.`;
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text))
        return rule.message ?? `${column.name} has to be an email address.`;
      break;
    case "url":
      if (!/^https?:\/\/[^\s.]+\.[^\s]+$/.test(text))
        return rule.message ?? `${column.name} has to be a link starting http.`;
      break;
    default:
      break;
  }

  // Bounds. Dates compare as ISO text, which sorts correctly; everything else
  // compares as a number.
  const dateLike = rule.is === "date" || ISO.test(text.slice(0, 10));
  if (rule.min !== undefined) {
    const under = dateLike
      ? text < String(rule.min)
      : (asNumber(value) ?? 0) < Number(rule.min);
    if (under) return rule.message ?? `${column.name} can't be below ${rule.min}.`;
  }
  if (rule.max !== undefined) {
    const over = dateLike
      ? text > String(rule.max)
      : (asNumber(value) ?? 0) > Number(rule.max);
    if (over) return rule.message ?? `${column.name} can't be above ${rule.max}.`;
  }

  if (rule.minLength !== undefined && text.length < rule.minLength)
    return rule.message ?? `${column.name} needs at least ${rule.minLength} characters.`;
  if (rule.maxLength !== undefined && text.length > rule.maxLength)
    return rule.message ?? `${column.name} can't be longer than ${rule.maxLength} characters.`;

  if (rule.unique) {
    const same = context.others.filter(
      (o) => !isBlank(o) && String(o).toLowerCase() === text.toLowerCase(),
    );
    if (same.length)
      return rule.message ?? `${column.name} has to be different in every row.`;
  }

  // The choices are a rule of their own, and a stored value outside them is
  // usually an import rather than a typo — so it is reported, not corrected.
  if (column.type === "select" && column.options?.length) {
    const known = column.options.some(
      (o) => o.toLowerCase() === text.toLowerCase(),
    );
    if (!known)
      return rule.message ?? `"${text}" isn't one of the choices for ${column.name}.`;
  }

  return null;
}

/**
 * Every failing cell in a table.
 *
 * Formula rules run through the same engine as everything else, so a rule can
 * say `[end] >= [start]` or `LEN([code]) = 6` — anything a formula column
 * could compute.
 */
export function checkTable(
  columns: Column[],
  rows: Row[],
  workbook?: Workbook,
  sheetId?: string,
): Failure[] {
  const ruled = columns.filter((c) => c.validation);
  if (!ruled.length) return [];

  const own: Sheet = { id: sheetId ?? "sheet", name: "Sheet 1", columns, rows };
  const inBook = sheetId
    ? workbook?.sheets.find((s) => s.id === sheetId)
    : undefined;
  const sheet = inBook ?? own;
  const book = createBook(inBook ? workbook : { sheets: [own] });

  const out: Failure[] = [];
  for (const column of ruled) {
    const needsOthers = column.validation?.unique === true;
    for (const row of rows) {
      const others = needsOthers
        ? rows.filter((r) => r.id !== row.id).map((r) => r.cells[column.id] ?? null)
        : [];
      const message = checkCell(row.cells[column.id], column, { others });
      if (message) {
        out.push({ rowId: row.id, columnId: column.id, message });
        continue;
      }
      const rule = column.validation?.rule?.trim();
      if (rule && !book.test(rule, sheet, row))
        out.push({
          rowId: row.id,
          columnId: column.id,
          message:
            column.validation?.message ?? `${column.name} fails the rule ${rule}.`,
        });
    }
  }
  return out;
}

/** `rowId → columnId → message`, which is what a cell renderer wants. */
export function failureMap(failures: Failure[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const f of failures) (out[f.rowId] ??= {})[f.columnId] = f.message;
  return out;
}

/** One line describing a column's rule, for the header's tooltip. */
export function describeValidation(column: Column): string | null {
  const r = column.validation;
  if (!r) return null;
  const parts: string[] = [];
  if (r.required) parts.push("required");
  if (r.is) parts.push(r.is === "integer" ? "whole number" : r.is);
  if (r.min !== undefined && r.max !== undefined)
    parts.push(`between ${r.min} and ${r.max}`);
  else if (r.min !== undefined) parts.push(`at least ${r.min}`);
  else if (r.max !== undefined) parts.push(`at most ${r.max}`);
  if (r.minLength !== undefined) parts.push(`${r.minLength}+ characters`);
  if (r.maxLength !== undefined) parts.push(`up to ${r.maxLength} characters`);
  if (r.unique) parts.push("unique");
  if (r.rule) parts.push(r.rule);
  return parts.length ? parts.join(" · ") : null;
}
