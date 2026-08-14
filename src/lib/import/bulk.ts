"use client";

/**
 * A folder of Office files, turned into a Library.
 *
 * The readers for all three formats already existed and are not stubs — what
 * did not exist was a doorway. Every import lived *inside* a project you had
 * already made, and nobody switching from Office has one file. They have a
 * folder.
 *
 * Three things this owes the person running it, in order of how much it hurts
 * when they are missing:
 *
 *  1. **An account of what happened.** Every file either becomes a project or
 *     is named with a reason. An import that silently drops four files out of
 *     forty is worse than one that refuses, and the person finds out weeks
 *     later.
 *  2. **A tab that still paints.** Forty `.docx` files parsed in a row will
 *     freeze the page, and the first thing somebody does with a product is not
 *     the place to freeze. Not a worker, though: `DOMParser` doesn't exist in
 *     one and the Word reader is built on it. So this yields between files and
 *     reports progress, which is the honest version of the same thing.
 *  3. **The difference between "unreadable" and "out of room".** A browser
 *     that refuses to store any more is not a broken file, and the report says
 *     which of the two happened.
 *
 * The store is passed in rather than imported, so the interesting parts can be
 * exercised without a Library on screen.
 */

import type { Block, ProjectKind, SlidesBlock, TableBlock } from "../types";
import {
  createBlock,
  createTableBlock,
  createTextBlock,
  escapeHtml,
} from "../factories";
import { storageIsFull } from "../persistence/versioned";
import { folderPathOf, isNoise, projectNameFor, routeFor } from "./route";

export interface Incoming {
  file: File;
  /** Path as dropped, folders included: `Thesis/Chapters/Three.docx`. */
  path: string;
}

export interface Landed {
  name: string;
  projectId: string;
  kind: ProjectKind;
  /** What came across, in the person's terms. */
  detail: string;
}

export interface Refused {
  name: string;
  reason: string;
}

export interface ImportReport {
  landed: Landed[];
  refused: Refused[];
  /** Folders created to mirror what was dropped. */
  folders: number;
}

/** The parts of the project store this needs, and nothing else. */
export interface ImportSink {
  addFolder(name: string, parentId: string | null): string;
  addProject(kind: ProjectKind, name: string): string;
  setBlocks(projectId: string, blocks: Block[]): void;
  moveProject(projectId: string, folderId: string | null): void;
}

export interface Progress {
  done: number;
  total: number;
  /** The file being read right now. */
  name: string;
}

/** Everything this will attempt to open, for the file picker's `accept`. */
export const ACCEPTED =
  ".docx,.pptx,.xlsx,.xlsm,.csv,.tsv,.txt,.md,.markdown";

/* ── Turning one file into blocks ───────────────────────── */

async function blocksFromDocx(file: File) {
  const { importDocxFile } = await import("../docx/read");
  const imported = await importDocxFile(file);
  if (!imported.blocks.length) throw new Error("there was nothing in it.");
  return {
    blocks: imported.blocks,
    detail: count(imported.blocks.length, "block"),
    skipped: imported.skipped,
  };
}

async function blocksFromPptx(file: File) {
  const { importPptxFile } = await import("../pptx");
  const imported = await importPptxFile(file);
  if (!imported.slides.length) throw new Error("it has no slides.");
  const block = createBlock("slides") as SlidesBlock;
  return {
    blocks: [{ ...block, slides: imported.slides }],
    detail: count(imported.slideCount, "slide"),
    skipped: imported.skipped,
  };
}

async function blocksFromXlsx(file: File) {
  const { importXlsxFile } = await import("../sheet/xlsx");
  const workbook = await importXlsxFile(file);
  if (!workbook.sheets.length)
    throw new Error(workbook.notes[0] ?? "there are no sheets in it.");
  // One table per sheet, which is also what makes them addressable as
  // `Sheet2!A1` once they are here.
  const blocks = workbook.sheets.map((sheet) => ({
    ...createTableBlock(),
    columns: sheet.columns,
    rows: sheet.rows,
    title: sheet.name,
  })) as TableBlock[];
  return {
    blocks,
    detail: count(workbook.sheets.length, "sheet"),
    skipped: workbook.notes,
  };
}

async function blocksFromCsv(file: File) {
  const { parseCsv, gridToTable } = await import("../sheet/csv");
  const table = gridToTable(parseCsv(await file.text()));
  if (!table.rows.length) throw new Error("it has no rows.");
  return {
    blocks: [
      { ...createTableBlock(), columns: table.columns, rows: table.rows },
    ] as TableBlock[],
    detail: count(table.rows.length, "row"),
    skipped: table.notes,
  };
}

/**
 * Plain text and Markdown.
 *
 * Deliberately not a Markdown parser — headings and paragraphs, and that is
 * all. A half-built parser that gets lists nearly right is a worse outcome
 * than text that is plainly text, and the person can see immediately which
 * they got.
 */
async function blocksFromText(file: File) {
  const text = await file.text();
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!chunks.length) throw new Error("the file is empty.");

  const blocks = chunks.map((chunk) => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(chunk.split("\n")[0]);
    if (heading && chunk.split("\n").length === 1) {
      const level = heading[1].length;
      return createTextBlock(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    }
    return createTextBlock(
      `<p>${escapeHtml(chunk).replace(/\n/g, "<br>")}</p>`,
    );
  });

  return { blocks, detail: count(blocks.length, "paragraph"), skipped: [] };
}

const READERS = {
  docx: blocksFromDocx,
  pptx: blocksFromPptx,
  xlsx: blocksFromXlsx,
  csv: blocksFromCsv,
  text: blocksFromText,
} as const;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ── The run ────────────────────────────────────────────── */

export async function importAll(
  items: Incoming[],
  sink: ImportSink,
  onProgress?: (progress: Progress) => void,
): Promise<ImportReport> {
  const report: ImportReport = { landed: [], refused: [], folders: 0 };

  /* Folders are created once and reused, keyed by their path. */
  const folders = new Map<string, string>();
  const folderFor = (path: string[]): string | null => {
    let parent: string | null = null;
    let key = "";
    for (const segment of path) {
      key = key ? `${key}/${segment}` : segment;
      let id = folders.get(key);
      if (!id) {
        id = sink.addFolder(segment, parent);
        folders.set(key, id);
        report.folders++;
      }
      parent = id;
    }
    return parent;
  };

  const real = items.filter((item) => !isNoise(item.path));
  let done = 0;

  for (const item of real) {
    const shown = item.path;
    onProgress?.({ done, total: real.length, name: item.file.name });

    const route = routeFor(item.file.name);
    if (!route.open) {
      report.refused.push({ name: shown, reason: route.reason });
      done++;
      continue;
    }

    try {
      const { blocks, detail, skipped } = await READERS[route.reader](item.file);
      const projectId = sink.addProject(
        route.kind,
        projectNameFor(item.file.name),
      );
      sink.setBlocks(projectId, blocks);

      const folderId = folderFor(folderPathOf(item.path));
      if (folderId) sink.moveProject(projectId, folderId);

      report.landed.push({
        name: shown,
        projectId,
        kind: route.kind,
        detail: skipped.length ? `${detail} — ${skipped.join(", ")} not carried over` : detail,
      });
    } catch (error) {
      report.refused.push({
        name: shown,
        reason:
          error instanceof Error
            ? error.message
            : "it couldn't be read, and gave no reason.",
      });
    }

    done++;

    /*
     * Out of room is not a bad file, and everything after this point would
     * fail for the same reason — so stop and say so once, rather than
     * producing thirty identical failures.
     */
    if (storageIsFull()) {
      for (const rest of real.slice(done)) {
        report.refused.push({
          name: rest.path,
          reason: "this browser ran out of storage before reaching it.",
        });
      }
      break;
    }

    // Let the page paint between files. Without this the tab is frozen for
    // the whole run and the progress it reports never reaches the screen.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress?.({ done: real.length, total: real.length, name: "" });
  return report;
}

/* ── Getting the files out of a drop ────────────────────── */

/**
 * A dropped folder, flattened.
 *
 * `DataTransferItem.webkitGetAsEntry` is the only way to see inside a dropped
 * directory, and it is prefixed and unstandardised in every browser that has
 * it. Where it is missing, `DataTransfer.files` still holds the loose files,
 * so a drop degrades to "the files you dropped" rather than to nothing.
 */
export async function filesFromDrop(transfer: DataTransfer): Promise<Incoming[]> {
  const entries = Array.from(transfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter(Boolean) as FileSystemEntry[];

  if (!entries.length)
    return Array.from(transfer.files).map((file) => ({
      file,
      // Some browsers fill this in on a folder drop even without entries.
      path:
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name,
    }));

  const out: Incoming[] = [];
  await Promise.all(entries.map((entry) => walk(entry, "", out)));
  return out;
}

async function walk(
  entry: FileSystemEntry,
  prefix: string,
  out: Incoming[],
): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
    );
    if (file) out.push({ file, path });
    return;
  }

  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most a hundred at a time and signals the end with
  // an empty batch — a single call silently truncates a large folder.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (!batch.length) break;
    await Promise.all(batch.map((child) => walk(child, path, out)));
  }
}

/** The same shape, out of an `<input webkitdirectory>` or a plain file input. */
export function filesFromInput(list: FileList): Incoming[] {
  return Array.from(list).map((file) => ({
    file,
    // webkitRelativePath is empty for a plain multi-file pick.
    path:
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name,
  }));
}
