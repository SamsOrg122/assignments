"use client";

/**
 * The Table block — a real grid.
 *
 * Cells render as text, not as ten thousand `<input>`s; there is exactly one
 * editor, mounted over the active cell. That single decision is what buys the
 * rest: rows virtualise (only the visible slice plus a margin exists in the
 * DOM), selection is a rectangle of coordinates rather than focus state, and
 * keyboard navigation is a coordinate change rather than a focus dance.
 *
 * The chrome stays calm on purpose. There is no ribbon: the formula bar
 * appears when a cell is selected, filters and formatting live in one quiet
 * popover, and everything else is where it always was — on the column header,
 * under the pointer.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CellValue,
  Column,
  ColumnType,
  FilterOp,
  FormatRule,
  TableBlock as TableBlockModel,
} from "@/lib/types";
import { NUMERIC_COLUMN_TYPES, sortsOf } from "@/lib/types";
import { useProjects } from "@/lib/store";
import {
  checkFormula,
  columnLetters,
  computeFormulas,
  cycleAnchor,
  isErrorText,
  isFormulaCell,
  shiftFormula,
} from "@/lib/formula";
import { sheetsOf } from "@/lib/workbook";
import { checkTable, failureMap } from "@/lib/validation";
import {
  displayCell,
  formatTone,
  isChecked,
  rawCell,
  readCell,
  viewRows,
} from "@/lib/table-view";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { FigureCaption } from "./FigureCaption";
import { describePivot, pivotTable } from "@/lib/sheet/pivot";
import { SheetActions, SheetTabs } from "./SheetTabs";

interface Props {
  projectId: string;
  block: TableBlockModel;
}

const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  date: "Date",
  checkbox: "Checkbox",
  select: "Select",
  formula: "Formula",
};

const ROW_H = 30;
const HEADER_H = 33;
/** Rows beyond this virtualise. Below it, plain rendering is simpler to debug. */
const VIRTUAL_FROM = 60;
const OVERSCAN = 10;
const MAX_BODY_H = 480;
/** Rows a Page Up / Page Down moves. One screenful of the body, near enough. */
const PAGE = Math.floor(MAX_BODY_H / ROW_H);

/**
 * The last range copied *here*, kept beside the system clipboard.
 *
 * The clipboard holds text, and text cannot say "this was a formula at B2".
 * Keeping the sources next to it — matched by the exact text we wrote — means
 * a paste back into the app can move formulas instead of pasting the numbers
 * they had at the moment of copying, while a paste into anything else still
 * gets sensible values. Module-level because a copy in one table and a paste
 * in another is an ordinary thing to do.
 */
let clipboardMemory: {
  text: string;
  cells: CellValue[][];
  origin: { r: number; c: number };
} | null = null;

const TONE_CLASS: Record<FormatRule["tone"], string> = {
  accent: "bg-accent-soft",
  mint: "bg-leaf-soft",
  warn: "bg-warn/15",
  danger: "bg-danger/15",
};

interface CellPos {
  r: number;
  c: number;
}

/**
 * A table is one of two things, and they cannot share a body: a grid you edit,
 * or a summary derived from another table on every render. Choosing here — in
 * a component that runs no hooks of its own — is what keeps the grid's hooks
 * unconditional.
 */
export function TableBlock(props: Props) {
  if (props.block.pivot) return <PivotView {...props} />;
  return <TableGrid {...props} />;
}

function TableGrid({ projectId, block }: Props) {
  const setCell = useProjects((s) => s.setCell);
  const setCells = useProjects((s) => s.setCells);
  const addRow = useProjects((s) => s.addRow);
  const addRows = useProjects((s) => s.addRows);
  const removeRow = useProjects((s) => s.removeRow);
  const addColumn = useProjects((s) => s.addColumn);
  const setSort = useProjects((s) => s.setSort);
  const setFreeze = useProjects((s) => s.setFreeze);

  const [menuColumn, setMenuColumn] = useState<string | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [sel, setSel] = useState<{ anchor: CellPos; focus: CellPos } | null>(null);
  const [editing, setEditing] = useState<(CellPos & { seed?: string }) | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Every table in the project is a sheet of one workbook, so a formula here
  // can reach `[Costs]![Amount]` and `Costs!B2:B40`. Recomputed when any of
  // them changes, because that is exactly when a cross-sheet total goes stale.
  const blocks = useProjects((s) => s.projects.find((p) => p.id === projectId)?.blocks);
  const names = useProjects((s) => s.projects.find((p) => p.id === projectId)?.names);
  const workbook = useMemo(
    () => ({ sheets: sheetsOf(blocks ?? []), names: names ?? [] }),
    [blocks, names],
  );

  const derived = useMemo(
    () => computeFormulas(block.columns, block.rows, workbook, block.id),
    [block.columns, block.rows, block.id, workbook],
  );

  /** Cells that break their column's rule, marked rather than refused. */
  const failures = useMemo(
    () => failureMap(checkTable(block.columns, block.rows, workbook, block.id)),
    [block.columns, block.rows, block.id, workbook],
  );

  const rows = useMemo(() => viewRows(block, derived), [block, derived]);
  const sorts = sortsOf(block);
  const filters = block.filters ?? [];
  const formats = block.formats ?? [];

  const colCount = block.columns.length;
  const rowCount = rows.length;

  /* ── Selection helpers ─────────────────────────────────── */

  const clamp = useCallback(
    (pos: CellPos): CellPos => ({
      r: Math.max(0, Math.min(rowCount - 1, pos.r)),
      c: Math.max(0, Math.min(colCount - 1, pos.c)),
    }),
    [rowCount, colCount],
  );

  const rect = useMemo(() => {
    if (!sel) return null;
    return {
      r1: Math.min(sel.anchor.r, sel.focus.r),
      r2: Math.max(sel.anchor.r, sel.focus.r),
      c1: Math.min(sel.anchor.c, sel.focus.c),
      c2: Math.max(sel.anchor.c, sel.focus.c),
    };
  }, [sel]);

  const inRect = (r: number, c: number) =>
    rect !== null && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;

  const moveFocus = useCallback(
    (dr: number, dc: number, extend: boolean) => {
      setEditing(null);
      setSel((prev) => {
        const base = prev?.focus ?? { r: 0, c: 0 };
        const next = clamp({ r: base.r + dr, c: base.c + dc });
        return extend && prev
          ? { anchor: prev.anchor, focus: next }
          : { anchor: next, focus: next };
      });
    },
    [clamp],
  );

  /**
   * ⌘ + arrow, as a spreadsheet means it.
   *
   * From a filled cell: run to the last filled cell before the first gap.
   * From a blank one, or when already at the edge of a block: run to the next
   * filled cell, or to the end of the table. That two-part rule is what makes
   * the keystroke feel like navigation instead of a jump to row one.
   */
  const jumpToEdge = useCallback(
    (dr: number, dc: number, extend: boolean) => {
      setEditing(null);
      setSel((prev) => {
        if (!prev) return prev;
        const filled = (r: number, c: number) => {
          const row = rows[r];
          const column = block.columns[c];
          if (!row || !column) return false;
          const v = readCell(row, column, derived);
          return v !== null && v !== undefined && v !== "";
        };
        let { r, c } = prev.focus;
        const step = () => {
          r += dr;
          c += dc;
        };
        const inside = () => r >= 0 && r < rowCount && c >= 0 && c < colCount;
        const startFilled = filled(r, c);
        const nextFilled = filled(r + dr, c + dc);

        if (startFilled && nextFilled) {
          // Along a run: stop on its last filled cell.
          while (true) {
            step();
            if (!inside() || !filled(r, c)) {
              r -= dr;
              c -= dc;
              break;
            }
          }
        } else {
          // Across a gap: stop on the next filled cell, or at the far edge.
          let landed = false;
          while (true) {
            step();
            if (!inside()) {
              r -= dr;
              c -= dc;
              break;
            }
            if (filled(r, c)) {
              landed = true;
              break;
            }
          }
          if (!landed) {
            r = dr > 0 ? rowCount - 1 : dr < 0 ? 0 : r;
            c = dc > 0 ? colCount - 1 : dc < 0 ? 0 : c;
          }
        }
        const next = clamp({ r, c });
        return extend
          ? { anchor: prev.anchor, focus: next }
          : { anchor: next, focus: next };
      });
    },
    [rows, block.columns, derived, rowCount, colCount, clamp],
  );

  // Keep the focused row on screen as the selection moves.
  useEffect(() => {
    if (!sel || !gridRef.current) return;
    const top = sel.focus.r * ROW_H;
    const view = gridRef.current;
    if (top < view.scrollTop) view.scrollTop = top;
    else if (top + ROW_H > view.scrollTop + view.clientHeight)
      view.scrollTop = top + ROW_H - view.clientHeight;
  }, [sel]);

  /* ── Editing ───────────────────────────────────────────── */

  const commitCell = useCallback(
    (pos: CellPos, text: string) => {
      const row = rows[pos.r];
      const column = block.columns[pos.c];
      if (!row || !column || column.type === "formula") return;
      setCell(projectId, block.id, row.id, column.id, parseInput(text, column));
    },
    [rows, block.columns, block.id, projectId, setCell],
  );

  const startEdit = useCallback(
    (pos: CellPos, seed?: string) => {
      const column = block.columns[pos.c];
      if (!column || column.type === "formula") return;
      // A checkbox has no edit mode — activation toggles it.
      if (column.type === "checkbox") {
        const row = rows[pos.r];
        if (row)
          setCell(
            projectId,
            block.id,
            row.id,
            column.id,
            isChecked(row.cells[column.id] ?? null) ? null : 1,
          );
        return;
      }
      setEditing({ ...pos, seed });
    },
    [block.columns, block.id, projectId, rows, setCell],
  );

  /* ── Clipboard ─────────────────────────────────────────── */

  const copySelection = useCallback(() => {
    if (!rect) return;
    const lines: string[] = [];
    const sources: CellValue[][] = [];
    for (let r = rect.r1; r <= rect.r2; r++) {
      const cells: string[] = [];
      const typed: CellValue[] = [];
      for (let c = rect.c1; c <= rect.c2; c++) {
        const raw = readCell(rows[r], block.columns[c], derived);
        cells.push(raw === null || raw === undefined ? "" : String(raw));
        typed.push(rawCell(rows[r], block.columns[c]));
      }
      lines.push(cells.join("\t"));
      sources.push(typed);
    }
    const text = lines.join("\n");
    // Two copies leave here, and which one lands depends on where it is
    // dropped. Another app gets the *values* — a spreadsheet's formula means
    // nothing in an email. A paste back into this app gets the formulas,
    // moved to wherever they land, which is what copying a formula means.
    clipboardMemory = { text, cells: sources, origin: { r: rect.r1, c: rect.c1 } };
    void navigator.clipboard?.writeText(text);
  }, [rect, rows, block.columns, derived]);

  const pasteBlock = useCallback(
    (text: string) => {
      if (!sel) return;
      // Ours, unchanged since we copied it: paste the formulas rather than
      // the answers they happened to have.
      const internal =
        clipboardMemory && clipboardMemory.text === text ? clipboardMemory : null;
      const grid = internal
        ? internal.cells.map((line) =>
            line.map((v) => (v === null || v === undefined ? "" : String(v))),
          )
        : text
            .replace(/\r/g, "")
            .split("\n")
            .filter((line, i, all) => !(i === all.length - 1 && line === ""))
            .map((line) => line.split("\t"));
      if (!grid.length) return;

      // Grow the table if the paste spills past the last row.
      const start = sel.anchor;
      const missing = start.r + grid.length - rowCount;
      const newIds = missing > 0 ? addRows(projectId, block.id, missing) : [];

      const writes: Array<{ rowId: string; columnId: string; value: CellValue }> = [];
      for (let dr = 0; dr < grid.length; dr++) {
        const rowId =
          dr + start.r < rowCount
            ? rows[dr + start.r].id
            : newIds[dr + start.r - rowCount];
        if (!rowId) continue;
        for (let dc = 0; dc < grid[dr].length; dc++) {
          const column = block.columns[start.c + dc];
          if (!column || column.type === "formula") continue;
          const cellText = grid[dr][dc];
          writes.push({
            rowId,
            columnId: column.id,
            value:
              internal && isFormulaCell(cellText)
                ? // The whole block moves by one offset — the distance from
                  // where it was copied to where it landed.
                  shiftFormula(cellText, start.r - internal.origin.r, start.c - internal.origin.c)
                : parseInput(cellText, column),
          });
        }
      }
      setCells(projectId, block.id, writes);
      setSel({
        anchor: start,
        focus: clamp({
          r: start.r + grid.length - 1,
          c: start.c + (grid[0]?.length ?? 1) - 1,
        }),
      });
    },
    [sel, rowCount, rows, block.columns, block.id, projectId, addRows, setCells, clamp],
  );

  /**
   * Ctrl+D and Ctrl+R.
   *
   * A formula is *moved*, not copied: `=B2*C2` two rows down is `=B4*C4`,
   * unless a `$` says otherwise. Anything else — a number, a word — is copied
   * as it is. That difference is the whole reason fill exists.
   */
  const fill = useCallback(
    (direction: "down" | "right") => {
      if (!rect) return;
      if (direction === "down" && rect.r1 === rect.r2) return;
      if (direction === "right" && rect.c1 === rect.c2) return;
      const writes: Array<{ rowId: string; columnId: string; value: CellValue }> = [];

      if (direction === "down") {
        for (let c = rect.c1; c <= rect.c2; c++) {
          const column = block.columns[c];
          if (!column || column.type === "formula") continue;
          const top = rows[rect.r1].cells[column.id] ?? null;
          for (let r = rect.r1 + 1; r <= rect.r2; r++)
            writes.push({
              rowId: rows[r].id,
              columnId: column.id,
              value: isFormulaCell(top)
                ? shiftFormula(String(top), r - rect.r1, 0)
                : top,
            });
        }
      } else {
        const source = block.columns[rect.c1];
        if (!source) return;
        for (let r = rect.r1; r <= rect.r2; r++) {
          const left = rows[r].cells[source.id] ?? null;
          for (let c = rect.c1 + 1; c <= rect.c2; c++) {
            const column = block.columns[c];
            if (!column || column.type === "formula") continue;
            writes.push({
              rowId: rows[r].id,
              columnId: column.id,
              value: isFormulaCell(left)
                ? shiftFormula(String(left), 0, c - rect.c1)
                : left,
            });
          }
        }
      }
      setCells(projectId, block.id, writes);
    },
    [rect, rows, block.columns, block.id, projectId, setCells],
  );

  const clearSelection = useCallback(() => {
    if (!rect) return;
    const writes: Array<{ rowId: string; columnId: string; value: CellValue }> = [];
    for (let r = rect.r1; r <= rect.r2; r++)
      for (let c = rect.c1; c <= rect.c2; c++) {
        const column = block.columns[c];
        if (column && column.type !== "formula")
          writes.push({ rowId: rows[r].id, columnId: column.id, value: null });
      }
    setCells(projectId, block.id, writes);
  }, [rect, rows, block.columns, block.id, projectId, setCells]);

  /* ── Keyboard ──────────────────────────────────────────── */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // the editor's own handler owns the keyboard
    const mod = e.metaKey || e.ctrlKey;

    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const d: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const [dr, dc] = d[e.key];
      // ⌘/Ctrl + arrow runs to the edge of the data, the way it does in every
      // spreadsheet: to the last filled cell, or to the end if it is already
      // there. Ten thousand rows is one keystroke away, not ten thousand.
      if (mod && sel) jumpToEdge(dr, dc, e.shiftKey);
      else moveFocus(dr, dc, e.shiftKey);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (!sel) return;
      const c = e.key === "Home" ? 0 : colCount - 1;
      const r = mod ? (e.key === "Home" ? 0 : rowCount - 1) : sel.focus.r;
      setSel((prev) => ({
        anchor: e.shiftKey && prev ? prev.anchor : { r, c },
        focus: { r, c },
      }));
      return;
    }
    if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      moveFocus(e.key === "PageDown" ? PAGE : -PAGE, 0, e.shiftKey);
      return;
    }
    if (e.key === " " && (e.shiftKey || mod) && sel) {
      e.preventDefault();
      // ⇧Space takes the row, ⌘Space the column — and ⌘⇧Space, as in Excel,
      // takes everything.
      setSel(
        e.shiftKey && mod
          ? { anchor: { r: 0, c: 0 }, focus: { r: rowCount - 1, c: colCount - 1 } }
          : e.shiftKey
            ? {
                anchor: { r: sel.focus.r, c: 0 },
                focus: { r: sel.focus.r, c: colCount - 1 },
              }
            : {
                anchor: { r: 0, c: sel.focus.c },
                focus: { r: rowCount - 1, c: sel.focus.c },
              },
      );
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocus(0, e.shiftKey ? -1 : 1, false);
      return;
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (sel) startEdit(sel.focus);
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      return;
    }
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      fill("down");
      return;
    }
    if (mod && e.key.toLowerCase() === "r") {
      e.preventDefault();
      fill("right");
      return;
    }
    if (mod && e.key.toLowerCase() === "x") {
      e.preventDefault();
      copySelection();
      clearSelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (rowCount && colCount)
        setSel({
          anchor: { r: 0, c: 0 },
          focus: { r: rowCount - 1, c: colCount - 1 },
        });
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clearSelection();
      return;
    }
    // A printable character starts editing with it, spreadsheet-style.
    if (e.key.length === 1 && !mod && sel) {
      e.preventDefault();
      startEdit(sel.focus, e.key);
    }
  };

  /* ── Virtual window ────────────────────────────────────── */

  const virtual = rowCount > VIRTUAL_FROM;
  const bodyH = Math.min(rowCount * ROW_H, MAX_BODY_H);
  const from = virtual
    ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
    : 0;
  const to = virtual
    ? Math.min(rowCount, Math.ceil((scrollTop + bodyH) / ROW_H) + OVERSCAN)
    : rowCount;
  const windowRows = rows.slice(from, to);

  /* ── Totals over the *visible* rows ────────────────────── */

  const totals = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const c of block.columns) {
      if (!NUMERIC_COLUMN_TYPES.has(c.type)) {
        out[c.id] = null;
        continue;
      }
      let sum = 0;
      let seen = 0;
      for (const r of rows) {
        const raw = readCell(r, c, derived);
        if (raw === null || raw === "" || isErrorText(raw)) continue;
        sum += typeof raw === "number" ? raw : Number(raw) || 0;
        seen++;
      }
      out[c.id] = seen ? Math.round(sum * 1e6) / 1e6 : null;
    }
    return out;
  }, [block.columns, rows, derived]);

  const focusColumn = sel ? block.columns[sel.focus.c] : null;
  const focusRow = sel ? rows[sel.focus.r] : null;

  return (
    <div>
      <FigureCaption
        projectId={projectId}
        block={block}
        placeholder="What this table shows"
      />
      <div className="overflow-hidden rounded-md border border-line bg-surface">
      {/* ── The quiet strip: only counts, filters, and the formula bar ── */}
      <div className="flex min-h-[30px] items-center gap-2 border-b border-line px-2 py-1">
        {focusColumn && focusRow ? (
          <FormulaBar
            projectId={projectId}
            blockId={block.id}
            column={focusColumn}
            row={focusRow}
            derived={derived}
            columns={block.columns}
          />
        ) : (
          <span className="px-0.5 text-[11px] text-fg-subtle">
            {rowCount === block.rows.length
              ? `${rowCount} row${rowCount === 1 ? "" : "s"}`
              : `${rowCount} of ${block.rows.length} rows`}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDataOpen((v) => !v)}
            aria-pressed={dataOpen}
            className={cn(
              "flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[10.5px] transition-colors duration-150",
              filters.length || formats.length
                ? "text-accent"
                : "text-fg-subtle hover:text-fg",
              dataOpen && "bg-surface-2 text-fg",
            )}
          >
            <Icon name="sort" size={10} />
            {filters.length + formats.length > 0
              ? `Rules · ${filters.length + formats.length}`
              : "Rules"}
          </button>
          <SheetActions projectId={projectId} block={block} />
          <button
            type="button"
            onClick={() => setFreeze(projectId, block.id, !block.freeze)}
            aria-pressed={Boolean(block.freeze)}
            title="Keep the first column in view"
            className={cn(
              "rounded-xs px-1.5 py-0.5 text-[10.5px] transition-colors duration-150",
              block.freeze ? "text-accent" : "text-fg-subtle hover:text-fg",
            )}
          >
            Freeze
          </button>
        </span>
      </div>

      <SheetTabs projectId={projectId} blockId={block.id} />

      {dataOpen && (
        <DataRulesPanel
          projectId={projectId}
          block={block}
          onClose={() => setDataOpen(false)}
        />
      )}

      {/* ── The grid ── */}
      {/* The scroll container is not the grid: `role="grid"` requires row
          children, and a scrolling div whose only child is a <table> has none.
          The role belongs on the table itself, where the rows actually are. */}
      <div
        ref={gridRef}
        tabIndex={0}
        aria-label={block.title ?? "Table"}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (virtual) setScrollTop(e.currentTarget.scrollTop);
        }}
        onPaste={(e) => {
          if (editing) return;
          const text = e.clipboardData.getData("text/plain");
          if (text) {
            e.preventDefault();
            pasteBlock(text);
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        className="relative overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        style={{ maxHeight: bodyH + HEADER_H + 2 }}
      >
        <table
          role="grid"
          aria-rowcount={rowCount}
          aria-colcount={colCount}
          className="w-full border-collapse text-[12.5px]"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            {block.columns.map((c, i) => (
              <col
                key={c.id}
                style={{ width: c.width ?? (i === 0 ? 180 : 128) }}
              />
            ))}
            <col style={{ width: 32 }} />
          </colgroup>

          <thead>
            <tr
              className="border-b border-line"
              style={{ height: HEADER_H }}
            >
              {/* The corner. Empty, like every spreadsheet's, and the anchor
                  the row numbers line up under. */}
              <th
                scope="col"
                aria-label="Row numbers"
                // Below the block's own chrome, which sits at z-30. The menu
                // for a block opens to its left — straight over this gutter —
                // and a corner cell that painted on top of it made half the
                // menu unclickable on any table.
                className="sticky top-0 left-0 z-20 w-10 border-r border-b border-line bg-surface-2 p-0"
              />
              {block.columns.map((column, c) => {
                const key = sorts.find((k) => k.columnId === column.id);
                const priority = sorts.findIndex((k) => k.columnId === column.id);
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      key
                        ? key.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "group/th sticky top-0 z-10 border-r border-line bg-surface-2 p-0 text-left last:border-r-0",
                      block.freeze && c === 0 && "left-10 z-20",
                    )}
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={(e) =>
                          setSort(projectId, block.id, column.id, e.shiftKey)
                        }
                        title={`Sort by ${column.name} (column ${columnLetters(c)}) — shift-click to add a second key`}
                        className="flex min-w-0 flex-1 items-center gap-1 px-2.5 py-2 text-left transition-colors duration-150 hover:text-fg"
                      >
                        {/* The letter as well as the name: `=B2*C2` is
                            unwritable if nothing on screen says which column
                            is B, and a name is what the *table* calls it.

                            Drawn by CSS from `data-letter` rather than as
                            text, for two reasons. It keeps the header's text
                            content as the name alone — so copying a header,
                            or reading one aloud, gives "Rep" and not "ARep" —
                            and it keeps the letter out of the button's
                            accessible name, where the column's address
                            belongs in the label rather than glued to its
                            title. */}
                        <span
                          aria-hidden="true"
                          data-letter={columnLetters(c)}
                          className="col-letter shrink-0 font-mono text-[9.5px] text-fg-subtle"
                        />
                        <span className="truncate font-medium text-fg-muted">
                          {column.name}
                        </span>
                        {key && (
                          <span className="shrink-0 font-mono text-[9px] text-accent">
                            {key.dir === "asc" ? "↑" : "↓"}
                            {sorts.length > 1 ? priority + 1 : ""}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMenuColumn((v) => (v === column.id ? null : column.id))
                        }
                        aria-label={`${column.name} column options`}
                        className={cn(
                          "mr-1 shrink-0 rounded-xs p-1 text-fg-subtle transition-[opacity,color] duration-150",
                          "opacity-0 group-hover/th:opacity-100 focus-visible:opacity-100 hover:text-fg",
                          menuColumn === column.id && "text-fg opacity-100",
                        )}
                      >
                        <Icon name="chevron-down" size={11} />
                      </button>
                    </div>
                    {menuColumn === column.id && (
                      <ColumnMenu
                        projectId={projectId}
                        blockId={block.id}
                        column={column}
                        columns={block.columns}
                        canDelete={block.columns.length > 1}
                        onClose={() => setMenuColumn(null)}
                      />
                    )}
                  </th>
                );
              })}
              <th className="sticky top-0 z-10 bg-surface-2 p-0">
                <button
                  type="button"
                  onClick={() => addColumn(projectId, block.id)}
                  aria-label="Add column"
                  title="Add column"
                  className="grid h-full w-8 place-items-center py-2 text-fg-subtle transition-colors duration-150 hover:text-fg"
                >
                  <Icon name="plus" size={12} />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {virtual && from > 0 && (
              <tr style={{ height: from * ROW_H }} aria-hidden="true" />
            )}

            {windowRows.map((row, wi) => {
              const r = from + wi;
              return (
                <tr
                  key={row.id}
                  className="group/row border-b border-line last:border-b-0"
                  style={{ height: ROW_H }}
                >
                  <th
                    scope="row"
                    onClick={() =>
                      setSel({
                        anchor: { r, c: 0 },
                        focus: { r, c: colCount - 1 },
                      })
                    }
                    className={cn(
                      "sticky left-0 z-10 w-10 cursor-pointer border-r border-line bg-surface-2/60 text-center font-mono text-[10px] font-normal text-fg-subtle select-none",
                      sel?.focus.r === r && "bg-surface-3 text-fg-muted",
                    )}
                  >
                    {r + 1}
                  </th>
                  {block.columns.map((column, c) => {
                    const raw = readCell(row, column, derived);
                    const active =
                      sel?.focus.r === r && sel.focus.c === c;
                    const isEditing =
                      editing?.r === r && editing.c === c;
                    const tone = formatTone(formats, column, raw);
                    // A cell that breaks its column's rule is marked, never
                    // refused: the value stays, and the sentence explaining it
                    // is on the cell rather than in a dialog that has to be
                    // dismissed before you can look at what you typed.
                    const broken = failures[row.id]?.[column.id];

                    return (
                      <td
                        key={column.id}
                        role="gridcell"
                        aria-selected={inRect(r, c) || undefined}
                        aria-invalid={broken ? true : undefined}
                        title={broken}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          dragging.current = true;
                          gridRef.current?.focus();
                          e.preventDefault();
                          setEditing(null);
                          setSel(
                            e.shiftKey && sel
                              ? { anchor: sel.anchor, focus: { r, c } }
                              : { anchor: { r, c }, focus: { r, c } },
                          );
                        }}
                        onPointerEnter={() => {
                          if (dragging.current)
                            setSel((prev) =>
                              prev ? { anchor: prev.anchor, focus: { r, c } } : prev,
                            );
                        }}
                        onDoubleClick={() => startEdit({ r, c })}
                        className={cn(
                          "relative border-r border-line p-0 last:border-r-0",
                          block.freeze && c === 0 && "sticky left-10 z-[5] bg-surface",
                          tone && TONE_CLASS[tone],
                          inRect(r, c) && "bg-accent-soft",
                          broken &&
                            "bg-danger/[0.07] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-danger/60",
                          active && "outline-1 -outline-offset-1 outline-accent",
                        )}
                      >
                        {isEditing ? (
                          <CellEditor
                            column={column}
                            initial={
                              // The *source*, not the answer: opening `=B2*C2`
                              // as `41.30` and committing it would silently
                              // replace the formula with one stale number.
                              editing.seed ??
                              (() => {
                                const typed = rawCell(row, column);
                                const shown = typed ?? raw;
                                return shown === null ? "" : String(shown);
                              })()
                            }
                            seeded={editing.seed !== undefined}
                            onCommit={(text, then) => {
                              commitCell({ r, c }, text);
                              setEditing(null);
                              if (then === "down") moveFocus(1, 0, false);
                              if (then === "right") moveFocus(0, 1, false);
                              gridRef.current?.focus();
                            }}
                            onCancel={() => {
                              setEditing(null);
                              gridRef.current?.focus();
                            }}
                          />
                        ) : (
                          <CellDisplay column={column} raw={raw} />
                        )}
                      </td>
                    );
                  })}
                  <td className="p-0 align-middle">
                    <button
                      type="button"
                      onClick={() => removeRow(projectId, block.id, row.id)}
                      aria-label="Delete row"
                      className="grid h-full w-8 place-items-center text-fg-subtle opacity-0 transition-[opacity,color] duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-danger"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {virtual && to < rowCount && (
              <tr style={{ height: (rowCount - to) * ROW_H }} aria-hidden="true" />
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer: totals + add row ── */}
      {rowCount > 0 && (
        <div className="flex border-t border-line bg-surface-2/30 text-[11px]">
          {block.columns.map((column, i) => (
            <span
              key={column.id}
              className="truncate border-r border-line px-2.5 py-1.5 last:border-r-0"
              style={{ width: column.width ?? (i === 0 ? 180 : 128) }}
            >
              {i === 0 && totals[column.id] === null ? (
                <span className="text-fg-subtle">
                  {rowCount === block.rows.length
                    ? `${rowCount} rows`
                    : `${rowCount} shown`}
                  {/* The measured ceiling, said once it is close enough to
                      matter. Browser storage refuses a workspace over about
                      5 MB, which is roughly 50,000 rows of four short columns
                      — the grid itself is still fine well past that. */}
                  {rowCount >= 25_000 && (
                    <span className="ml-1.5 text-warn" title="Browser storage holds about 5 MB — roughly 50,000 rows of four short columns. Past that, a database or a second table.">
                      · large sheet
                    </span>
                  )}
                </span>
              ) : totals[column.id] !== null ? (
                <span className="font-mono text-fg-muted" title={`Sum of ${column.name}`}>
                  Σ {displayCell(totals[column.id], column)}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => addRow(projectId, block.id)}
        className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:bg-surface-2/50 hover:text-fg"
      >
        <Icon name="plus" size={11} />
        Add row
      </button>
    </div>
    </div>
  );
}

/* ── Cell rendering ─────────────────────────────────────── */

function CellDisplay({ column, raw }: { column: Column; raw: CellValue }) {
  if (column.type === "checkbox")
    return (
      <span className="grid h-full place-items-center">
        <span
          className={cn(
            "grid size-3.5 place-items-center rounded-xs border transition-colors duration-100",
            isChecked(raw)
              ? "border-accent bg-accent text-on-accent"
              : "border-line-strong",
          )}
        >
          {isChecked(raw) && <Icon name="check" size={9} />}
        </span>
      </span>
    );

  if (column.type === "select" && raw)
    return (
      <span className="flex h-full items-center px-2">
        <span className="truncate rounded-xs border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
          {String(raw)}
        </span>
      </span>
    );

  const text = displayCell(raw, column);
  const numeric = NUMERIC_COLUMN_TYPES.has(column.type);
  return (
    <span
      className={cn(
        "block truncate px-2.5 leading-[29px]",
        numeric && "text-right font-mono text-[11.5px]",
        column.type === "date" && "font-mono text-[11.5px]",
        column.type === "formula" &&
          (isErrorText(text) ? "text-danger" : "text-fg-muted"),
        text === "" && "text-fg-subtle",
      )}
    >
      {text}
    </span>
  );
}

function CellEditor({
  column,
  initial,
  seeded = false,
  onCommit,
  onCancel,
}: {
  column: Column;
  initial: string;
  /** True when `initial` is the keystroke that opened the editor. */
  seeded?: boolean;
  onCommit: (text: string, then?: "down" | "right") => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);

  if (column.type === "select") {
    const options = column.options ?? [];
    return (
      <div className="absolute top-0 left-0 z-30 min-w-full rounded-sm border border-accent bg-surface shadow-[0_12px_40px_-8px_rgba(0,0,0,0.7)]">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onCommit(option, "down")}
            className="flex w-full items-center px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {option}
          </button>
        ))}
        <input
          autoFocus
          value={value}
          placeholder={options.length ? "Or type…" : "Add an option…"}
          aria-label="Cell value"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(value, "down");
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => onCommit(value)}
          className="w-full border-t border-line bg-transparent px-2 py-1.5 text-[12px] text-fg outline-none"
        />
      </div>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      aria-label="Cell value"
      type={column.type === "date" ? "date" : "text"}
      inputMode={NUMERIC_COLUMN_TYPES.has(column.type) ? "decimal" : undefined}
      onChange={(e) => setValue(e.target.value)}
      // Editing an existing value selects it so typing replaces; a seeded
      // editor must NOT select, or the very keystroke that opened it gets
      // overwritten by the next one.
      onFocus={(e) => {
        if (seeded) {
          const n = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(n, n);
        } else e.currentTarget.select();
      }}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value, "down");
        else if (e.key === "Tab") {
          e.preventDefault();
          onCommit(value, "right");
        } else if (e.key === "Escape") onCancel();
        else if (e.key === "F4" && isFormulaCell(value)) {
          // Pin or unpin the address under the caret. Without this, a lookup
          // range has to be typed with four `$` by hand at exactly the right
          // moment, which is where most people give up on fill.
          e.preventDefault();
          const input = e.currentTarget;
          const { text, caret } = cycleAnchor(value, input.selectionStart ?? 0);
          setValue(text);
          requestAnimationFrame(() => input.setSelectionRange(caret, caret));
        }
      }}
      className={cn(
        "absolute inset-0 w-full bg-surface px-2.5 text-fg outline-1 -outline-offset-1 outline-accent",
        NUMERIC_COLUMN_TYPES.has(column.type) && "text-right font-mono text-[11.5px]",
      )}
    />
  );
}

/** What lands in the model when a cell is committed, per column type. */
function parseInput(text: string, column: Column): CellValue {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  // A formula is stored exactly as typed, in any column. A number column that
  // "helpfully" turned `=B2*C2` into NaN would be the single most baffling
  // thing this grid could do to somebody arriving from Excel.
  if (isFormulaCell(trimmed)) return trimmed;
  switch (column.type) {
    case "number":
    case "currency":
    case "percent": {
      const n = Number(trimmed.replace(/[€$,%\s]/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : trimmed;
    }
    case "checkbox":
      return isChecked(trimmed) ? 1 : null;
    default:
      return trimmed;
  }
}

/* ── Formula bar ────────────────────────────────────────── */

/**
 * Appears only when a cell is selected. For a formula column it edits the
 * column's formula; for everything else it shows the raw value under the
 * formatting, which is how you check what a currency cell actually holds.
 */
function FormulaBar({
  projectId,
  blockId,
  column,
  row,
  derived,
  columns,
}: {
  projectId: string;
  blockId: string;
  column: Column;
  row: { id: string; cells: Record<string, CellValue> };
  derived: Record<string, Record<string, string | number>>;
  columns: Column[];
}) {
  const updateColumn = useProjects((s) => s.updateColumn);
  const [draft, setDraft] = useState(column.formula ?? "");

  // Track the selected column, not the first render's. Render-adjust rather
  // than an effect, so the bar never shows one column's formula under
  // another column's name for a frame.
  const [lastColumn, setLastColumn] = useState(column.id);
  if (lastColumn !== column.id) {
    setLastColumn(column.id);
    setDraft(column.formula ?? "");
  }

  const error = column.type === "formula" ? checkFormula(draft, columns) : null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-subtle">
        {column.name}
      </span>
      {column.type === "formula" ? (
        <>
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">=</span>
          <input
            value={draft}
            spellCheck={false}
            aria-label={`Formula for ${column.name}`}
            placeholder="[Units] * [Price] · SUM AVG IF LOOKUP…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => updateColumn(projectId, blockId, column.id, { formula: draft })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={cn(
              "min-w-0 flex-1 bg-transparent font-mono text-[11.5px] outline-none",
              error ? "text-danger" : "text-fg",
            )}
          />
          {error && (
            <span className="shrink-0 truncate font-mono text-[10px] text-danger">
              {error}
            </span>
          )}
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
          {row.cells[column.id] === null || row.cells[column.id] === undefined
            ? ""
            : String(row.cells[column.id])}
          {column.type !== "text" && (
            <span className="ml-2 text-fg-subtle">
              → {displayCell(readCell(row, column, derived), column)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/* ── Filters & formatting, one panel ────────────────────── */

const FILTER_OPS: Array<[FilterOp, string]> = [
  ["contains", "contains"],
  ["eq", "="],
  ["neq", "≠"],
  ["gt", ">"],
  ["lt", "<"],
  ["empty", "is empty"],
  ["notEmpty", "is not empty"],
];

const FORMAT_OPS: Array<[FormatRule["op"], string]> = [
  ["gt", ">"],
  ["lt", "<"],
  ["eq", "="],
  ["contains", "contains"],
];

const TONES: Array<[FormatRule["tone"], string]> = [
  ["accent", "Blue"],
  ["mint", "Green"],
  ["warn", "Amber"],
  ["danger", "Red"],
];

function DataRulesPanel({
  projectId,
  block,
  onClose,
}: {
  projectId: string;
  block: TableBlockModel;
  onClose: () => void;
}) {
  const setFilters = useProjects((s) => s.setFilters);
  const setFormats = useProjects((s) => s.setFormats);

  const filters = block.filters ?? [];
  const formats = block.formats ?? [];
  const first = block.columns[0]?.id;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="anim-slide-up border-b border-line bg-surface-2/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-fg-muted">
          Rows must pass every filter. The first matching colour rule wins.
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close rules"
          className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={10} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-1.5">
        {filters.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <RuleSelect
              value={f.columnId}
              options={block.columns.map((c) => [c.id, c.name])}
              label="Filter column"
              onChange={(columnId) =>
                setFilters(
                  projectId,
                  block.id,
                  filters.map((x) => (x.id === f.id ? { ...x, columnId } : x)),
                )
              }
            />
            <RuleSelect
              value={f.op}
              options={FILTER_OPS}
              label="Filter condition"
              onChange={(op) =>
                setFilters(
                  projectId,
                  block.id,
                  filters.map((x) =>
                    x.id === f.id ? { ...x, op: op as FilterOp } : x,
                  ),
                )
              }
            />
            {f.op !== "empty" && f.op !== "notEmpty" && (
              <input
                value={f.value ?? ""}
                aria-label="Filter value"
                placeholder="value"
                onChange={(e) =>
                  setFilters(
                    projectId,
                    block.id,
                    filters.map((x) =>
                      x.id === f.id ? { ...x, value: e.target.value } : x,
                    ),
                  )
                }
                className="w-28 rounded-sm border border-line bg-surface px-1.5 py-1 text-[11.5px] text-fg outline-none focus:border-accent"
              />
            )}
            <button
              type="button"
              onClick={() =>
                setFilters(projectId, block.id, filters.filter((x) => x.id !== f.id))
              }
              aria-label="Remove filter"
              className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}

        {formats.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <RuleSelect
              value={f.columnId}
              options={block.columns.map((c) => [c.id, c.name])}
              label="Colour column"
              onChange={(columnId) =>
                setFormats(
                  projectId,
                  block.id,
                  formats.map((x) => (x.id === f.id ? { ...x, columnId } : x)),
                )
              }
            />
            <RuleSelect
              value={f.op}
              options={FORMAT_OPS}
              label="Colour condition"
              onChange={(op) =>
                setFormats(
                  projectId,
                  block.id,
                  formats.map((x) =>
                    x.id === f.id ? { ...x, op: op as FormatRule["op"] } : x,
                  ),
                )
              }
            />
            <input
              value={f.value}
              aria-label="Colour value"
              placeholder="value"
              onChange={(e) =>
                setFormats(
                  projectId,
                  block.id,
                  formats.map((x) =>
                    x.id === f.id ? { ...x, value: e.target.value } : x,
                  ),
                )
              }
              className="w-24 rounded-sm border border-line bg-surface px-1.5 py-1 text-[11.5px] text-fg outline-none focus:border-accent"
            />
            <RuleSelect
              value={f.tone}
              options={TONES}
              label="Colour"
              onChange={(tone) =>
                setFormats(
                  projectId,
                  block.id,
                  formats.map((x) =>
                    x.id === f.id ? { ...x, tone: tone as FormatRule["tone"] } : x,
                  ),
                )
              }
            />
            <span
              aria-hidden="true"
              className={cn("size-3 shrink-0 rounded-xs", TONE_CLASS[f.tone])}
            />
            <button
              type="button"
              onClick={() =>
                setFormats(projectId, block.id, formats.filter((x) => x.id !== f.id))
              }
              aria-label="Remove colour rule"
              className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            first &&
            setFilters(projectId, block.id, [
              ...filters,
              { id: uid(), columnId: first, op: "contains", value: "" },
            ])
          }
          className="flex items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Icon name="plus" size={9} />
          Filter
        </button>
        <button
          type="button"
          onClick={() =>
            first &&
            setFormats(projectId, block.id, [
              ...formats,
              { id: uid(), columnId: first, op: "gt", value: "0", tone: "accent" },
            ])
          }
          className="flex items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Icon name="plus" size={9} />
          Colour rule
        </button>
      </div>
    </div>
  );
}

function RuleSelect({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-sm border border-line bg-surface px-1.5 py-1 text-[11.5px] text-fg-muted outline-none focus:border-accent"
    >
      {options.map(([id, name]) => (
        <option key={id} value={id} className="bg-surface">
          {name}
        </option>
      ))}
    </select>
  );
}

/* ── Column menu ────────────────────────────────────────── */

function ColumnMenu({
  projectId,
  blockId,
  column,
  columns,
  canDelete,
  onClose,
}: {
  projectId: string;
  blockId: string;
  column: Column;
  columns: Column[];
  canDelete: boolean;
  onClose: () => void;
}) {
  const updateColumn = useProjects((s) => s.updateColumn);
  const removeColumn = useProjects((s) => s.removeColumn);

  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(column.name);
  const [formula, setFormula] = useState(column.formula ?? "");
  const [options, setOptions] = useState((column.options ?? []).join(", "));

  const formulaError = useMemo(
    () => (column.type === "formula" ? checkFormula(formula, columns) : null),
    [formula, columns, column.type],
  );

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="anim-pop absolute top-full right-0 z-30 mt-1 w-[252px] rounded-md border border-line-strong bg-surface p-2 text-left font-normal shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]"
    >
      <label className="label-mono mb-1 block">Name</label>
      <input
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onBlur={() =>
          updateColumn(projectId, blockId, column.id, {
            name: name.trim() || column.name,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="mb-2.5 w-full rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12.5px] text-fg outline-none focus:border-accent"
      />

      <label className="label-mono mb-1 block">Type</label>
      <div className="mb-2.5 grid grid-cols-2 gap-1">
        {(Object.keys(TYPE_LABEL) as ColumnType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() =>
              updateColumn(projectId, blockId, column.id, {
                type: t,
                ...(t === "formula" && !column.formula ? { formula: "" } : {}),
                ...(t === "select" && !column.options ? { options: [] } : {}),
              })
            }
            className={cn(
              "rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
              column.type === t
                ? "border-accent bg-accent-soft text-fg"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {column.type === "select" && (
        <>
          <label className="label-mono mb-1 block">Options</label>
          <input
            value={options}
            placeholder="Todo, Doing, Done"
            onChange={(e) => setOptions(e.target.value)}
            onBlur={() =>
              updateColumn(projectId, blockId, column.id, {
                options: options
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="mb-2 w-full rounded-sm border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent"
          />
        </>
      )}

      {column.type === "formula" && (
        <>
          <label className="label-mono mb-1 block">Formula</label>
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onBlur={() => updateColumn(projectId, blockId, column.id, { formula })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            spellCheck={false}
            placeholder="[Units] * [Price]"
            className={cn(
              "w-full rounded-sm border bg-surface-2 px-2 py-1.5 font-mono text-[11.5px] text-fg outline-none",
              formulaError ? "border-danger" : "border-line focus:border-accent",
            )}
          />
          <p
            className={cn(
              "mt-1 mb-2 font-mono text-[10px] leading-relaxed",
              formulaError ? "text-danger" : "text-fg-subtle",
            )}
          >
            {formulaError ??
              "[Column] refs · comparisons · IF SUM AVERAGE MEDIAN MIN MAX COUNT ROUND LOOKUP"}
          </p>
        </>
      )}

      {canDelete && (
        <button
          type="button"
          onClick={() => {
            removeColumn(projectId, blockId, column.id);
            onClose();
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
        >
          <Icon name="trash" size={12} />
          Delete column
        </button>
      )}
    </div>
  );
}

/**
 * A pivot, rendered.
 *
 * Read-only by construction: its columns and rows are computed from another
 * table every time this runs, so there is nothing here that could be edited
 * without editing the wrong thing. Everything else about it is an ordinary
 * table — which is why a chart can bind to it and every exporter already
 * knows what to do with it.
 */
function PivotView({ projectId, block }: Props) {
  const blocks = useProjects((s) => s.projects.find((p) => p.id === projectId)?.blocks);
  const updateBlock = useProjects((s) => s.updateBlock);
  const spec = block.pivot!;

  const source = useMemo(
    () => blocks?.find((b) => b.id === spec.sourceId && b.type === "table") as
      | TableBlockModel
      | undefined,
    [blocks, spec.sourceId],
  );

  const result = useMemo(() => pivotTable(spec, source), [spec, source]);

  // The derived shape is written back so that everything reading the stored
  // block — charts, .docx, .xlsx, the shared viewer — sees the same table the
  // screen does, without each of them having to know what a pivot is.
  useEffect(() => {
    if (result.problem) return;
    const sameColumns =
      block.columns.length === result.columns.length &&
      block.columns.every((c, i) => c.id === result.columns[i].id && c.name === result.columns[i].name);
    const sameRows =
      block.rows.length === result.rows.length &&
      block.rows.every(
        (r, i) =>
          r.id === result.rows[i].id &&
          JSON.stringify(r.cells) === JSON.stringify(result.rows[i].cells),
      );
    if (sameColumns && sameRows) return;
    updateBlock<TableBlockModel>(projectId, block.id, {
      columns: result.columns,
      rows: result.rows,
    });
  }, [result, block.columns, block.rows, block.id, projectId, updateBlock]);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
        <Icon name="sort" size={10} className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">
          {describePivot(spec, source)}
        </span>
        <span className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-subtle">
          summary
        </span>
      </div>

      {result.problem ? (
        <p className="p-3 text-[12.5px] text-warn">{result.problem}</p>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: MAX_BODY_H }}>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 border-b border-line bg-surface-2 px-2.5 py-1.5 text-left font-medium text-fg-muted",
                      NUMERIC_COLUMN_TYPES.has(c.type) && "text-right",
                    )}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const total = row.id === "pv-total-row";
                return (
                  <tr key={row.id} className={cn(total && "bg-surface-2/60 font-medium")}>
                    {result.columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          "border-b border-line px-2.5 py-1.5 text-fg",
                          NUMERIC_COLUMN_TYPES.has(c.type) && "text-right font-mono text-[11.5px]",
                        )}
                      >
                        {displayCell(row.cells[c.id] ?? null, c)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FigureCaption
        projectId={projectId}
        block={block}
        placeholder="What this summary shows"
      />
    </div>
  );
}
