"use client";

/**
 * The tabs, and the things a workbook can do that a single table can't.
 *
 * A project's tables *are* its sheets — see `lib/workbook.ts` — so the strip
 * below is the real list of them, not a second concept that has to be kept in
 * step. Clicking one scrolls to it; the name shown is the name a formula
 * addresses it by, which is why an untitled table reads "Sheet 2" here rather
 * than nothing at all.
 */

import { useRef, useState } from "react";
import type { TableBlock as TableBlockModel } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { sheetsOf } from "@/lib/workbook";
import { parseCsv, gridToTable, toCsv } from "@/lib/sheet/csv";
import { buildXlsx, importXlsxFile, sheetOut } from "@/lib/sheet/xlsx";
import { computeFormulas } from "@/lib/formula";
import { createBlock } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { PivotEditor } from "./PivotEditor";

function download(name: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    a.remove();
    URL.revokeObjectURL(url);
  });
}

export function SheetTabs({
  projectId,
  blockId,
}: {
  projectId: string;
  blockId: string;
}) {
  const blocks = useProjects((s) => s.projects.find((p) => p.id === projectId)?.blocks);
  const sheets = sheetsOf(blocks ?? []);
  // One table is not a workbook, and a tab strip over a single tab is noise.
  if (sheets.length < 2) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1">
      <span className="shrink-0 pr-1 font-mono text-[9.5px] text-fg-subtle">
        SHEETS
      </span>
      {sheets.map((sheet) => (
        <button
          key={sheet.id}
          type="button"
          onClick={() =>
            document
              .getElementById(`block-${sheet.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          className={cn(
            "shrink-0 rounded-xs px-2 py-0.5 text-[11px] transition-colors duration-150",
            sheet.id === blockId
              ? "bg-surface-3 text-fg"
              : "text-fg-subtle hover:text-fg",
          )}
        >
          {sheet.name}
        </button>
      ))}
    </div>
  );
}

export function SheetActions({
  projectId,
  block,
}: {
  projectId: string;
  block: TableBlockModel;
}) {
  const blocks = useProjects((s) => s.projects.find((p) => p.id === projectId)?.blocks);
  const updateBlock = useProjects((s) => s.updateBlock);
  const insertBlock = useProjects((s) => s.insertBlock);
  const notify = useUI((s) => s.notify);
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pivoting, setPivoting] = useState(false);

  const name = sheetsOf(blocks ?? []).find((s) => s.id === block.id)?.name ?? "Sheet";

  const exportRows = () => {
    const derived = computeFormulas(block.columns, block.rows);
    return block.rows.map((row) =>
      block.columns.map((column) =>
        column.type === "formula"
          ? (derived[row.id]?.[column.id] ?? null)
          : (row.cells[column.id] ?? null),
      ),
    );
  };

  const onFile = async (chosen: File) => {
    try {
      if (/\.xlsx?$/i.test(chosen.name)) {
        const workbook = await importXlsxFile(chosen);
        if (!workbook.sheets.length)
          throw new Error(workbook.notes[0] ?? "Nothing in that file.");

        const [first, ...rest] = workbook.sheets;
        updateBlock<TableBlockModel>(projectId, block.id, {
          columns: first.columns,
          rows: first.rows,
          title: block.title ?? first.name,
          // The old sort and filters point at columns that no longer exist.
          sort: null,
          filters: [],
          formats: [],
        });
        // Every other sheet becomes its own table, which is what makes them
        // addressable as `Sheet2!A1` afterwards.
        let after = block.id;
        for (const sheet of rest) {
          const made = createBlock("table") as TableBlockModel;
          made.columns = sheet.columns;
          made.rows = sheet.rows;
          made.title = sheet.name;
          insertBlock(projectId, made, after);
          after = made.id;
        }
        notify(
          rest.length
            ? `Imported ${workbook.sheets.length} sheets from ${chosen.name}`
            : `Imported ${first.rows.length} rows from ${chosen.name}`,
        );
        return;
      }

      const text = await chosen.text();
      const table = gridToTable(parseCsv(text));
      updateBlock<TableBlockModel>(projectId, block.id, {
        columns: table.columns,
        rows: table.rows,
        sort: null,
        filters: [],
        formats: [],
      });
      notify(
        table.notes.length
          ? table.notes[0]
          : `Imported ${table.rows.length} rows from ${chosen.name}`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "That file couldn't be read.");
    }
  };

  return (
    <span className="relative flex items-center">
      <input
        ref={file}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen) void onFile(chosen);
        }}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[10.5px] transition-colors duration-150",
          open ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg",
        )}
      >
        <Icon name="table" size={10} />
        Data
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute top-full right-0 z-50 mt-1 w-[230px] overflow-hidden rounded-md border border-line bg-surface-2 py-1 shadow-lg">
            <Item
              label="Import a spreadsheet…"
              hint=".xlsx or .csv — replaces this table"
              onSelect={() => {
                setOpen(false);
                file.current?.click();
              }}
            />
            <div className="my-1 border-t border-line" />
            <Item
              label="Export as .xlsx"
              hint="Opens in Excel, Numbers, Sheets"
              onSelect={() => {
                setOpen(false);
                download(
                  `${name}.xlsx`,
                  buildXlsx([sheetOut(name, block.columns, block.rows)]) as BlobPart,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
                notify(`Saved ${name}.xlsx`);
              }}
            />
            <Item
              label="Export the whole workbook"
              hint={`${sheetsOf(blocks ?? []).length} sheets, one file`}
              onSelect={() => {
                setOpen(false);
                const all = sheetsOf(blocks ?? []).map((s) =>
                  sheetOut(s.name, s.columns, s.rows),
                );
                download(
                  "workbook.xlsx",
                  buildXlsx(all) as BlobPart,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
                notify(`Saved workbook.xlsx — ${all.length} sheets`);
              }}
            />
            <Item
              label="Export as .csv"
              hint="One table, plain text"
              onSelect={() => {
                setOpen(false);
                download(
                  `${name}.csv`,
                  toCsv(
                    block.columns.map((c) => c.name),
                    exportRows(),
                  ),
                  "text/csv;charset=utf-8",
                );
                notify(`Saved ${name}.csv`);
              }}
            />
            <div className="my-1 border-t border-line" />
            <Item
              label="Summarise…"
              hint="Group by a column and add up another"
              onSelect={() => {
                setOpen(false);
                setPivoting(true);
              }}
            />
          </div>
        </>
      )}

      {pivoting && (
        <PivotEditor
          projectId={projectId}
          source={block}
          onClose={() => setPivoting(false)}
        />
      )}
    </span>
  );
}

function Item({
  label,
  hint,
  onSelect,
}: {
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-3"
    >
      <span className="block text-[12.5px] text-fg">{label}</span>
      <span className="block text-[11px] text-fg-subtle">{hint}</span>
    </button>
  );
}
