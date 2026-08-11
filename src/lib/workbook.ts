/**
 * The project, seen as a workbook.
 *
 * A spreadsheet's tabs had to come from somewhere, and inventing a
 * workbook-inside-a-block would have meant two kinds of table with two sets of
 * bugs. The tables in a project already *are* its sheets: they are stacked in
 * one document, they belong to one piece of work, and they already have names.
 * So `Costs!B2:B40` and `[Costs]![Amount]` address the table titled "Costs" in
 * the same project, and the tab strip above a table is the list of them.
 *
 * The only thing this file adds is that every table is guaranteed a *usable*
 * name. An untitled one is "Sheet 2" by position, and two tables that happen
 * to share a title are disambiguated, because a formula that resolves to
 * whichever of two tables happened to be first is worse than one that fails.
 */

import type { Block, Project, TableBlock } from "./types";
import type { NamedRange, Sheet, Workbook } from "./formula";

export type { NamedRange, Sheet, Workbook };

const isTable = (block: Block): block is TableBlock => block.type === "table";

/** The tables of a project, in document order, each with a settled name. */
export function sheetsOf(blocks: Block[]): Sheet[] {
  const tables = blocks.filter(isTable);
  const taken = new Set<string>();
  return tables.map((table, index) => {
    const wanted = (table.title ?? "").trim() || `Sheet ${index + 1}`;
    let name = wanted;
    let n = 2;
    // Two sheets called the same thing would make every reference to that name
    // a coin flip. Numbering the later one is visible and harmless.
    while (taken.has(name.toLowerCase())) name = `${wanted} (${n++})`;
    taken.add(name.toLowerCase());
    return { id: table.id, name, columns: table.columns, rows: table.rows };
  });
}

/** Everything a formula in this project can reach. */
export function workbookOf(project: Project | undefined): Workbook {
  if (!project) return { sheets: [] };
  return { sheets: sheetsOf(project.blocks), names: project.names ?? [] };
}

/** The name a given table answers to in formulas. */
export function sheetName(blocks: Block[], blockId: string): string {
  return sheetsOf(blocks).find((s) => s.id === blockId)?.name ?? "Sheet 1";
}

/**
 * Whether a name can be used as a named range.
 *
 * Deliberately strict. A name with a space in it cannot be told apart from two
 * names; one shaped like `B7` collides with a cell; one that matches a
 * function collides with a call.
 */
export function checkRangeName(
  name: string,
  existing: NamedRange[],
  selfId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give it a name.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed))
    return "Letters, digits and underscores only, starting with a letter.";
  if (/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$/.test(trimmed))
    return `"${trimmed}" is a cell address, so it can't also be a name.`;
  if (
    existing.some(
      (n) => n.id !== selfId && n.name.toLowerCase() === trimmed.toLowerCase(),
    )
  )
    return `There's already a name called "${trimmed}".`;
  return null;
}
