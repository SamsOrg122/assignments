/**
 * Formula source → syntax tree.
 *
 * Still hand-written and still not `eval`: expressions come from user content
 * and would otherwise be an injection vector. What changed is that parsing and
 * evaluating are now separate passes. That is what makes `IF` and `IFERROR`
 * able to *not* evaluate the branch they didn't take, and what lets the editor
 * check a formula's shape without a table to run it against.
 *
 * Grammar:
 *   expr    := compare
 *   compare := concat (("=" | "<>" | "<" | ">" | "<=" | ">=") concat)*
 *   concat  := additive ("&" additive)*
 *   additive:= term (("+" | "-") term)*
 *   term    := unary (("*" | "/") unary)*
 *   unary   := "-" unary | postfix
 *   postfix := power "%"?
 *   power   := primary ("^" unary)?
 *   primary := number | string | ref | call | name | "(" expr ")"
 *
 *   ref     := "[" column "]"                     this row, this sheet
 *            | "[" sheet "]" "!" "[" column "]"   a whole column, elsewhere
 *            | A1 | A1:B9 | Sheet!A1:B9           cells and rectangles
 */

export interface Addr {
  /** 0-based column index. */
  col: number;
  /** 0-based row index. Row 1 in a formula is the first row of data. */
  row: number;
}

export type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  /** `[Column]`, optionally qualified with a sheet. */
  | { k: "col"; sheet?: string; name: string }
  /** `A1`, `A1:B9`, `Sheet!A1:B9`. `to` absent means one cell. */
  | { k: "cells"; sheet?: string; from: Addr; to?: Addr }
  /** A bare identifier: a named range, TRUE/FALSE, or nothing. */
  | { k: "name"; v: string }
  | { k: "call"; fn: string; args: Node[] }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "neg"; e: Node }
  | { k: "pct"; e: Node };

type Token =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bracket"; v: string }
  | { k: "word"; v: string }
  | { k: "op"; v: string };

const TWO = new Set([">=", "<=", "<>"]);
const ONE = new Set(["+", "-", "*", "/", "^", "%", "(", ")", ",", ";", ">", "<", "=", "&", "!", ":"]);

export class FormulaSyntaxError extends Error {}

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
      if (end === -1) throw new FormulaSyntaxError("Unclosed [");
      out.push({ k: "bracket", v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      // Doubling the quote escapes it, as in Excel: "say ""hi""".
      let j = i + 1;
      let text = "";
      for (;;) {
        if (j >= src.length) throw new FormulaSyntaxError("Unclosed quote");
        if (src[j] === c) {
          if (src[j + 1] === c) {
            text += c;
            j += 2;
            continue;
          }
          j++;
          break;
        }
        text += src[j];
        j++;
      }
      out.push({ k: "str", v: text });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      // Scientific notation, but only when it really is one: 1e5, 2.5E-3.
      if (/[eE]/.test(src[j] ?? "") && /[0-9+-]/.test(src[j + 1] ?? "")) {
        j += 2;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const n = Number(src.slice(i, j).replace(/_/g, ""));
      if (Number.isNaN(n)) throw new FormulaSyntaxError("Bad number");
      out.push({ k: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      out.push({ k: "word", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const pair = src.slice(i, i + 2);
    if (TWO.has(pair)) {
      out.push({ k: "op", v: pair });
      i += 2;
      continue;
    }
    if (ONE.has(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected ${c}`);
  }
  return out;
}

/** "A" → 0, "Z" → 25, "AA" → 26. Case-insensitive, `$` ignored. */
export function columnIndex(letters: string): number {
  const clean = letters.replace(/\$/g, "").toUpperCase();
  let n = 0;
  for (const ch of clean) {
    const v = ch.charCodeAt(0) - 64;
    if (v < 1 || v > 26) return -1;
    n = n * 26 + v;
  }
  return n - 1;
}

/** 0 → "A", 26 → "AA". The inverse, for showing an address. */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const A1 = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/;

/** `B7` → {col:1,row:6}, or null if it isn't an address at all. */
export function parseAddr(word: string): Addr | null {
  const m = A1.exec(word);
  if (!m) return null;
  const col = columnIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

export function parseFormula(src: string): Node {
  const tokens = tokenize(src.trim().replace(/^=/, ""));
  let p = 0;

  const peek = () => tokens[p];
  const isOp = (v: string) => {
    const t = tokens[p];
    return t?.k === "op" && t.v === v;
  };
  const eat = (v: string) => {
    if (!isOp(v)) throw new FormulaSyntaxError(`Expected ${v}`);
    p++;
  };

  function expr(): Node {
    return compare();
  }

  function compare(): Node {
    let l = concat();
    for (;;) {
      const t = peek();
      if (t?.k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
        p++;
        l = { k: "bin", op: t.v, l, r: concat() };
      } else return l;
    }
  }

  function concat(): Node {
    let l = additive();
    while (isOp("&")) {
      p++;
      l = { k: "bin", op: "&", l, r: additive() };
    }
    return l;
  }

  function additive(): Node {
    let l = term();
    for (;;) {
      const t = peek();
      if (t?.k === "op" && (t.v === "+" || t.v === "-")) {
        p++;
        l = { k: "bin", op: t.v, l, r: term() };
      } else return l;
    }
  }

  function term(): Node {
    let l = unary();
    for (;;) {
      const t = peek();
      if (t?.k === "op" && (t.v === "*" || t.v === "/")) {
        p++;
        l = { k: "bin", op: t.v, l, r: unary() };
      } else return l;
    }
  }

  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { k: "neg", e: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return postfix();
  }

  /** Trailing `%` divides by a hundred, so `20%` is 0.2 as everyone expects. */
  function postfix(): Node {
    let e = power();
    while (isOp("%")) {
      p++;
      e = { k: "pct", e };
    }
    return e;
  }

  function power(): Node {
    const base = primary();
    if (isOp("^")) {
      p++;
      return { k: "bin", op: "^", l: base, r: unary() };
    }
    return base;
  }

  /** After a `[Sheet]!` or `Sheet!` prefix, what does the reference point at? */
  function qualified(sheet: string): Node {
    eat("!");
    const t = peek();
    if (t?.k === "bracket") {
      p++;
      return { k: "col", sheet, name: t.v };
    }
    if (t?.k === "word") {
      const from = parseAddr(t.v);
      if (!from) throw new FormulaSyntaxError(`${sheet}!${t.v} isn't a cell`);
      p++;
      if (isOp(":")) {
        p++;
        const end = peek();
        const to = end?.k === "word" ? parseAddr(end.v) : null;
        if (!to) throw new FormulaSyntaxError("Expected the end of the range");
        p++;
        return { k: "cells", sheet, from, to };
      }
      return { k: "cells", sheet, from };
    }
    throw new FormulaSyntaxError(`Nothing follows ${sheet}!`);
  }

  function primary(): Node {
    const t = peek();
    if (!t) throw new FormulaSyntaxError("The formula stops early");

    if (t.k === "num") {
      p++;
      return { k: "num", v: t.v };
    }
    if (t.k === "str") {
      p++;
      return { k: "str", v: t.v };
    }
    if (t.k === "bracket") {
      p++;
      // `[Sheet]![Column]` — the bracket was a sheet name after all.
      if (isOp("!")) return qualified(t.v);
      return { k: "col", name: t.v };
    }
    if (isOp("(")) {
      p++;
      const v = expr();
      eat(")");
      return v;
    }
    if (t.k === "word") {
      const word = t.v;

      // A function call.
      if (tokens[p + 1]?.k === "op" && (tokens[p + 1] as { v: string }).v === "(") {
        p += 2;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          // Semicolons too: that is what a Dutch or German Excel writes, and
          // rejecting them would fail people for their locale.
          while (isOp(",") || isOp(";")) {
            p++;
            args.push(expr());
          }
        }
        eat(")");
        return { k: "call", fn: word.toUpperCase(), args };
      }

      p++;
      if (isOp("!")) return qualified(word);

      const upper = word.toUpperCase();
      if (upper === "TRUE") return { k: "bool", v: true };
      if (upper === "FALSE") return { k: "bool", v: false };

      const from = parseAddr(word);
      if (from) {
        if (isOp(":")) {
          p++;
          const end = peek();
          const to = end?.k === "word" ? parseAddr(end.v) : null;
          if (!to) throw new FormulaSyntaxError("Expected the end of the range");
          p++;
          return { k: "cells", from, to };
        }
        return { k: "cells", from };
      }

      return { k: "name", v: word };
    }
    throw new FormulaSyntaxError("Unexpected symbol");
  }

  const tree = expr();
  if (p !== tokens.length) throw new FormulaSyntaxError("Trailing input");
  return tree;
}

/** Every column name a formula mentions, for dependency and cycle checks. */
export function referencedColumns(node: Node): Array<{ sheet?: string; name: string }> {
  const out: Array<{ sheet?: string; name: string }> = [];
  const walk = (n: Node) => {
    switch (n.k) {
      case "col":
        out.push({ sheet: n.sheet, name: n.name });
        return;
      case "call":
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
