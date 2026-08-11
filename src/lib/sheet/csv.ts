/**
 * CSV, both directions.
 *
 * Small enough to write, fiddly enough to be worth writing carefully. The
 * parts that catch people out are all here: quoted fields containing the
 * delimiter, doubled quotes inside a quoted field, CRLF, a byte-order mark
 * that Excel writes and then can't read back, and the fact that half of Europe
 * separates with semicolons because the comma is their decimal point.
 */

import type { CellValue, Column, ColumnType, Row } from "../types";
import { uid } from "../factories";

export interface Grid {
  /** The first row, if it looked like headings. */
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** Whichever of `,` `;` `\t` `|` divides the first line most consistently. */
export function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t", "|"].map((d) => ({
    d,
    n: countOutsideQuotes(line, d),
  }));
  const best = counts.sort((a, b) => b.n - a.n)[0];
  return best && best.n > 0 ? best.d : ",";
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let n = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && c === delimiter) n++;
  }
  return n;
}

export function parseCsv(text: string, delimiter?: string): Grid {
  // Excel writes a BOM and then trips over it on the way back in; strip it so
  // the first heading isn't called "﻿Name".
  const src = text.replace(/^﻿/, "");
  const sep = delimiter ?? sniffDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline shouldn't invent an empty row.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      i++;
      continue;
    }
    if (c === sep) {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length) endRow();

  const first = rows[0] ?? [];
  const looksLikeHeadings =
    first.length > 0 &&
    first.every((h) => h.trim() !== "") &&
    // All-numeric first rows are data, not headings.
    first.some((h) => Number.isNaN(Number(h)));

  return {
    headers: looksLikeHeadings ? first : first.map((_, n) => `Column ${n + 1}`),
    rows: looksLikeHeadings ? rows.slice(1) : rows,
    delimiter: sep,
  };
}

const NEEDS_QUOTES = /[",\n\r;\t]/;

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null>>,
  delimiter = ",",
): string {
  const cell = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return NEEDS_QUOTES.test(s) || s !== s.trim()
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.map(cell).join(delimiter)];
  for (const row of rows) lines.push(row.map(cell).join(delimiter));
  // CRLF, because that is what every spreadsheet writes and some still expect.
  return lines.join("\r\n");
}

/* ── Turning a grid into a table ────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^[€$£]\s?-?[\d.,]+$/;
const PERCENT = /^-?[\d.,]+\s?%$/;

/**
 * What a column of raw text most likely is.
 *
 * Deliberately conservative: a column becomes a number only if *every*
 * non-empty value in it is one. One stray "n/a" and it stays text, which is
 * the honest outcome — silently dropping that value to make the type fit is
 * how importers lose data.
 */
export function guessType(values: string[]): ColumnType {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (!filled.length) return "text";
  const all = (test: (v: string) => boolean) => filled.every(test);

  if (all((v) => ISO.test(v.slice(0, 10)) && !Number.isNaN(Date.parse(v))))
    return "date";
  if (all((v) => MONEY.test(v))) return "currency";
  if (all((v) => PERCENT.test(v))) return "percent";
  if (all((v) => /^-?[\d\s.,]+$/.test(v) && Number.isFinite(readNumber(v))))
    return "number";
  if (all((v) => /^(true|false|yes|no|✓|✗)$/i.test(v))) return "checkbox";

  const distinct = new Set(filled.map((v) => v.toLowerCase()));
  // A short, repeated vocabulary is a choice list; a long one is prose.
  if (distinct.size <= 12 && distinct.size < filled.length / 2 && filled.length >= 6)
    return "select";

  return "text";
}

/** "1.234,56" and "1,234.56" both mean the same thing to a person. */
export function readNumber(text: string): number {
  const t = text.replace(/[€$£%\s]/g, "");
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  // Whichever separator comes last is the decimal one.
  const decimal = lastComma > lastDot ? "," : ".";
  const cleaned =
    decimal === ","
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  return Number(cleaned);
}

export interface ImportedTable {
  columns: Column[];
  rows: Row[];
  /** Anything worth telling the person who ran the import. */
  notes: string[];
}

export function gridToTable(grid: Grid): ImportedTable {
  const width = Math.max(grid.headers.length, ...grid.rows.map((r) => r.length), 1);
  const notes: string[] = [];

  const headers = Array.from({ length: width }, (_, i) => {
    const raw = (grid.headers[i] ?? "").trim();
    return raw || `Column ${i + 1}`;
  });

  const columns: Column[] = headers.map((name, i) => {
    const values = grid.rows.map((r) => r[i] ?? "");
    const type = guessType(values);
    const column: Column = { id: uid(), name, type };
    if (type === "select") {
      const seen: string[] = [];
      for (const v of values.map((x) => x.trim()).filter(Boolean))
        if (!seen.some((s) => s.toLowerCase() === v.toLowerCase())) seen.push(v);
      column.options = seen;
    }
    return column;
  });

  const rows: Row[] = grid.rows.map((raw) => {
    const cells: Record<string, CellValue> = {};
    columns.forEach((column, i) => {
      const text = (raw[i] ?? "").trim();
      if (!text) {
        cells[column.id] = null;
        return;
      }
      switch (column.type) {
        case "number":
        case "currency":
          cells[column.id] = readNumber(text);
          break;
        case "percent":
          cells[column.id] = readNumber(text);
          break;
        case "checkbox":
          cells[column.id] = /^(true|yes|✓)$/i.test(text) ? "true" : "false";
          break;
        default:
          cells[column.id] = text;
      }
    });
    return { id: uid(), cells };
  });

  const ragged = grid.rows.filter((r) => r.length !== width).length;
  if (ragged)
    notes.push(
      `${ragged} ${ragged === 1 ? "row was" : "rows were"} a different width from the heading row; the missing cells are empty.`,
    );

  return { columns, rows, notes };
}
