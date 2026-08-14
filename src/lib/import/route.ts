/**
 * What a dropped file is, and what to do with it.
 *
 * Kept separate from the importing itself, and kept pure. Deciding is the part
 * with all the edge cases — lock files, Apple formats, the 1997 versions of the
 * three formats we do read — and it is the part worth testing exhaustively
 * without a browser in the way.
 *
 * The rule for anything we cannot open: **name it and say why.** A bulk import
 * that quietly ignores four files out of forty is worse than one that refuses,
 * because the person finds out in the week they need chapter four. Every
 * refusal here is a sentence somebody can act on, not "unsupported file type".
 */

import type { ProjectKind } from "../types";

/** Which reader handles the file, once we know we can read it. */
export type Reader = "docx" | "pptx" | "xlsx" | "csv" | "text";

export type Route =
  | { open: true; kind: ProjectKind; reader: Reader }
  | { open: false; reason: string };

const READ: Record<string, { kind: ProjectKind; reader: Reader }> = {
  docx: { kind: "doc", reader: "docx" },
  pptx: { kind: "deck", reader: "pptx" },
  xlsx: { kind: "doc", reader: "xlsx" },
  xlsm: { kind: "doc", reader: "xlsx" },
  csv: { kind: "doc", reader: "csv" },
  tsv: { kind: "doc", reader: "csv" },
  txt: { kind: "notes", reader: "text" },
  md: { kind: "notes", reader: "text" },
  markdown: { kind: "notes", reader: "text" },
};

/*
 * The old binary formats. Not "unsupported" — they are a different file
 * format that happens to share a family name, and the fix is one step the
 * person can take, so it is the sentence they get.
 */
const LEGACY: Record<string, string> = {
  doc: "the pre-2007 Word format. Open it in Word and save it again as .docx.",
  xls: "the pre-2007 Excel format. Open it in Excel and save it again as .xlsx.",
  ppt: "the pre-2007 PowerPoint format. Open it and save it again as .pptx.",
};

const ELSEWHERE: Record<string, string> = {
  pages: "an Apple Pages file. Export it as .docx and it comes straight in.",
  numbers: "an Apple Numbers file. Export it as .xlsx and it comes straight in.",
  key: "an Apple Keynote file. Export it as .pptx and it comes straight in.",
  odt: "an OpenDocument file. Save it as .docx and it comes straight in.",
  ods: "an OpenDocument sheet. Save it as .xlsx and it comes straight in.",
  odp: "an OpenDocument deck. Save it as .pptx and it comes straight in.",
  pdf: "a PDF, which is a picture of a document rather than a document — there are no headings or tables inside it to carry over.",
};

/** Files an operating system leaves lying about, which nobody dropped on purpose. */
export function isNoise(filename: string): boolean {
  const base = filename.split("/").pop() ?? filename;
  return (
    base.startsWith(".") || // .DS_Store, .gitignore, dotfiles generally
    base.startsWith("~$") || // Word and Excel lock files
    base === "Thumbs.db" ||
    base === "desktop.ini"
  );
}

const extensionOf = (filename: string): string => {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
};

export function routeFor(filename: string): Route {
  const extension = extensionOf(filename);

  const known = READ[extension];
  if (known) return { open: true, ...known };

  const legacy = LEGACY[extension];
  if (legacy) return { open: false, reason: `.${extension} is ${legacy}` };

  const elsewhere = ELSEWHERE[extension];
  if (elsewhere) return { open: false, reason: `.${extension} is ${elsewhere}` };

  if (!extension)
    return { open: false, reason: "no file extension, so there's no telling what it is." };

  return {
    open: false,
    reason: `.${extension} isn't a format this opens. Word, Excel, PowerPoint, CSV, text and Markdown are.`,
  };
}

/**
 * The project's name.
 *
 * The extension goes, and so do the things people put in filenames to keep
 * versions apart — "final", "v3", a date — because the Library shows the date
 * itself and "Thesis final FINAL v2" is a filename, not a title. Underscores
 * become spaces for the same reason.
 */
export function projectNameFor(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const stem = dot <= 0 ? base : base.slice(0, dot);

  const cleaned = stem
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Untitled";
}

/**
 * Where the file sat, as folder names.
 *
 * A drop gives paths like `Thesis/Chapters/Three.docx`; the file itself is not
 * a folder and the leading segment a browser sometimes adds for the dropped
 * directory is kept, because that is the folder the person dragged and they
 * will look for it by name.
 */
export function folderPathOf(relativePath: string): string[] {
  return relativePath
    .split("/")
    .slice(0, -1)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
}
