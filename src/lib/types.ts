/**
 * Domain model.
 *
 * A Project is the top-level unit — not a file. It opens as one continuous
 * canvas of Blocks. Blocks reference each other by id (see ChartBlock.sourceId),
 * which is what makes "the same data in multiple places" work: there is exactly
 * one copy of the data, and every view reads from it.
 */

export type BlockType =
  | "text"
  | "table"
  | "chart"
  | "slides"
  | "code"
  | "bibliography";

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

/** Explicit layout beats the inferred one when the author sets it. */
export type SlideLayout = "auto" | "title" | "statement" | "bullets" | "split";

export interface Slide {
  id: string;
  title: string;
  bullets: string[];
  note?: string;
  layout?: SlideLayout;
}

/**
 * Deck styling. Opinionated presets rather than a formatting surface: pick a
 * look, don't assemble one. Each preset resolves to CSS custom properties the
 * slide renderer reads, so adding one is a data change.
 */
export type DeckThemeName =
  | "ink"
  | "paper"
  | "editorial"
  | "signal"
  | "slate";

export interface DeckStyle {
  theme: DeckThemeName;
  /** Type scale multiplier — the same deck, louder or quieter. */
  scale: number;
  /** Where titles sit on the slide. */
  align: "left" | "centre";
  /** Show the accent rule under titles. */
  rule: boolean;
  /** Slide numbers in the corner. */
  numbers: boolean;
  /** Text shown in the footer of every slide. */
  footer?: string;
}

export const DEFAULT_DECK_STYLE: DeckStyle = {
  theme: "ink",
  scale: 1,
  align: "left",
  rule: true,
  numbers: false,
};

export interface SlidesBlock extends BlockBase {
  type: "slides";
  slides: Slide[];
  style?: DeckStyle;
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

/* ── Sources & citations ────────────────────────────────── */

export type CitationStyle = "apa" | "mla" | "chicago" | "harvard";

export type SourceKind =
  | "article"
  | "book"
  | "chapter"
  | "web"
  | "report"
  | "thesis";

/**
 * One entry in the project's source list. Deliberately CSL-ish: these are the
 * fields every citation style needs, so a real metadata service (Crossref,
 * OpenLibrary, Zotero) can populate them without the model changing.
 */
export interface Source {
  id: string;
  kind: SourceKind;
  /** Family names, in author order. `given` is optional — many feeds omit it. */
  authors: Array<{ family: string; given?: string }>;
  title: string;
  /** Journal, book or site name. */
  container?: string;
  publisher?: string;
  year?: number;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  accessed?: number;
  /** What the user pasted, kept so a better resolver can re-parse it later. */
  raw?: string;
  /** Fields the resolver guessed rather than read. Shown as "check this". */
  uncertain?: string[];
}

/**
 * A bibliography block renders the project's sources — it holds no data of its
 * own, so it can never drift from the source list.
 */
export interface BibliographyBlock extends BlockBase {
  type: "bibliography";
  /** Only cited sources, or everything collected. */
  scope: "cited" | "all";
}

/* ── Version history ────────────────────────────────────── */

/**
 * A point-in-time copy of a project's blocks. Snapshots are coalesced while
 * you type and capped, so history is a scrubbable timeline rather than an
 * unbounded log.
 */
export interface Snapshot {
  id: string;
  at: number;
  /** Total words at that moment — the timeline's y-axis. */
  words: number;
  /** What changed, in a few words. */
  label: string;
  blocks: Block[];
}

export type Block =
  | TextBlock
  | TableBlock
  | ChartBlock
  | SlidesBlock
  | CodeBlock
  | BibliographyBlock;

/* ── Board ──────────────────────────────────────────────── */

/**
 * Board items live in *world* coordinates on an infinite plane. Pan and zoom
 * are view state and never touch the document, so two people looking at the
 * same board from different positions are still editing the same thing.
 */
export interface BoardItemBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stacking order. Bumped to the top when an item is grabbed. */
  z: number;
}

export interface BoardTextItem extends BoardItemBase {
  kind: "text";
  text: string;
}

export interface BoardStickyItem extends BoardItemBase {
  kind: "sticky";
  text: string;
  /** A small fixed set — free colour choice would wreck the palette. */
  tone: "neutral" | "accent" | "mint" | "warn";
}

export interface BoardImageItem extends BoardItemBase {
  kind: "image";
  /** Data URL. Empty means the drop target is still waiting. */
  src: string;
  alt: string;
}

/**
 * A live window onto a Library project. It stores only the id, so the card
 * always reflects the real project — the "drop in" half of the bridge.
 */
export interface BoardCardItem extends BoardItemBase {
  kind: "card";
  projectId: string;
}

export type BoardItem =
  | BoardTextItem
  | BoardStickyItem
  | BoardImageItem
  | BoardCardItem;

export type BoardItemKind = BoardItem["kind"];

/* ── Project ────────────────────────────────────────────── */

/**
 * What a project *is*. Drives which editor opens and how it reads in the
 * Library. A Board is just another project type, so a user can keep many.
 */
export type ProjectKind =
  | "doc"
  | "notes"
  | "deck"
  | "board"
  | "code"
  | "design";

/**
 * Continuous typography controls for writing projects. Word offers a fixed
 * handful of values; these are real numbers with good presets on top.
 */
export interface Typography {
  /** Line length in characters — 60–75 is the readable band. */
  measure: number;
  lineHeight: number;
  /** em. Negative tightens. */
  letterSpacing: number;
  fontSize: number;
  family: "sans" | "serif" | "mono";
  /** Vertical page padding, in px. */
  margin: number;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  measure: 68,
  lineHeight: 1.75,
  letterSpacing: -0.003,
  fontSize: 17,
  family: "serif",
  margin: 64,
};

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Single glyph shown in the sidebar and on Library rows. */
  glyph: string;
  createdAt: number;
  updatedAt: number;
  /** Stacked blocks — doc, notes, deck, code. */
  blocks: Block[];
  /** Spatial items — board projects only. */
  board: BoardItem[];
  /** Last board viewport. View state, persisted as a convenience. */
  viewport?: { x: number; y: number; scale: number };
  /** Per-project typography for writing projects. */
  typography?: Typography;
  /** Word target for the whole project; sections can override. */
  wordGoal?: number;
  /** Per-section targets, keyed by the section's block id. */
  sectionGoals?: Record<string, number>;

  /** Collected sources, and the style the bibliography renders in. */
  sources?: Source[];
  citationStyle?: CitationStyle;

  /** Scrubbable history. Newest last. */
  history?: Snapshot[];
  /**
   * Set when this project was promoted off a board, so the origin card keeps
   * mirroring it — the other half of the bridge.
   */
  promotedFrom?: { boardId: string; itemId: string };
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
