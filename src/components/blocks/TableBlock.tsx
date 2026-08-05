"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CellValue,
  Column,
  ColumnType,
  TableBlock as TableBlockModel,
} from "@/lib/types";
import { useProjects } from "@/lib/store";
import { computeFormulas, checkFormula, toNumber, FORMULA_ERROR } from "@/lib/formula";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

interface Props {
  projectId: string;
  block: TableBlockModel;
}

const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  formula: "Formula",
};

export function TableBlock({ projectId, block }: Props) {
  const setCell = useProjects((s) => s.setCell);
  const addRow = useProjects((s) => s.addRow);
  const removeRow = useProjects((s) => s.removeRow);
  const addColumn = useProjects((s) => s.addColumn);
  const setSort = useProjects((s) => s.setSort);

  const [menuColumn, setMenuColumn] = useState<string | null>(null);

  // Derived values for every formula cell. Recomputed on any data change,
  // which is what keeps `Total` honest while you type in `Units`.
  const derived = useMemo(
    () => computeFormulas(block.columns, block.rows),
    [block.columns, block.rows],
  );

  // Sorting is a view concern — the underlying row order never moves.
  const rows = useMemo(() => {
    if (!block.sort) return block.rows;
    const { columnId, dir } = block.sort;
    const column = block.columns.find((c) => c.id === columnId);
    if (!column) return block.rows;

    const read = (rowId: string, cells: Record<string, CellValue>): CellValue =>
      column.type === "formula"
        ? ((derived[rowId]?.[columnId] ?? null) as CellValue)
        : (cells[columnId] ?? null);

    const numeric = column.type === "number" || column.type === "formula";
    return [...block.rows].sort((a, b) => {
      const av = read(a.id, a.cells);
      const bv = read(b.id, b.cells);
      const blankA = av === null || av === "";
      const blankB = bv === null || bv === "";
      if (blankA && blankB) return 0;
      if (blankA) return 1; // blanks always sink
      if (blankB) return -1;
      const cmp = numeric
        ? toNumber(av) - toNumber(bv)
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [block.rows, block.columns, block.sort, derived]);

  const totals = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const c of block.columns) {
      if (c.type !== "number" && c.type !== "formula") {
        out[c.id] = null;
        continue;
      }
      let sum = 0;
      let seen = 0;
      for (const r of block.rows) {
        const raw =
          c.type === "formula" ? derived[r.id]?.[c.id] : r.cells[c.id];
        if (raw === null || raw === undefined || raw === "" || raw === FORMULA_ERROR)
          continue;
        sum += toNumber(raw as CellValue);
        seen++;
      }
      out[c.id] = seen ? Math.round(sum * 1e6) / 1e6 : null;
    }
    return out;
  }, [block.columns, block.rows, derived]);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              {block.columns.map((column) => {
                const sorted = block.sort?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      sorted
                        ? block.sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="group/th relative border-r border-line bg-surface-2/50 p-0 text-left last:border-r-0"
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setSort(projectId, block.id, column.id)}
                        title={`Sort by ${column.name}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left transition-colors duration-150 hover:text-fg"
                      >
                        <span className="truncate font-medium text-fg-muted">
                          {column.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[9px] tracking-wide uppercase",
                            sorted ? "text-accent" : "text-fg-subtle",
                          )}
                        >
                          {sorted ? (block.sort!.dir === "asc" ? "↑" : "↓") : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMenuColumn((c) => (c === column.id ? null : column.id))
                        }
                        aria-label={`${column.name} column options`}
                        className={cn(
                          "mr-1 shrink-0 rounded-xs p-1 text-fg-subtle transition-[opacity,color] duration-150",
                          "opacity-0 group-hover/th:opacity-100 focus-visible:opacity-100 hover:text-fg",
                          menuColumn === column.id && "opacity-100 text-fg",
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
              <th scope="col" className="w-8 bg-surface-2/50 p-0">
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
            {rows.map((row) => (
              <tr key={row.id} className="group/row border-b border-line last:border-b-0">
                {block.columns.map((column) => (
                  <td
                    key={column.id}
                    className="border-r border-line p-0 last:border-r-0"
                  >
                    {column.type === "formula" ? (
                      <DerivedCell
                        value={derived[row.id]?.[column.id] ?? ""}
                        formula={column.formula ?? ""}
                      />
                    ) : (
                      <Cell
                        type={column.type}
                        value={row.cells[column.id] ?? null}
                        onCommit={(v) =>
                          setCell(projectId, block.id, row.id, column.id, v)
                        }
                      />
                    )}
                  </td>
                ))}
                <td className="p-0 align-middle">
                  <button
                    type="button"
                    onClick={() => removeRow(projectId, block.id, row.id)}
                    aria-label="Delete row"
                    title="Delete row"
                    className="grid h-full w-8 place-items-center text-fg-subtle opacity-0 transition-[opacity,color] duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-danger"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {block.rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line bg-surface-2/30">
                {block.columns.map((column, i) => (
                  <td
                    key={column.id}
                    className="border-r border-line px-2.5 py-1.5 last:border-r-0"
                  >
                    {i === 0 ? (
                      <span className="text-[11px] text-fg-subtle">
                        {block.rows.length} row{block.rows.length === 1 ? "" : "s"}
                      </span>
                    ) : totals[column.id] !== null ? (
                      <span
                        className="font-mono text-[11px] text-fg-muted"
                        title={`Sum of ${column.name}`}
                      >
                        Σ {formatNumber(totals[column.id]!)}
                      </span>
                    ) : null}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <button
        type="button"
        onClick={() => addRow(projectId, block.id)}
        className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-1.5 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:bg-surface-2/50 hover:text-fg"
      >
        <Icon name="plus" size={11} />
        Add row
      </button>
    </div>
  );
}

/* ── Cells ──────────────────────────────────────────────── */

function Cell({
  type,
  value,
  onCommit,
}: {
  type: ColumnType;
  value: CellValue;
  onCommit: (value: CellValue) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const dirty = useRef(false);

  // Adopt external changes, but never clobber what the user is typing.
  useEffect(() => {
    if (!dirty.current) setDraft(value === null ? "" : String(value));
  }, [value]);

  const commit = () => {
    dirty.current = false;
    const trimmed = draft.trim();
    if (trimmed === "") return onCommit(null);
    if (type === "number") {
      const n = Number(trimmed.replace(/[$,\s]/g, ""));
      return onCommit(Number.isFinite(n) ? n : trimmed);
    }
    onCommit(trimmed);
  };

  return (
    <input
      value={draft}
      onChange={(e) => {
        dirty.current = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          dirty.current = false;
          setDraft(value === null ? "" : String(value));
          e.currentTarget.blur();
        }
      }}
      type={type === "date" ? "date" : "text"}
      inputMode={type === "number" ? "decimal" : undefined}
      className={cn(
        "w-full min-w-[92px] bg-transparent px-2.5 py-1.5 text-fg outline-none",
        "transition-colors duration-150 focus:bg-accent-soft",
        type === "number" && "text-right font-mono text-[11.5px]",
        type === "date" && "font-mono text-[11.5px]",
      )}
    />
  );
}

function DerivedCell({
  value,
  formula,
}: {
  value: string | number;
  formula: string;
}) {
  const error = value === FORMULA_ERROR;
  return (
    <div
      title={formula ? `= ${formula}` : "No formula set"}
      className={cn(
        "px-2.5 py-1.5 text-right font-mono text-[11.5px]",
        error ? "text-danger" : "text-fg-muted",
        // Derived cells are visibly not editable.
        "bg-white/[0.015]",
      )}
    >
      {value === "" ? <span className="text-fg-subtle">—</span> : typeof value === "number" ? formatNumber(value) : value}
    </div>
  );
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
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
      className="anim-pop absolute top-full right-0 z-30 mt-1 w-[248px] rounded-md border border-line-strong bg-surface p-2 text-left font-normal shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]"
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

      {column.type === "formula" && (
        <>
          <label className="label-mono mb-1 block">Formula</label>
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onBlur={() =>
              updateColumn(projectId, blockId, column.id, { formula })
            }
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
              "[Column] refs · + − * / ^ · SUM AVG MIN MAX COUNT ROUND ABS IF"}
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
