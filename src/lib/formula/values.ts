/**
 * What a formula computes with.
 *
 * The old engine spoke only in numbers, which is fine until somebody wants
 * `IF([status] = "done", 1, 0)` or `LEFT([name], 3)`. Values are now the four
 * things a cell can hold, plus errors — and errors are *values*, not thrown
 * exceptions, because `IFERROR` has to be able to catch one and carry on.
 */

export type Scalar = number | string | boolean | null;

/** A spreadsheet error. Carries Excel's code so the cell reads familiarly. */
export interface FormulaFault {
  readonly fault: true;
  /** `#DIV/0!`, `#VALUE!`, `#N/A`, `#NAME?`, `#REF!`, `#ERR`. */
  readonly code: string;
  /** Plain English, for the editor's inline explanation. */
  readonly why: string;
}

export type Value = Scalar | FormulaFault;

export const fault = (code: string, why: string): FormulaFault => ({
  fault: true,
  code,
  why,
});

export const isFault = (v: unknown): v is FormulaFault =>
  typeof v === "object" && v !== null && (v as FormulaFault).fault === true;

export const DIV0 = (why = "Division by zero.") => fault("#DIV/0!", why);
export const VALUE = (why: string) => fault("#VALUE!", why);
export const NA = (why = "No match.") => fault("#N/A", why);
export const NAME = (why: string) => fault("#NAME?", why);
export const REF = (why: string) => fault("#REF!", why);

/* ── Coercion ───────────────────────────────────────────── */

/** Blank, and text that isn't a number, read as 0 — the spreadsheet habit. */
export function num(v: Value): number | FormulaFault {
  if (isFault(v)) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : VALUE("Not a number.");
  if (typeof v === "boolean") return v ? 1 : 0;
  const cleaned = String(v).replace(/[€$£,\s]/g, "").replace(/%$/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return VALUE(`"${v}" isn't a number.`);
  return /%$/.test(String(v).trim()) ? n / 100 : n;
}

export function str(v: Value): string | FormulaFault {
  if (isFault(v)) return v;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export function bool(v: Value): boolean | FormulaFault {
  if (isFault(v)) return v;
  if (typeof v === "boolean") return v;
  if (v === null || v === "") return false;
  if (typeof v === "number") return v !== 0;
  const t = String(v).trim().toLowerCase();
  if (t === "true" || t === "yes") return true;
  if (t === "false" || t === "no" || t === "") return false;
  return t !== "0";
}

/** Compare two values the way a spreadsheet does: numbers as numbers, text
 *  case-insensitively, and a number always below any text. */
export function compare(a: Value, b: Value): number | FormulaFault {
  if (isFault(a)) return a;
  if (isFault(b)) return b;
  const an = typeof a === "number" || (typeof a === "string" && a !== "" && Number.isFinite(Number(a)));
  const bn = typeof b === "number" || (typeof b === "string" && b !== "" && Number.isFinite(Number(b)));
  if (an && bn) return Number(a) - Number(b);
  if (typeof a === "boolean" || typeof b === "boolean")
    return (bool(a) ? 1 : 0) - (bool(b) ? 1 : 0);
  const as = String(a ?? "").toLowerCase();
  const bs = String(b ?? "").toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** How a value lands in a cell. Faults render as their code. */
export function display(v: Value): string | number {
  if (isFault(v)) return v.code;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number")
    return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : "#NUM!";
  return v;
}
