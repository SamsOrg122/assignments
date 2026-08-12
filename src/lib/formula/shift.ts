/**
 * Moving a formula, the way a spreadsheet moves one.
 *
 * `=B2*C2` filled one row down has to become `=B3*C3`, and `=B$2*$C2` filled
 * anywhere has to keep the halves somebody pinned. That behaviour is most of
 * what "copy this formula down" means to a person, and getting it wrong is
 * worse than not offering fill at all: the numbers still look like numbers.
 *
 * Done over the source text rather than over the parse tree, because the tree
 * keeps no source positions and a rewritten tree would come back with its
 * spacing, its capitalisation and its `$` signs all rearranged. Somebody's
 * formula should read afterwards exactly as they typed it, minus the addresses
 * that genuinely moved.
 *
 * The scan skips the two places an address-shaped word is not an address:
 * inside a quoted string, and inside a `[Column]` reference. Column references
 * need no shifting anyway — `[price]` already means "this row's price", which
 * is why a table formula survives being moved without any of this.
 */

import { columnIndex, columnLetters } from "./parse";

/** `$?letters$?digits`, with the two `$` captured separately — they pin
 *  different halves and Excel lets you pin either one alone. */
const ADDRESS = /(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/y;

const isWordChar = (c: string | undefined) =>
  c !== undefined && /[A-Za-z0-9_.$]/.test(c);

/**
 * `source` with every relative address moved by `dr` rows and `dc` columns.
 *
 * The leading `=` is preserved if it was there. An address that would move off
 * the top or the left becomes `#REF!` — the same answer Excel gives, and a
 * visible one, rather than silently clamping to row 1 and reading plausibly.
 */
export function shiftFormula(source: string, dr: number, dc: number): string {
  if (!source || (dr === 0 && dc === 0)) return source;

  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];

    // A quoted string travels as it is: "A1" is a label, not a cell.
    if (c === '"' || c === "'") {
      const end = source.indexOf(c, i + 1);
      const stop = end === -1 ? source.length : end + 1;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    // `[Amount]`, `[Costs]![Amount]` — row-relative already.
    if (c === "[") {
      const end = source.indexOf("]", i + 1);
      const stop = end === -1 ? source.length : end + 1;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    if (/[A-Za-z$]/.test(c) && !isWordChar(source[i - 1])) {
      ADDRESS.lastIndex = i;
      const m = ADDRESS.exec(source);
      // Only an address if the whole word is one: `LOG10` and `Sheet2` are not.
      if (m && !isWordChar(source[ADDRESS.lastIndex])) {
        const [, colLock, letters, rowLock, digits] = m;
        const col = colLock ? columnIndex(letters) : columnIndex(letters) + dc;
        const row = rowLock ? Number(digits) - 1 : Number(digits) - 1 + dr;
        if (col < 0 || row < 0) {
          out += "#REF!";
        } else {
          out += `${colLock}${columnLetters(col)}${rowLock}${row + 1}`;
        }
        i = ADDRESS.lastIndex;
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Whether a stored cell holds a formula rather than a value.
 *
 * Deliberately not a type predicate. `v is string` reads well until it is
 * called on something already known to be a string — where it narrows the
 * *false* branch to `never` and takes the rest of the function with it.
 */
export const isFormulaCell = (v: unknown): boolean =>
  typeof v === "string" && v.length > 1 && v.startsWith("=");

/**
 * `=B2` → `=B$2` → `=$B$2` → `=$B2` → `=B2`, on the address the caret is in.
 *
 * F4 in Excel, and the reason it matters is lookup tables: the range has to
 * stay still while everything around it moves, and typing four `$` by hand at
 * the right moment is how people give up on fill.
 */
export function cycleAnchor(source: string, caret: number): {
  text: string;
  caret: number;
} {
  // Find the address the caret sits in or immediately after.
  const scan = /(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/g;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(source))) {
    const start = m.index;
    const end = start + m[0].length;
    if (isWordChar(source[start - 1]) || isWordChar(source[end])) continue;
    if (caret < start || caret > end) continue;

    const [, colLock, letters, rowLock, digits] = m;
    // The four states, in Excel's order.
    const next =
      !colLock && !rowLock
        ? `$${letters}$${digits}`
        : colLock && rowLock
          ? `${letters}$${digits}`
          : !colLock && rowLock
            ? `$${letters}${digits}`
            : `${letters}${digits}`;
    return {
      text: source.slice(0, start) + next + source.slice(end),
      caret: start + next.length,
    };
  }
  return { text: source, caret };
}
