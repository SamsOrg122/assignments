/**
 * The function library.
 *
 * Chosen by what people actually reach for, not by what is easy: conditionals,
 * conditional aggregates, dates, text and the statistics a report needs. Each
 * one takes lazy arguments, so `IF` doesn't evaluate the branch it didn't take
 * and `IFERROR` can catch a fault instead of the whole cell collapsing.
 *
 * Dates are ISO strings — `2026-08-11` — because that is what the date column
 * already stores, it sorts correctly as text, and it survives a round trip
 * through JSON without a timezone quietly moving it a day.
 */

import {
  DIV0,
  NA,
  VALUE,
  bool,
  compare,
  display,
  fault,
  isFault,
  num,
  str,
  type FormulaFault,
  type Value,
} from "./values";

import { MORE } from "./more";

/** One argument, unevaluated until asked. */
export interface Arg {
  /** As a single value. A one-cell range narrows; a wider one is a fault. */
  value(): Value;
  /** Flattened, for anything that folds. A scalar is a range of one. */
  range(): Value[];
}

export type Fn = (args: Arg[], name: string) => Value;

/* ── Helpers ────────────────────────────────────────────── */

/** Numbers only, skipping blanks and text — what SUM and AVERAGE fold over. */
function numbers(values: Value[]): number[] | FormulaFault {
  const out: number[] = [];
  for (const v of values) {
    if (isFault(v)) return v;
    if (v === null || v === "") continue;
    if (typeof v === "boolean") continue;
    const n = num(v);
    if (isFault(n)) continue; // Text in a column of numbers is skipped, not fatal.
    out.push(n);
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

function variance(xs: number[], population: boolean): number | FormulaFault {
  const n = xs.length;
  if (n < (population ? 1 : 2))
    return DIV0(population ? "No numbers." : "Needs at least two numbers.");
  const m = mean(xs);
  const ss = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return ss / (population ? n : n - 1);
}

/** ISO date → Date, in UTC so no timezone can shift the day. */
function date(v: Value): Date | FormulaFault {
  if (isFault(v)) return v;
  if (typeof v === "number") {
    // Excel serial: day 1 is 1900-01-01, and it believes 1900 was a leap year.
    const ms = (v - 25569) * 86_400_000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? VALUE("Not a date.") : d;
  }
  const text = String(v ?? "").trim();
  if (!text) return VALUE("Not a date.");
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso)
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  // `11/08/2026` is ambiguous the world over, so only the unambiguous forms
  // are accepted. Guessing wrong by a month is worse than refusing.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) return VALUE(`"${text}" could be day-first or month-first — use 2026-08-11.`);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? VALUE(`"${text}" isn't a date.`) : new Date(parsed);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A SUMIF-style criterion: `">5"`, `"<>done"`, `"apple"`, `">=2026-01-01"`. */
function criterion(raw: Value): (v: Value) => boolean {
  if (isFault(raw)) return () => false;
  const text = typeof raw === "string" ? raw.trim() : null;
  const m = text ? /^(<=|>=|<>|=|<|>)\s*(.*)$/.exec(text) : null;
  const op = m ? m[1] : "=";
  const target: Value = m ? (m[2] === "" ? null : m[2]) : raw;

  return (v) => {
    if (isFault(v)) return false;
    if (op === "=" || op === "<>") {
      // Wildcards, as everyone expects from COUNTIF("a*").
      const t = typeof target === "string" ? target : String(target ?? "");
      if (typeof target === "string" && /[*?]/.test(t)) {
        const rx = new RegExp(
          "^" + t.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
          "i",
        );
        const hit = rx.test(String(v ?? ""));
        return op === "=" ? hit : !hit;
      }
      const c = compare(v, target);
      const equal = !isFault(c) && c === 0;
      return op === "=" ? equal : !equal;
    }
    const c = compare(v, target);
    if (isFault(c)) return false;
    return op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
  };
}

/** Rows that pass every (range, criterion) pair — the …IFS machinery. */
function matching(args: Arg[], from: number): number[] | FormulaFault {
  const pairs: Array<{ values: Value[]; test: (v: Value) => boolean }> = [];
  for (let i = from; i + 1 < args.length + 1 && i + 1 <= args.length; i += 2) {
    if (i + 1 >= args.length + 0 && i + 1 > args.length - 1) break;
    const values = args[i].range();
    const test = criterion(args[i + 1].value());
    pairs.push({ values, test });
  }
  if (!pairs.length) return VALUE("Expected a range and a condition.");
  const length = Math.max(...pairs.map((p) => p.values.length));
  const hits: number[] = [];
  for (let r = 0; r < length; r++)
    if (pairs.every((p) => p.test(p.values[r] ?? null))) hits.push(r);
  return hits;
}

const arity = (name: string, got: number, want: string) =>
  VALUE(`${name} takes ${want}, not ${got}.`);

/* ── The library ────────────────────────────────────────── */

export const FUNCTIONS: Record<string, Fn> = {
  /* Maths */
  ABS: (a) => unary(a, Math.abs, "ABS"),
  SQRT: (a) =>
    unary(a, (x) => (x < 0 ? VALUE("SQRT of a negative.") : Math.sqrt(x)), "SQRT"),
  EXP: (a) => unary(a, Math.exp, "EXP"),
  LN: (a) => unary(a, (x) => (x <= 0 ? VALUE("LN needs a positive number.") : Math.log(x)), "LN"),
  LOG10: (a) => unary(a, Math.log10, "LOG10"),
  LOG: (a) => {
    const x = num(a[0]?.value() ?? null);
    const base = a.length > 1 ? num(a[1].value()) : 10;
    if (isFault(x)) return x;
    if (isFault(base)) return base;
    if (x <= 0 || base <= 0 || base === 1) return VALUE("LOG needs positive numbers.");
    return Math.log(x) / Math.log(base);
  },
  SIGN: (a) => unary(a, Math.sign, "SIGN"),
  INT: (a) => unary(a, Math.floor, "INT"),
  TRUNC: (a) => unary(a, Math.trunc, "TRUNC"),
  FLOOR: (a) => unary(a, Math.floor, "FLOOR"),
  CEILING: (a) => unary(a, Math.ceil, "CEILING"),
  CEIL: (a) => unary(a, Math.ceil, "CEIL"),
  ROUND: (a) => rounded(a, "half"),
  ROUNDUP: (a) => rounded(a, "up"),
  ROUNDDOWN: (a) => rounded(a, "down"),
  POWER: (a) => binary(a, (x, y) => x ** y, "POWER"),
  POW: (a) => binary(a, (x, y) => x ** y, "POW"),
  MOD: (a) =>
    binary(a, (x, y) => (y === 0 ? DIV0("MOD by zero.") : x - y * Math.floor(x / y)), "MOD"),

  /* Aggregates */
  SUM: (a) => fold(a, sum),
  PRODUCT: (a) => fold(a, (xs) => xs.reduce((x, y) => x * y, 1)),
  AVERAGE: (a) => fold(a, (xs) => (xs.length ? mean(xs) : DIV0("Nothing to average."))),
  AVG: (a) => fold(a, (xs) => (xs.length ? mean(xs) : DIV0("Nothing to average."))),
  MEDIAN: (a) =>
    fold(a, (xs) => {
      if (!xs.length) return DIV0("Nothing to take a median of.");
      const s = [...xs].sort((x, y) => x - y);
      const mid = s.length >> 1;
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }),
  MIN: (a) => fold(a, (xs) => (xs.length ? Math.min(...xs) : 0)),
  MAX: (a) => fold(a, (xs) => (xs.length ? Math.max(...xs) : 0)),
  COUNT: (a) => fold(a, (xs) => xs.length),
  COUNTA: (a) =>
    a.flatMap((x) => x.range()).filter((v) => !isFault(v) && v !== null && v !== "").length,
  COUNTBLANK: (a) =>
    a.flatMap((x) => x.range()).filter((v) => v === null || v === "").length,
  STDEV: (a) => fold(a, (xs) => wrap(variance(xs, false), Math.sqrt)),
  STDEVP: (a) => fold(a, (xs) => wrap(variance(xs, true), Math.sqrt)),
  VAR: (a) => fold(a, (xs) => variance(xs, false)),
  VARP: (a) => fold(a, (xs) => variance(xs, true)),
  LARGE: (a) => nth(a, "LARGE"),
  SMALL: (a) => nth(a, "SMALL"),
  PERCENTILE: (a) => {
    const xs = numbers(a[0]?.range() ?? []);
    if (isFault(xs)) return xs;
    const p = num(a[1]?.value() ?? null);
    if (isFault(p)) return p;
    if (!xs.length) return DIV0("Nothing to take a percentile of.");
    if (p < 0 || p > 1) return VALUE("PERCENTILE wants a fraction between 0 and 1.");
    const s = [...xs].sort((x, y) => x - y);
    const at = p * (s.length - 1);
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (at - lo);
  },

  /* Logic */
  IF: (a) => {
    if (a.length < 2) return arity("IF", a.length, "a test and at least one answer");
    const test = bool(a[0].value());
    if (isFault(test)) return test;
    if (test) return a[1].value();
    return a.length > 2 ? a[2].value() : false;
  },
  IFS: (a) => {
    for (let i = 0; i + 1 < a.length; i += 2) {
      const test = bool(a[i].value());
      if (isFault(test)) return test;
      if (test) return a[i + 1].value();
    }
    return NA("No condition in IFS was true.");
  },
  IFERROR: (a) => {
    const v = a[0]?.value() ?? null;
    return isFault(v) ? (a[1]?.value() ?? null) : v;
  },
  IFNA: (a) => {
    const v = a[0]?.value() ?? null;
    return isFault(v) && v.code === "#N/A" ? (a[1]?.value() ?? null) : v;
  },
  AND: (a) => every(a, true),
  OR: (a) => every(a, false),
  XOR: (a) => {
    let odd = false;
    for (const v of a.flatMap((x) => x.range())) {
      const b = bool(v);
      if (isFault(b)) return b;
      if (b) odd = !odd;
    }
    return odd;
  },
  NOT: (a) => {
    const b = bool(a[0]?.value() ?? null);
    return isFault(b) ? b : !b;
  },

  /* Conditional aggregates */
  SUMIF: (a) => conditional(a, "sum"),
  COUNTIF: (a) => conditional(a, "count"),
  AVERAGEIF: (a) => conditional(a, "average"),
  SUMIFS: (a) => conditionals(a, "sum"),
  COUNTIFS: (a) => {
    const hits = matching(a, 0);
    return isFault(hits) ? hits : hits.length;
  },
  AVERAGEIFS: (a) => conditionals(a, "average"),
  MAXIFS: (a) => conditionals(a, "max"),
  MINIFS: (a) => conditionals(a, "min"),

  /* Lookup */
  VLOOKUP: (a) => {
    if (a.length < 3) return arity("VLOOKUP", a.length, "a value, a range and a column number");
    const key = a[0].value();
    const table = a[1].range();
    const width = a[1] as Arg & { width?: number };
    const cols = width.width ?? 1;
    const index = num(a[2].value());
    if (isFault(index)) return index;
    if (index < 1 || index > cols)
      return VALUE(`VLOOKUP wants a column between 1 and ${cols}.`);
    for (let r = 0; r * cols < table.length; r++) {
      const c = compare(table[r * cols], key);
      if (!isFault(c) && c === 0) return table[r * cols + (index - 1)] ?? null;
    }
    return NA(`${display(key)} isn't in the first column.`);
  },
  MATCH: (a) => {
    const key = a[0]?.value() ?? null;
    const values = a[1]?.range() ?? [];
    for (let i = 0; i < values.length; i++) {
      const c = compare(values[i], key);
      if (!isFault(c) && c === 0) return i + 1;
    }
    return NA(`${display(key)} isn't in that range.`);
  },
  INDEX: (a) => {
    const values = a[0]?.range() ?? [];
    const at = num(a[1]?.value() ?? null);
    if (isFault(at)) return at;
    const i = Math.trunc(at) - 1;
    if (i < 0 || i >= values.length) return VALUE("INDEX is outside the range.");
    return values[i];
  },
  LOOKUP: (a) => {
    // Three arguments here, unlike Excel's two-range form: value, where to
    // look, what to bring back. It is the shape people actually mean.
    if (a.length < 3) return arity("LOOKUP", a.length, "a value, a key range and a result range");
    const key = a[0].value();
    const keys = a[1].range();
    const results = a[2].range();
    for (let i = 0; i < keys.length; i++) {
      const c = compare(keys[i], key);
      if (!isFault(c) && c === 0) return results[i] ?? null;
    }
    return NA(`${display(key)} isn't in that range.`);
  },
  CHOOSE: (a) => {
    const at = num(a[0]?.value() ?? null);
    if (isFault(at)) return at;
    const i = Math.trunc(at);
    if (i < 1 || i >= a.length) return VALUE("CHOOSE is outside its options.");
    return a[i].value();
  },

  /* Text */
  CONCAT: (a) => join(a, ""),
  CONCATENATE: (a) => join(a, ""),
  TEXTJOIN: (a) => {
    const sep = str(a[0]?.value() ?? "");
    if (isFault(sep)) return sep;
    const skip = a.length > 1 ? bool(a[1].value()) : true;
    if (isFault(skip)) return skip;
    const parts: string[] = [];
    for (const v of a.slice(2).flatMap((x) => x.range())) {
      if (isFault(v)) return v;
      if (skip && (v === null || v === "")) continue;
      const s = str(v);
      if (isFault(s)) return s;
      parts.push(s);
    }
    return parts.join(sep);
  },
  LEN: (a) => text(a, (s) => s.length),
  LOWER: (a) => text(a, (s) => s.toLowerCase()),
  UPPER: (a) => text(a, (s) => s.toUpperCase()),
  TRIM: (a) => text(a, (s) => s.trim().replace(/\s+/g, " ")),
  PROPER: (a) =>
    text(a, (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/(\p{L})(\p{L}*)/gu, (_, h, t) => h + t.toLowerCase())),
  LEFT: (a) => slice(a, "left"),
  RIGHT: (a) => slice(a, "right"),
  MID: (a) => {
    const s = str(a[0]?.value() ?? "");
    const from = num(a[1]?.value() ?? null);
    const count = num(a[2]?.value() ?? null);
    if (isFault(s)) return s;
    if (isFault(from)) return from;
    if (isFault(count)) return count;
    if (from < 1) return VALUE("MID counts from 1.");
    return s.slice(from - 1, from - 1 + Math.max(0, count));
  },
  FIND: (a) => find(a, true),
  SEARCH: (a) => find(a, false),
  SUBSTITUTE: (a) => {
    const s = str(a[0]?.value() ?? "");
    const from = str(a[1]?.value() ?? "");
    const to = str(a[2]?.value() ?? "");
    if (isFault(s)) return s;
    if (isFault(from)) return from;
    if (isFault(to)) return to;
    return from === "" ? s : s.split(from).join(to);
  },
  REPLACE: (a) => {
    const s = str(a[0]?.value() ?? "");
    const at = num(a[1]?.value() ?? null);
    const count = num(a[2]?.value() ?? null);
    const to = str(a[3]?.value() ?? "");
    if (isFault(s)) return s;
    if (isFault(at)) return at;
    if (isFault(count)) return count;
    if (isFault(to)) return to;
    if (at < 1) return VALUE("REPLACE counts from 1.");
    return s.slice(0, at - 1) + to + s.slice(at - 1 + Math.max(0, count));
  },
  REPT: (a) => {
    const s = str(a[0]?.value() ?? "");
    const times = num(a[1]?.value() ?? null);
    if (isFault(s)) return s;
    if (isFault(times)) return times;
    const n = Math.max(0, Math.trunc(times));
    if (n * s.length > 10_000) return VALUE("REPT would make a very long string.");
    return s.repeat(n);
  },
  VALUE: (a) => num(a[0]?.value() ?? null),
  TEXT: (a) => {
    const v = num(a[0]?.value() ?? null);
    const pattern = str(a[1]?.value() ?? "");
    if (isFault(v)) return v;
    if (isFault(pattern)) return pattern;
    // Enough of Excel's pattern language to be useful and none of the parts
    // that would need a full formatter: decimals, thousands, percent.
    const percent = pattern.includes("%");
    const scaled = percent ? v * 100 : v;
    const decimals = /\.(0+)/.exec(pattern)?.[1].length ?? 0;
    const grouped = /[#0],[#0]/.test(pattern);
    const body = scaled.toLocaleString(grouped ? "en-US" : "en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    });
    return percent ? `${body}%` : body;
  },

  /* Dates */
  TODAY: () => iso(new Date()),
  NOW: () => new Date().toISOString().slice(0, 16).replace("T", " "),
  DATE: (a) => {
    const y = num(a[0]?.value() ?? null);
    const m = num(a[1]?.value() ?? null);
    const d = num(a[2]?.value() ?? null);
    if (isFault(y)) return y;
    if (isFault(m)) return m;
    if (isFault(d)) return d;
    return iso(new Date(Date.UTC(y, m - 1, d)));
  },
  DATEVALUE: (a) => wrapDate(a, (d) => iso(d)),
  YEAR: (a) => wrapDate(a, (d) => d.getUTCFullYear()),
  MONTH: (a) => wrapDate(a, (d) => d.getUTCMonth() + 1),
  DAY: (a) => wrapDate(a, (d) => d.getUTCDate()),
  WEEKDAY: (a) => wrapDate(a, (d) => d.getUTCDay() + 1),
  WEEKNUM: (a) =>
    wrapDate(a, (d) => {
      const start = Date.UTC(d.getUTCFullYear(), 0, 1);
      return Math.floor((d.getTime() - start) / 604_800_000) + 1;
    }),
  DAYS: (a) => {
    const later = date(a[0]?.value() ?? null);
    const earlier = date(a[1]?.value() ?? null);
    if (isFault(later)) return later;
    if (isFault(earlier)) return earlier;
    return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
  },
  EDATE: (a) => {
    const d = date(a[0]?.value() ?? null);
    const months = num(a[1]?.value() ?? null);
    if (isFault(d)) return d;
    if (isFault(months)) return months;
    const out = new Date(d.getTime());
    const day = out.getUTCDate();
    out.setUTCDate(1);
    out.setUTCMonth(out.getUTCMonth() + Math.trunc(months));
    const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
    out.setUTCDate(Math.min(day, last));
    return iso(out);
  },
  EOMONTH: (a) => {
    const d = date(a[0]?.value() ?? null);
    const months = a.length > 1 ? num(a[1].value()) : 0;
    if (isFault(d)) return d;
    if (isFault(months)) return months;
    return iso(
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.trunc(months) + 1, 0)),
    );
  },
  DATEDIF: (a) => {
    const from = date(a[0]?.value() ?? null);
    const to = date(a[1]?.value() ?? null);
    const unit = str(a[2]?.value() ?? "D");
    if (isFault(from)) return from;
    if (isFault(to)) return to;
    if (isFault(unit)) return unit;
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    switch (unit.toUpperCase()) {
      case "D":
        return days;
      case "M":
        return (
          (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
          (to.getUTCMonth() - from.getUTCMonth()) -
          (to.getUTCDate() < from.getUTCDate() ? 1 : 0)
        );
      case "Y": {
        const months =
          (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
          (to.getUTCMonth() - from.getUTCMonth()) -
          (to.getUTCDate() < from.getUTCDate() ? 1 : 0);
        return Math.trunc(months / 12);
      }
      default:
        return VALUE('DATEDIF takes "D", "M" or "Y".');
    }
  },

  /* What is in this cell */
  ISBLANK: (a) => {
    const v = a[0]?.value() ?? null;
    return v === null || v === "";
  },
  ISNUMBER: (a) => {
    const v = a[0]?.value() ?? null;
    return typeof v === "number" || (typeof v === "string" && v !== "" && Number.isFinite(Number(v)));
  },
  ISTEXT: (a) => {
    const v = a[0]?.value() ?? null;
    return typeof v === "string" && !Number.isFinite(Number(v));
  },
  ISERROR: (a) => isFault(a[0]?.value() ?? null),
  N: (a) => num(a[0]?.value() ?? null),

  // Money, statistics, lookups, working days — everything somebody arriving
  // from Excel goes looking for. Kept in `more.ts` so the machinery above
  // stays readable; merged here so there is still exactly one library.
  ...MORE,
};

/* ── The shapes the entries above share ─────────────────── */

function unary(a: Arg[], f: (x: number) => number | Value, name: string): Value {
  if (!a.length) return arity(name, 0, "one number");
  const x = num(a[0].value());
  return isFault(x) ? x : f(x);
}

function binary(a: Arg[], f: (x: number, y: number) => number | Value, name: string): Value {
  if (a.length < 2) return arity(name, a.length, "two numbers");
  const x = num(a[0].value());
  if (isFault(x)) return x;
  const y = num(a[1].value());
  if (isFault(y)) return y;
  return f(x, y);
}

function rounded(a: Arg[], how: "half" | "up" | "down"): Value {
  const x = num(a[0]?.value() ?? null);
  const places = a.length > 1 ? num(a[1].value()) : 0;
  if (isFault(x)) return x;
  if (isFault(places)) return places;
  const f = 10 ** Math.trunc(places);
  const scaled = x * f;
  const r =
    how === "half"
      ? Math.sign(scaled) * Math.round(Math.abs(scaled))
      : how === "up"
        ? Math.sign(scaled) * Math.ceil(Math.abs(scaled))
        : Math.sign(scaled) * Math.floor(Math.abs(scaled));
  return r / f;
}

function fold(a: Arg[], f: (xs: number[]) => number | Value): Value {
  const values = a.flatMap((x) => x.range());
  const xs = numbers(values);
  return isFault(xs) ? xs : f(xs);
}

const wrap = (v: number | FormulaFault, f: (x: number) => number): Value =>
  isFault(v) ? v : f(v);

function nth(a: Arg[], which: "LARGE" | "SMALL"): Value {
  const xs = numbers(a[0]?.range() ?? []);
  if (isFault(xs)) return xs;
  const k = num(a[1]?.value() ?? null);
  if (isFault(k)) return k;
  const i = Math.trunc(k);
  if (i < 1 || i > xs.length) return VALUE(`${which} is outside the range.`);
  const sorted = [...xs].sort((x, y) => (which === "LARGE" ? y - x : x - y));
  return sorted[i - 1];
}

function every(a: Arg[], all: boolean): Value {
  const values = a.flatMap((x) => x.range()).filter((v) => v !== null && v !== "");
  if (!values.length) return VALUE("Nothing to test.");
  for (const v of values) {
    const b = bool(v);
    if (isFault(b)) return b;
    if (all && !b) return false;
    if (!all && b) return true;
  }
  return all;
}

function conditional(a: Arg[], how: "sum" | "count" | "average"): Value {
  if (a.length < 2)
    return arity(how.toUpperCase() + "IF", a.length, "a range and a condition");
  const tested = a[0].range();
  const test = criterion(a[1].value());
  // SUMIF's third argument is the range that is actually added up.
  const summed = a.length > 2 ? a[2].range() : tested;
  const picked: Value[] = [];
  for (let i = 0; i < tested.length; i++)
    if (test(tested[i] ?? null)) picked.push(summed[i] ?? null);
  if (how === "count") return picked.length;
  const xs = numbers(picked);
  if (isFault(xs)) return xs;
  if (how === "sum") return sum(xs);
  return xs.length ? mean(xs) : DIV0("Nothing matched.");
}

function conditionals(a: Arg[], how: "sum" | "average" | "max" | "min"): Value {
  const target = a[0]?.range() ?? [];
  const hits = matching(a, 1);
  if (isFault(hits)) return hits;
  const xs = numbers(hits.map((r) => target[r] ?? null));
  if (isFault(xs)) return xs;
  if (how === "sum") return sum(xs);
  if (!xs.length) return how === "average" ? DIV0("Nothing matched.") : 0;
  if (how === "average") return mean(xs);
  return how === "max" ? Math.max(...xs) : Math.min(...xs);
}

function join(a: Arg[], sep: string): Value {
  const parts: string[] = [];
  for (const v of a.flatMap((x) => x.range())) {
    const s = str(v);
    if (isFault(s)) return s;
    parts.push(s);
  }
  return parts.join(sep);
}

function text(a: Arg[], f: (s: string) => string | number): Value {
  const s = str(a[0]?.value() ?? "");
  return isFault(s) ? s : f(s);
}

function slice(a: Arg[], side: "left" | "right"): Value {
  const s = str(a[0]?.value() ?? "");
  const count = a.length > 1 ? num(a[1].value()) : 1;
  if (isFault(s)) return s;
  if (isFault(count)) return count;
  const n = Math.max(0, Math.trunc(count));
  return side === "left" ? s.slice(0, n) : n === 0 ? "" : s.slice(-n);
}

function find(a: Arg[], caseSensitive: boolean): Value {
  const needle = str(a[0]?.value() ?? "");
  const hay = str(a[1]?.value() ?? "");
  const from = a.length > 2 ? num(a[2].value()) : 1;
  if (isFault(needle)) return needle;
  if (isFault(hay)) return hay;
  if (isFault(from)) return from;
  const at = caseSensitive
    ? hay.indexOf(needle, Math.max(0, from - 1))
    : hay.toLowerCase().indexOf(needle.toLowerCase(), Math.max(0, from - 1));
  return at === -1 ? NA(`"${needle}" isn't in there.`) : at + 1;
}

function wrapDate(a: Arg[], f: (d: Date) => number | string): Value {
  const d = date(a[0]?.value() ?? null);
  return isFault(d) ? d : f(d);
}

/** For the editor: is this a function anyone can call? */
export const knownFunction = (name: string) => name.toUpperCase() in FUNCTIONS;

/** Every name, for the formula editor's list. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();

export { criterion, date as parseDate, iso as isoDate };
export { fault, isFault };
