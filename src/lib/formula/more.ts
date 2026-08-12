/**
 * The rest of the library — the part somebody arriving from Excel goes
 * looking for on their first afternoon.
 *
 * Split from `functions.ts` because that file holds the machinery (lazy
 * arguments, criteria, the …IFS matcher) and this one holds arithmetic. Nobody
 * reading "how does SUMIF decide what matches" wants to scroll past sixty
 * financial functions to get there.
 *
 * Three deliberate absences, each for the same reason — they would work only
 * by lying about what a cell is:
 *
 *   - **Volatile functions** (`RAND`, `RANDBETWEEN`). A cell that changes on
 *     every render is a cell that can never be compared with what it said a
 *     second ago, and every undo, every sync and every export would disagree
 *     with the screen.
 *   - **Spilling arrays** (`UNIQUE`, `SORT`, `FILTER`, `TRANSPOSE`). They
 *     write into cells the author never selected. That needs a spill model —
 *     what happens when something is already there — and inventing half of one
 *     is worse than not having it.
 *   - **`INDIRECT` and `OFFSET`**. They build a reference out of text at
 *     evaluation time, which means the dependency graph can't be known before
 *     running it. The cycle guard here is honest precisely because it can.
 *
 * They are named in the function browser as *not present*, rather than left
 * for somebody to discover by typing one at eleven at night.
 */

import type { Arg, Fn } from "./functions";
import {
  DIV0,
  NA,
  VALUE,
  compare,
  isFault,
  num,
  str,
  type FormulaFault,
  type Value,
} from "./values";

/* ── Local helpers ──────────────────────────────────────── */

/** Numbers in a range, skipping blanks and text — the same rule as SUM. */
function nums(values: Value[]): number[] | FormulaFault {
  const out: number[] = [];
  for (const v of values) {
    if (isFault(v)) return v;
    if (v === null || v === "" || typeof v === "boolean") continue;
    const n = num(v);
    if (isFault(n)) continue;
    out.push(n);
  }
  return out;
}

const N = (a: Arg | undefined, fallback?: number): number | FormulaFault => {
  if (!a) return fallback === undefined ? VALUE("A number is missing.") : fallback;
  return num(a.value());
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

/** Two ranges, paired and trimmed to the shorter — what CORREL needs. */
function pairs(a: Arg[], i = 0): { x: number[]; y: number[] } | FormulaFault {
  const xs = nums(a[i]?.range() ?? []);
  if (isFault(xs)) return xs;
  const ys = nums(a[i + 1]?.range() ?? []);
  if (isFault(ys)) return ys;
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return DIV0("Needs at least two pairs of numbers.");
  return { x: xs.slice(0, n), y: ys.slice(0, n) };
}

/* ── Money ──────────────────────────────────────────────── */

/**
 * The annuity identity every one of these is a rearrangement of.
 *
 * `type` is 0 for payments at the end of a period and 1 for the beginning,
 * exactly as Excel means it — a lease paid on the first of the month is a
 * different number from one paid on the last, and it is not a rounding error.
 */
const pmtOf = (rate: number, nper: number, pv: number, fv: number, type: number) => {
  if (rate === 0) return -(pv + fv) / nper;
  const f = (1 + rate) ** nper;
  return (-(pv * f + fv) * rate) / ((1 + rate * type) * (f - 1));
};

const fvOf = (rate: number, nper: number, pmt: number, pv: number, type: number) => {
  if (rate === 0) return -(pv + pmt * nper);
  const f = (1 + rate) ** nper;
  return -(pv * f + pmt * (1 + rate * type) * ((f - 1) / rate));
};

/** Bisection rather than Newton: slower, and it cannot run off to infinity. */
function solve(f: (x: number) => number, lo: number, hi: number): number | FormulaFault {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0)
    return NA("No rate fits these numbers.");
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (!Number.isFinite(fm)) return NA("No rate fits these numbers.");
    if (Math.abs(fm) < 1e-10 || (b - a) / 2 < 1e-12) return mid;
    if (fa * fm < 0) {
      b = mid;
      fb = fm;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

const MONEY: Record<string, Fn> = {
  PMT: (a) => {
    const rate = N(a[0]), nper = N(a[1]), pv = N(a[2]);
    const fv = N(a[3], 0), type = N(a[4], 0);
    for (const v of [rate, nper, pv, fv, type]) if (isFault(v)) return v;
    if ((nper as number) === 0) return DIV0("No periods to pay over.");
    return pmtOf(rate as number, nper as number, pv as number, fv as number, type as number);
  },
  FV: (a) => {
    const rate = N(a[0]), nper = N(a[1]), pmt = N(a[2]);
    const pv = N(a[3], 0), type = N(a[4], 0);
    for (const v of [rate, nper, pmt, pv, type]) if (isFault(v)) return v;
    return fvOf(rate as number, nper as number, pmt as number, pv as number, type as number);
  },
  PV: (a) => {
    const rate = N(a[0]), nper = N(a[1]), pmt = N(a[2]);
    const fv = N(a[3], 0), type = N(a[4], 0);
    for (const v of [rate, nper, pmt, fv, type]) if (isFault(v)) return v;
    const r = rate as number, n = nper as number, p = pmt as number;
    if (r === 0) return -((fv as number) + p * n);
    const f = (1 + r) ** n;
    return -((fv as number) + p * (1 + r * (type as number)) * ((f - 1) / r)) / f;
  },
  NPER: (a) => {
    const rate = N(a[0]), pmt = N(a[1]), pv = N(a[2]);
    const fv = N(a[3], 0), type = N(a[4], 0);
    for (const v of [rate, pmt, pv, fv, type]) if (isFault(v)) return v;
    const r = rate as number, p = pmt as number;
    if (r === 0)
      return p === 0 ? DIV0("Nothing is being paid.") : -((pv as number) + (fv as number)) / p;
    const adj = p * (1 + r * (type as number));
    const top = (adj - (fv as number) * r) / ((pv as number) * r + adj);
    if (top <= 0) return NA("These numbers never pay it off.");
    return Math.log(top) / Math.log(1 + r);
  },
  RATE: (a) => {
    const nper = N(a[0]), pmt = N(a[1]), pv = N(a[2]);
    const fv = N(a[3], 0), type = N(a[4], 0);
    for (const v of [nper, pmt, pv, fv, type]) if (isFault(v)) return v;
    return solve(
      (r) =>
        fvOf(r, nper as number, pmt as number, pv as number, type as number) -
        (fv as number),
      -0.9999,
      10,
    );
  },
  NPV: (a) => {
    const rate = N(a[0]);
    if (isFault(rate)) return rate;
    const flows = nums(a.slice(1).flatMap((x) => x.range()));
    if (isFault(flows)) return flows;
    // Period 1 is the first flow, as Excel has it: a cost paid today belongs
    // outside NPV, added on afterwards. Getting this wrong discounts an
    // investment by one period and quietly flatters every project.
    return flows.reduce((acc, c, i) => acc + c / (1 + (rate as number)) ** (i + 1), 0);
  },
  IRR: (a) => {
    const flows = nums(a[0]?.range() ?? []);
    if (isFault(flows)) return flows;
    if (flows.length < 2) return VALUE("IRR needs at least two cash flows.");
    if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0))
      return NA("IRR needs at least one payment and one receipt.");
    return solve(
      (r) => flows.reduce((acc, c, i) => acc + c / (1 + r) ** i, 0),
      -0.9999,
      10,
    );
  },
  SLN: (a) => {
    const cost = N(a[0]), salvage = N(a[1]), life = N(a[2]);
    for (const v of [cost, salvage, life]) if (isFault(v)) return v;
    if ((life as number) === 0) return DIV0("A life of zero years.");
    return ((cost as number) - (salvage as number)) / (life as number);
  },
  SYD: (a) => {
    const cost = N(a[0]), salvage = N(a[1]), life = N(a[2]), per = N(a[3]);
    for (const v of [cost, salvage, life, per]) if (isFault(v)) return v;
    const l = life as number;
    if (l <= 0) return DIV0("A life of zero years.");
    return (
      (((cost as number) - (salvage as number)) * (l - (per as number) + 1) * 2) /
      (l * (l + 1))
    );
  },
  EFFECT: (a) => {
    const nominal = N(a[0]), periods = N(a[1]);
    for (const v of [nominal, periods]) if (isFault(v)) return v;
    const p = Math.trunc(periods as number);
    if (p < 1) return VALUE("EFFECT needs at least one period a year.");
    return (1 + (nominal as number) / p) ** p - 1;
  },
  NOMINAL: (a) => {
    const effect = N(a[0]), periods = N(a[1]);
    for (const v of [effect, periods]) if (isFault(v)) return v;
    const p = Math.trunc(periods as number);
    if (p < 1) return VALUE("NOMINAL needs at least one period a year.");
    return ((1 + (effect as number)) ** (1 / p) - 1) * p;
  },
};

/* ── Numbers ────────────────────────────────────────────── */

const MATHS: Record<string, Fn> = {
  PI: () => Math.PI,
  SUMPRODUCT: (a) => {
    if (!a.length) return VALUE("SUMPRODUCT needs at least one range.");
    const ranges = a.map((x) => x.range());
    const length = Math.max(...ranges.map((r) => r.length));
    let total = 0;
    for (let i = 0; i < length; i++) {
      let product = 1;
      for (const range of ranges) {
        const v = range[i] ?? null;
        if (isFault(v)) return v;
        const n = num(v === null || v === "" ? 0 : v);
        // Text counts as zero, exactly as Excel does it — a label in the
        // middle of a column must not turn the whole answer into an error.
        product *= isFault(n) ? 0 : n;
      }
      total += product;
    }
    return total;
  },
  SUMSQ: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    return isFault(xs) ? xs : xs.reduce((acc, x) => acc + x * x, 0);
  },
  QUOTIENT: (a) => {
    const x = N(a[0]), y = N(a[1]);
    for (const v of [x, y]) if (isFault(v)) return v;
    if ((y as number) === 0) return DIV0("Division by zero.");
    return Math.trunc((x as number) / (y as number));
  },
  MROUND: (a) => {
    const x = N(a[0]), m = N(a[1]);
    for (const v of [x, m]) if (isFault(v)) return v;
    if ((m as number) === 0) return 0;
    return Math.round((x as number) / (m as number)) * (m as number);
  },
  EVEN: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const up = Math.ceil(Math.abs(x as number) / 2) * 2;
    return (x as number) < 0 ? -up : up;
  },
  ODD: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const v = Math.abs(x as number);
    const up = Math.ceil((v + 1) / 2) * 2 - 1;
    return (x as number) < 0 ? -up : up;
  },
  FACT: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const n = Math.trunc(x as number);
    if (n < 0) return VALUE("FACT needs a number that isn't negative.");
    if (n > 170) return VALUE("That factorial is larger than a number can hold.");
    let out = 1;
    for (let i = 2; i <= n; i++) out *= i;
    return out;
  },
  COMBIN: (a) => {
    const n = N(a[0]), k = N(a[1]);
    for (const v of [n, k]) if (isFault(v)) return v;
    const nn = Math.trunc(n as number), kk = Math.trunc(k as number);
    if (kk < 0 || nn < 0 || kk > nn) return VALUE("COMBIN needs 0 ≤ k ≤ n.");
    let out = 1;
    for (let i = 1; i <= kk; i++) out = (out * (nn - kk + i)) / i;
    return Math.round(out);
  },
  PERMUT: (a) => {
    const n = N(a[0]), k = N(a[1]);
    for (const v of [n, k]) if (isFault(v)) return v;
    const nn = Math.trunc(n as number), kk = Math.trunc(k as number);
    if (kk < 0 || nn < 0 || kk > nn) return VALUE("PERMUT needs 0 ≤ k ≤ n.");
    let out = 1;
    for (let i = 0; i < kk; i++) out *= nn - i;
    return out;
  },
  GCD: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
    return xs.map((x) => Math.abs(Math.trunc(x))).reduce((x, y) => g(x, y), 0);
  },
  LCM: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
    return xs
      .map((x) => Math.abs(Math.trunc(x)))
      .reduce((x, y) => (x && y ? (x * y) / g(x, y) : 0), 1);
  },
  RADIANS: (a) => {
    const x = N(a[0]);
    return isFault(x) ? x : ((x as number) * Math.PI) / 180;
  },
  DEGREES: (a) => {
    const x = N(a[0]);
    return isFault(x) ? x : ((x as number) * 180) / Math.PI;
  },
  SIN: (a) => trig(a, Math.sin),
  COS: (a) => trig(a, Math.cos),
  TAN: (a) => trig(a, Math.tan),
  ASIN: (a) => trig(a, Math.asin),
  ACOS: (a) => trig(a, Math.acos),
  ATAN: (a) => trig(a, Math.atan),
  ATAN2: (a) => {
    // Excel takes x first, JavaScript takes y first. A silent swap here is a
    // sign error in somebody's geometry.
    const x = N(a[0]), y = N(a[1]);
    for (const v of [x, y]) if (isFault(v)) return v;
    return Math.atan2(y as number, x as number);
  },
};

function trig(a: Arg[], f: (x: number) => number): Value {
  const x = N(a[0]);
  if (isFault(x)) return x;
  const out = f(x as number);
  return Number.isFinite(out) ? out : VALUE("That angle has no answer.");
}

/* ── Statistics ─────────────────────────────────────────── */

const STATS: Record<string, Fn> = {
  MODE: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    const counts = new Map<number, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    let best: number | null = null;
    let seen = 1;
    for (const [value, count] of counts)
      if (count > seen) {
        seen = count;
        best = value;
      }
    return best === null ? NA("Nothing repeats.") : best;
  },
  GEOMEAN: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    if (!xs.length) return DIV0("Nothing to average.");
    if (xs.some((x) => x <= 0)) return VALUE("GEOMEAN needs positive numbers.");
    return Math.exp(mean(xs.map(Math.log)));
  },
  HARMEAN: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    if (!xs.length) return DIV0("Nothing to average.");
    if (xs.some((x) => x <= 0)) return VALUE("HARMEAN needs positive numbers.");
    return xs.length / sum(xs.map((x) => 1 / x));
  },
  DEVSQ: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    const m = mean(xs);
    return sum(xs.map((x) => (x - m) ** 2));
  },
  AVEDEV: (a) => {
    const xs = nums(a.flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    if (!xs.length) return DIV0("Nothing to average.");
    const m = mean(xs);
    return mean(xs.map((x) => Math.abs(x - m)));
  },
  QUARTILE: (a) => {
    const xs = nums(a[0]?.range() ?? []);
    if (isFault(xs)) return xs;
    const q = N(a[1]);
    if (isFault(q)) return q;
    const k = Math.trunc(q as number);
    if (k < 0 || k > 4) return VALUE("QUARTILE takes 0 to 4.");
    return percentile(xs, k / 4);
  },
  RANK: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const xs = nums(a[1]?.range() ?? []);
    if (isFault(xs)) return xs;
    const ascending = a.length > 2 ? num(a[2].value()) : 0;
    if (isFault(ascending)) return ascending;
    const sorted = [...xs].sort((p, q) => (ascending ? p - q : q - p));
    const at = sorted.findIndex((v) => v === x);
    return at === -1 ? NA("That number isn't in the range.") : at + 1;
  },
  PERCENTRANK: (a) => {
    const xs = nums(a[0]?.range() ?? []);
    if (isFault(xs)) return xs;
    const x = N(a[1]);
    if (isFault(x)) return x;
    if (!xs.length) return DIV0("Nothing to rank against.");
    const below = xs.filter((v) => v < (x as number)).length;
    const equal = xs.filter((v) => v === (x as number)).length;
    return (below + 0.5 * equal) / xs.length;
  },
  CORREL: (a) => {
    const p = pairs(a);
    if (isFault(p)) return p;
    return correlation(p.x, p.y);
  },
  RSQ: (a) => {
    const p = pairs(a);
    if (isFault(p)) return p;
    const r = correlation(p.x, p.y);
    return isFault(r) ? r : r * r;
  },
  COVAR: (a) => {
    const p = pairs(a);
    if (isFault(p)) return p;
    const mx = mean(p.x), my = mean(p.y);
    return sum(p.x.map((x, i) => (x - mx) * (p.y[i] - my))) / p.x.length;
  },
  SLOPE: (a) => {
    // Excel's argument order is (known_y, known_x), which is the opposite of
    // how the line is usually written. Kept as Excel has it, because a formula
    // pasted from a colleague's sheet has to give the same number.
    const p = pairs(a);
    if (isFault(p)) return p;
    return slopeOf(p.y, p.x);
  },
  INTERCEPT: (a) => {
    const p = pairs(a);
    if (isFault(p)) return p;
    const m = slopeOf(p.y, p.x);
    return isFault(m) ? m : mean(p.x) - m * mean(p.y);
  },
  FORECAST: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const p = pairs(a, 1);
    if (isFault(p)) return p;
    const m = slopeOf(p.y, p.x);
    if (isFault(m)) return m;
    const b = mean(p.x) - m * mean(p.y);
    return b + m * (x as number);
  },
  SUBTOTAL: (a) => {
    const which = N(a[0]);
    if (isFault(which)) return which;
    const xs = nums(a.slice(1).flatMap((x) => x.range()));
    if (isFault(xs)) return xs;
    // 1–11 and 101–111 differ only in whether hidden rows count, and nothing
    // here hides rows from a formula, so they are the same answer. Both are
    // accepted so a pasted formula keeps working.
    const code = Math.trunc(which as number) % 100;
    switch (code) {
      case 1: return xs.length ? mean(xs) : DIV0("Nothing to average.");
      case 2: return xs.length;
      case 3: return xs.length;
      case 4: return xs.length ? Math.max(...xs) : 0;
      case 5: return xs.length ? Math.min(...xs) : 0;
      case 6: return xs.reduce((p, q) => p * q, 1);
      case 9: return sum(xs);
      default: return VALUE(`SUBTOTAL doesn't know function ${code}.`);
    }
  },
};

function percentile(xs: number[], p: number): Value {
  if (!xs.length) return DIV0("Nothing to take a percentile of.");
  const sorted = [...xs].sort((a, b) => a - b);
  const at = p * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? sorted[lo] : sorted[lo] + (at - lo) * (sorted[hi] - sorted[lo]);
}

function correlation(x: number[], y: number[]): number | FormulaFault {
  const mx = mean(x), my = mean(y);
  const sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  const sxx = sum(x.map((v) => (v - mx) ** 2));
  const syy = sum(y.map((v) => (v - my) ** 2));
  if (sxx === 0 || syy === 0) return DIV0("One of the ranges never changes.");
  return sxy / Math.sqrt(sxx * syy);
}

function slopeOf(ys: number[], xs: number[]): number | FormulaFault {
  const mx = mean(xs), my = mean(ys);
  const sxx = sum(xs.map((v) => (v - mx) ** 2));
  if (sxx === 0) return DIV0("The x values never change.");
  return sum(xs.map((v, i) => (v - mx) * (ys[i] - my))) / sxx;
}

/* ── Looking things up ──────────────────────────────────── */

const LOOKUP: Record<string, Fn> = {
  HLOOKUP: (a) => {
    const needle = a[0]?.value() ?? null;
    if (isFault(needle)) return needle;
    const table = a[1]?.range() ?? [];
    const width = (a[1] as Arg & { width?: number })?.width ?? table.length;
    const rowIndex = N(a[2]);
    if (isFault(rowIndex)) return rowIndex;
    const exact = a.length > 3 ? !truthy(a[3]) : false;
    const r = Math.trunc(rowIndex as number);
    if (width < 1 || r < 1) return VALUE("HLOOKUP needs a row of 1 or more.");
    const rows = Math.ceil(table.length / width);
    if (r > rows) return VALUE("That row is outside the range.");
    for (let c = 0; c < width; c++) {
      const head = table[c] ?? null;
      const hit = exact
        ? sameValue(head, needle)
        : sameValue(head, needle) || false;
      if (hit) return table[(r - 1) * width + c] ?? null;
    }
    return NA("No match in the first row.");
  },
  XLOOKUP: (a) => {
    const needle = a[0]?.value() ?? null;
    if (isFault(needle)) return needle;
    const haystack = a[1]?.range() ?? [];
    const results = a[2]?.range() ?? [];
    const fallback = a.length > 3 ? a[3].value() : undefined;
    const at = haystack.findIndex((v) => sameValue(v, needle));
    if (at === -1)
      return fallback === undefined ? NA("XLOOKUP found no match.") : fallback;
    return results[at] ?? null;
  },
  XMATCH: (a) => {
    const needle = a[0]?.value() ?? null;
    if (isFault(needle)) return needle;
    const haystack = a[1]?.range() ?? [];
    const at = haystack.findIndex((v) => sameValue(v, needle));
    return at === -1 ? NA("XMATCH found no match.") : at + 1;
  },
  ROWS: (a) => {
    const range = a[0]?.range() ?? [];
    const width = (a[0] as Arg & { width?: number })?.width ?? 1;
    return width > 0 ? Math.ceil(range.length / width) : 0;
  },
  COLUMNS: (a) => (a[0] as Arg & { width?: number })?.width ?? 1,
};

const truthy = (a: Arg): boolean => {
  const v = a.value();
  if (isFault(v)) return false;
  return v === true || v === 1 || v === "TRUE" || v === "true";
};

const sameValue = (a: Value, b: Value): boolean => {
  const c = compare(a, b);
  return !isFault(c) && c === 0;
};

/* ── Text and time ──────────────────────────────────────── */

const TEXT_TIME: Record<string, Fn> = {
  EXACT: (a) => {
    const x = str(a[0]?.value() ?? "");
    const y = str(a[1]?.value() ?? "");
    if (isFault(x)) return x;
    if (isFault(y)) return y;
    return x === y;
  },
  CLEAN: (a) => {
    const s = str(a[0]?.value() ?? "");
    // The control characters, which is what CLEAN is for: text pasted out of
    // a terminal or a PDF arrives full of them and nothing else removes them.
    return isFault(s) ? s : s.replace(/\p{Cc}/gu, "");
  },
  CHAR: (a) => {
    const x = N(a[0]);
    if (isFault(x)) return x;
    const code = Math.trunc(x as number);
    if (code < 1 || code > 0x10ffff) return VALUE("That isn't a character number.");
    return String.fromCodePoint(code);
  },
  CODE: (a) => {
    const s = str(a[0]?.value() ?? "");
    if (isFault(s)) return s;
    return s.length ? (s.codePointAt(0) ?? 0) : VALUE("CODE needs some text.");
  },
  T: (a) => {
    const v = a[0]?.value() ?? null;
    if (isFault(v)) return v;
    return typeof v === "string" ? v : "";
  },
  TEXTBEFORE: (a) => cutAt(a, "before"),
  TEXTAFTER: (a) => cutAt(a, "after"),
  NUMBERVALUE: (a) => {
    const s = str(a[0]?.value() ?? "");
    if (isFault(s)) return s;
    const decimal = a.length > 1 ? str(a[1].value()) : ".";
    if (isFault(decimal)) return decimal;
    const cleaned = s
      .replace(/\s/g, "")
      .split(decimal === "," ? "," : ".")
      .map((part, i) => (i === 0 ? part.replace(/[^0-9+-]/g, "") : part.replace(/[^0-9]/g, "")))
      .join(".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : VALUE(`"${s}" isn't a number.`);
  },
  HOUR: (a) => clockPart(a, "hour"),
  MINUTE: (a) => clockPart(a, "minute"),
  SECOND: (a) => clockPart(a, "second"),
  ISEVEN: (a) => {
    const x = N(a[0]);
    return isFault(x) ? x : Math.trunc(x as number) % 2 === 0;
  },
  ISODD: (a) => {
    const x = N(a[0]);
    return isFault(x) ? x : Math.abs(Math.trunc(x as number) % 2) === 1;
  },
  ISLOGICAL: (a) => typeof (a[0]?.value() ?? null) === "boolean",
  ISNA: (a) => {
    const v = a[0]?.value() ?? null;
    return isFault(v) && v.code === "#N/A";
  },
  TRUE: () => true,
  FALSE: () => false,
  SWITCH: (a) => {
    if (a.length < 3) return VALUE("SWITCH needs a value and at least one case.");
    const subject = a[0].value();
    if (isFault(subject)) return subject;
    for (let i = 1; i + 1 < a.length; i += 2) {
      const candidate = a[i].value();
      if (isFault(candidate)) return candidate;
      if (sameValue(subject, candidate)) return a[i + 1].value();
    }
    // An odd number of arguments left over means a default was given.
    return a.length % 2 === 0 ? a[a.length - 1].value() : NA("No case matched.");
  },
};

function cutAt(a: Arg[], side: "before" | "after"): Value {
  const s = str(a[0]?.value() ?? "");
  const mark = str(a[1]?.value() ?? "");
  if (isFault(s)) return s;
  if (isFault(mark)) return mark;
  if (!mark) return side === "before" ? "" : s;
  const at = s.indexOf(mark);
  if (at === -1) return NA(`"${mark}" isn't in there.`);
  return side === "before" ? s.slice(0, at) : s.slice(at + mark.length);
}

/** Times ride inside a date string — `2026-08-11 14:30` — or as a fraction. */
function clockPart(a: Arg[], part: "hour" | "minute" | "second"): Value {
  const v = a[0]?.value() ?? null;
  if (isFault(v)) return v;
  if (typeof v === "number") {
    const seconds = Math.round((v % 1) * 86_400);
    return part === "hour"
      ? Math.floor(seconds / 3600)
      : part === "minute"
        ? Math.floor((seconds % 3600) / 60)
        : seconds % 60;
  }
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v ?? ""));
  if (!m) return VALUE("There's no time in there.");
  return part === "hour" ? +m[1] : part === "minute" ? +m[2] : +(m[3] ?? 0);
}

/* ── Working days ───────────────────────────────────────── */

const DAY_MS = 86_400_000;

const asDate = (v: Value): Date | FormulaFault => {
  if (isFault(v)) return v;
  const text = String(v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  if (typeof v === "number") return new Date((v - 25569) * DAY_MS);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? VALUE(`"${text}" isn't a date.`) : new Date(parsed);
};

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/**
 * Days between two dates on a 360-day year.
 *
 * Two conventions, and they disagree by a day at the end of a month — which is
 * exactly where interest is calculated. US (NASD) drags a 31st back to the
 * 30th, and does it to the *end* date only when the start was already at
 * month end; European clamps both unconditionally.
 */
function days360(from: Date, to: Date, european: boolean): number {
  let d1 = from.getUTCDate();
  let d2 = to.getUTCDate();
  const m1 = from.getUTCMonth() + 1;
  const m2 = to.getUTCMonth() + 1;
  const y1 = from.getUTCFullYear();
  const y2 = to.getUTCFullYear();
  if (european) {
    d1 = Math.min(d1, 30);
    d2 = Math.min(d2, 30);
  } else {
    const endOfFeb = (y: number, m: number, d: number) =>
      m === 2 && d === new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (endOfFeb(y1, m1, d1) && endOfFeb(y2, m2, d2)) d2 = 30;
    if (endOfFeb(y1, m1, d1)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    if (d1 === 31) d1 = 30;
  }
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

/**
 * A year fraction, on whichever day count was asked for.
 *
 * The default is basis 0 — US 30/360 — because that is Excel's default, and a
 * formula pasted from somebody's loan schedule has to come to the same number
 * here as it did there. Choosing the "more correct" actual/365 as the default
 * would be a silent disagreement of a few days' interest, which is the kind of
 * difference nobody notices until an auditor does.
 */
function yearFraction(from: Date, to: Date, basis: number): Value {
  const ms = Math.abs(to.getTime() - from.getTime());
  switch (basis) {
    case 0:
      return Math.abs(days360(from, to, false)) / 360;
    case 1: {
      // Actual/actual: the average length of the years the span touches.
      const y1 = from.getUTCFullYear();
      const y2 = to.getUTCFullYear();
      let days = 0;
      for (let y = y1; y <= y2; y++)
        days += (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
      return ms / DAY_MS / (days / (y2 - y1 + 1));
    }
    case 2:
      return ms / DAY_MS / 360;
    case 3:
      return ms / DAY_MS / 365;
    case 4:
      return Math.abs(days360(from, to, true)) / 360;
    default:
      return VALUE("YEARFRAC takes a basis of 0 to 4.");
  }
}

const DATES: Record<string, Fn> = {
  NETWORKDAYS: (a) => {
    const from = asDate(a[0]?.value() ?? null);
    if (isFault(from)) return from;
    const to = asDate(a[1]?.value() ?? null);
    if (isFault(to)) return to;
    const holidays = new Set(
      (a[2]?.range() ?? [])
        .map((v) => asDate(v))
        .filter((d): d is Date => !isFault(d))
        .map((d) => d.toISOString().slice(0, 10)),
    );
    const step = from <= to ? 1 : -1;
    let count = 0;
    for (
      let d = new Date(from);
      step > 0 ? d <= to : d >= to;
      d = new Date(d.getTime() + step * DAY_MS)
    )
      if (!isWeekend(d) && !holidays.has(d.toISOString().slice(0, 10))) count += step;
    return count;
  },
  WORKDAY: (a) => {
    const from = asDate(a[0]?.value() ?? null);
    if (isFault(from)) return from;
    const days = N(a[1]);
    if (isFault(days)) return days;
    const holidays = new Set(
      (a[2]?.range() ?? [])
        .map((v) => asDate(v))
        .filter((d): d is Date => !isFault(d))
        .map((d) => d.toISOString().slice(0, 10)),
    );
    let left = Math.trunc(days as number);
    const step = left >= 0 ? 1 : -1;
    let d = new Date(from);
    while (left !== 0) {
      d = new Date(d.getTime() + step * DAY_MS);
      if (!isWeekend(d) && !holidays.has(d.toISOString().slice(0, 10))) left -= step;
    }
    return d.toISOString().slice(0, 10);
  },
  YEARFRAC: (a) => {
    const from = asDate(a[0]?.value() ?? null);
    if (isFault(from)) return from;
    const to = asDate(a[1]?.value() ?? null);
    if (isFault(to)) return to;
    const basis = a.length > 2 ? num(a[2].value()) : 0;
    if (isFault(basis)) return basis;
    return yearFraction(from, to, Math.trunc(basis));
  },
  DAYS360: (a) => {
    const from = asDate(a[0]?.value() ?? null);
    if (isFault(from)) return from;
    const to = asDate(a[1]?.value() ?? null);
    if (isFault(to)) return to;
    const european = a.length > 2 ? truthy(a[2]) : false;
    return days360(from, to, european);
  },
  ISOWEEKNUM: (a) => {
    const d = asDate(a[0]?.value() ?? null);
    if (isFault(d)) return d;
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const firstDay = (first.getUTCDay() + 6) % 7;
    first.setUTCDate(first.getUTCDate() - firstDay + 3);
    return 1 + Math.round((t.getTime() - first.getTime()) / (7 * DAY_MS));
  },
};

/* ── What is deliberately missing ───────────────────────── */

/**
 * Named so the formula editor can say "not here, and here is why" instead of
 * `#NAME?`. Being told a function is absent on purpose is a different
 * experience from suspecting you have misspelled it.
 */
export const ABSENT: Record<string, string> = {
  RAND: "A cell that changes on every render can't be compared with what it said a second ago. Use a fixed number, or paste one in.",
  RANDBETWEEN: "Same reason as RAND: nothing here may change on its own.",
  NOW: "NOW is here, but it is read when the sheet is computed rather than ticking.",
  UNIQUE: "Spilling into cells you didn't select needs a spill model this doesn't have yet. A pivot table does the same job.",
  SORT: "Same as UNIQUE — sort the table itself, which is a click on the header.",
  FILTER: "Same as UNIQUE. Filter the table, or use SUMIFS / COUNTIFS.",
  TRANSPOSE: "Spilling again. Copy and paste the range instead.",
  INDIRECT: "Builds a reference out of text while running, so the cycle guard could no longer see the dependencies before evaluating them.",
  OFFSET: "Same as INDIRECT. INDEX with a range does most of what people use it for.",
  VBA: "There are no macros. What a macro usually automates — repeat this over every row — is what a formula column already is.",
};

export const MORE: Record<string, Fn> = {
  ...MONEY,
  ...MATHS,
  ...STATS,
  ...LOOKUP,
  ...TEXT_TIME,
  ...DATES,
};
