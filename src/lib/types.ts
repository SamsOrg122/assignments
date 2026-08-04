/**
 * Domain model.
 *
 * A Project is the top-level unit — not a file. It opens as one continuous
 * canvas of Blocks. Blocks reference each other by id (see ChartBlock.sourceId),
 * which is what makes "the same data in multiple places" work: there is exactly
 * one copy of the data, and every view reads from it.
 */

export type BlockType = "text" | "table" | "chart" | "slides" | "code";

export interface BlockBase {
  id: string;
  type: BlockType;
  /** Optional human label, shown in the gutter and in the ⌘K "jump to" list. */
  title?: string;
}

/* ── Text ───────────────────────────────────────────────── */

export interface TextBlock extends BlockBase {
  type: "text";
  /** ProseMirror-serialised HTML. */
  html: string;
}

/* ── Table ──────────────────────────────────────────────── */

export type ColumnType = "text" | "number" | "date" | "formula";

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** Row-level expression for `type: "formula"`, e.g. `[units] * [price]`. */
  formula?: string;
  width?: number;
}

export type CellValue = string | number | null;

export interface Row {
  id: string;
  /** Keyed by Column.id. Formula columns are not stored — they're derived. */
  cells: Record<string, CellValue>;
}

export interface TableBlock extends BlockBase {
  type: "table";
  columns: Column[];
  rows: Row[];
  /** View-only sort. Never mutates row order in the source data. */
  sort?: { columnId: string; dir: "asc" | "desc" } | null;
}

/* ── Chart ──────────────────────────────────────────────── */

export type ChartKind = "line" | "bar" | "area" | "pie";

export interface ChartBlock extends BlockBase {
  type: "chart";
  /** Id of the TableBlock this chart is bound to. Null until bound. */
  sourceId: string | null;
  kind: ChartKind;
  xColumnId: string | null;
  yColumnIds: string[];
}

/* ── Slides ─────────────────────────────────────────────── */

export interface Slide {
  id: string;
  title: string;
  bullets: string[];
  note?: string;
}

export interface SlidesBlock extends BlockBase {
  type: "slides";
  slides: Slide[];
}

/* ── Code ───────────────────────────────────────────────── */

export type CodeLanguage = "html" | "css" | "javascript" | "typescript" | "json";

export interface CodeFile {
  id: string;
  name: string;
  language: CodeLanguage;
  content: string;
}

export interface CodeBlock extends BlockBase {
  type: "code";
  files: CodeFile[];
  activeFileId: string;
  /** Whether the live web preview pane is open. */
  preview: boolean;
}

export type Block =
  | TextBlock
  | TableBlock
  | ChartBlock
  | SlidesBlock
  | CodeBlock;

/* ── Project ────────────────────────────────────────────── */

export interface Project {
  id: string;
  name: string;
  /** Single emoji shown in the sidebar and on the home grid. */
  glyph: string;
  createdAt: number;
  updatedAt: number;
  blocks: Block[];
}

/* ── Collaboration ──────────────────────────────────────── */

export interface Collaborator {
  id: string;
  name: string;
  /** Hex colour used for their cursor, selection and avatar ring. */
  color: string;
  initials: string;
}

export interface PeerState {
  user: Collaborator;
  /** Cursor in canvas-relative coordinates, normalised 0..1 on x. */
  cursor: { x: number; y: number } | null;
  /** Block the peer is currently working in, if any. */
  activeBlockId: string | null;
  /** Short verb shown in the block-presence chip, e.g. "editing". */
  activity: string | null;
}
