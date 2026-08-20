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
  | "image"
  | "bibliography"
  | "toc"
  | "form";

export interface BlockBase {
  id: string;
  type: BlockType;
  /** Optional human label, shown in the gutter and in the ⌘K "jump to" list. */
  title?: string;
  /**
   * Pinned discussion, in the same shape a board item uses.
   *
   * On the block rather than on a range of text: a comment anchored to a
   * character offset is a comment that ends up attached to the wrong sentence
   * the first time somebody edits above it, and there is no honest way to keep
   * it in place without a CRDT. A block is a thing that survives editing.
   */
  comments?: BoardComment[];
}

/* ── Text ───────────────────────────────────────────────── */

export interface TextBlock extends BlockBase {
  type: "text";
  /** ProseMirror-serialised HTML. */
  html: string;
}

/* ── Table ──────────────────────────────────────────────── */

export type ColumnType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "checkbox"
  | "select"
  | "formula";

/** The types whose cells hold numbers and can feed charts and aggregates. */
export const NUMERIC_COLUMN_TYPES: ReadonlySet<ColumnType> = new Set([
  "number",
  "currency",
  "percent",
  "formula",
]);

/**
 * What a column will accept.
 *
 * A choice column already limits what can be picked; this is for everything
 * else a form has always been able to say — must be filled in, has to be a
 * date, has to be between one and ten, has to be unique. Entry is never
 * blocked: the value is kept and marked, because a rule that throws away
 * typing is a rule that loses work when the rule itself is wrong.
 */
export interface Validation {
  /** Cannot be left empty. */
  required?: boolean;
  /** Must parse as a number, a date, or match a pattern. */
  is?: "number" | "integer" | "date" | "email" | "url";
  /** Numeric or date bounds, inclusive. Dates as ISO strings. */
  min?: number | string;
  max?: number | string;
  /** Text length bounds. */
  minLength?: number;
  maxLength?: number;
  /** No two rows may share a value. */
  unique?: boolean;
  /** Any formula over this row; false marks the cell. */
  rule?: string;
  /** Shown instead of the generated sentence, when a rule needs explaining. */
  message?: string;
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** Row-level expression for `type: "formula"`, e.g. `[units] * [price]`. */
  formula?: string;
  width?: number;
  /** The choices a `select` column offers. Order is display order. */
  options?: string[];
  /** What this column will accept. Absent means anything. */
  validation?: Validation;
}

export type CellValue = string | number | null;

export interface Row {
  id: string;
  /** Keyed by Column.id. Formula columns are not stored — they're derived. */
  cells: Record<string, CellValue>;
}

/** One sort key. Multi-column sort is an ordered list of these. */
export interface SortKey {
  columnId: string;
  dir: "asc" | "desc";
}

export type FilterOp =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "empty"
  | "notEmpty";

export interface TableFilter {
  id: string;
  columnId: string;
  op: FilterOp;
  /** Unused for empty/notEmpty. */
  value?: string;
}

/** Conditional formatting: colour a cell when its value passes a test. */
export interface FormatRule {
  id: string;
  columnId: string;
  op: "gt" | "lt" | "eq" | "contains";
  value: string;
  tone: "accent" | "mint" | "warn" | "danger";
}

export interface TableBlock extends BlockBase {
  type: "table";
  columns: Column[];
  rows: Row[];
  /**
   * View-only sort, in priority order. Never mutates row order in the data.
   * Older documents stored a single object here; `sortsOf` normalises.
   */
  sort?: SortKey[] | { columnId: string; dir: "asc" | "desc" } | null;
  filters?: TableFilter[];
  formats?: FormatRule[];
  /** Keep the first column in view while scrolling horizontally. */
  freeze?: boolean;
  /**
   * When present, this table is a summary of another one and its columns and
   * rows are derived on every render rather than stored. Read-only, and never
   * stale — see `lib/sheet/pivot.ts` for why it is a table rather than a new
   * kind of block.
   */
  pivot?: import("./sheet/pivot").PivotSpec;
}

/** Sort as a list, whatever vintage the stored shape is. */
export function sortsOf(block: TableBlock): SortKey[] {
  if (!block.sort) return [];
  return Array.isArray(block.sort) ? block.sort : [block.sort];
}

/* ── Image ──────────────────────────────────────────────── */

/** Where a picture sits in the column, and how wide it runs. */
export type ImageAlign = "left" | "centre" | "full";
/** Edge treatment. Deliberately three, not a border editor. */
export type ImageFrame = "none" | "line" | "shadow";

export interface ImageBlock extends BlockBase {
  type: "image";
  /** Data URL, already downscaled by `prepareImage`. Empty = no picture yet. */
  src: string;
  /** Described for screen readers. Defaults to the file name. */
  alt: string;
  /** Printed under the picture. */
  caption?: string;
  /** Natural pixel size, so the placeholder reserves the right space. */
  naturalWidth?: number;
  naturalHeight?: number;
  /** Rendered width as a percentage of the column, 25–100. */
  scale?: number;
  align?: ImageAlign;
  frame?: ImageFrame;
  /** Roughly what it costs in storage. Shown so a heavy page is visible. */
  bytes?: number;
}

/* ── Form ───────────────────────────────────────────────── */

export type FormFieldKind =
  | "short"
  | "long"
  | "number"
  | "date"
  | "choice"
  | "checkboxes"
  | "scale"
  | "email";

export interface FormField {
  id: string;
  label: string;
  kind: FormFieldKind;
  /** A sentence under the question, where one is needed. */
  help?: string;
  required?: boolean;
  /** For `choice` and `checkboxes`. */
  options?: string[];
  /** Bounds: a number's range, a checkbox list's minimum, a text length cap. */
  min?: number;
  max?: number;
}

/**
 * A form, and where its answers come back to.
 *
 * The questions live here and travel inside the link; the answers live in the
 * database, because a browser cannot receive anything from somebody else's
 * browser. See `lib/forms.ts` for why that split is the whole design.
 */
export interface FormBlock extends BlockBase {
  type: "form";
  fields: FormField[];
  /** Shown above the questions on the fill-in page. */
  intro?: string;
  /** What the respondent sees after sending. */
  thanks?: string;
  /** Whether the link still accepts answers. */
  closed?: boolean;
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

/**
 * A free-form object on a slide, layered over the structured content.
 *
 * Coordinates are percentages of the slide, so an object sits in the same
 * place on the filmstrip thumbnail, the stage and the projector. Fill colours
 * are theme *roles*, not hex — a deck restyled to another theme re-inks its
 * shapes too, which is what makes one-click restyle safe.
 */
export type SlideObjectFill = "accent" | "fg" | "muted" | "surface" | "none";

export interface SlideObject {
  id: string;
  kind: "text" | "rect" | "ellipse" | "line" | "image";
  /** Percent of slide width/height, 0–100. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees. */
  rotation?: number;
  /** 0–1. */
  opacity?: number;
  z: number;
  fill?: SlideObjectFill;
  /** Border on shapes; the line kind uses it as its stroke. */
  border?: boolean;
  /** Text content, for the text kind. */
  text?: string;
  /** Text size in cqw units so it scales with the slide. */
  textSize?: number;

  /** Which build step reveals this object. 0 or absent means immediately. */
  step?: number;

  /** Data URL, for the image kind. Already downscaled by `prepareImage`. */
  src?: string;
  alt?: string;
  /**
   * How the picture meets its box. `cover` crops to fill — the right default
   * for a photograph placed as a panel; `contain` fits the whole thing in,
   * which is what a logo or a screenshot needs.
   */
  fit?: "cover" | "contain";
  /** Corner rounding, in percent of the object's shorter side. */
  radius?: number;
}

/**
 * Revealing a slide in pieces.
 *
 * Not an animation library. One thing at a time, with a soft entrance, because
 * that is what a build is *for*: keeping a room looking at the sentence being
 * said rather than reading ahead. Anything more elaborate is a distraction the
 * presenter has to operate while also talking.
 */
export type SlideBuild = "none" | "bullets" | "objects" | "both";

export interface Slide {
  id: string;
  title: string;
  bullets: string[];
  note?: string;
  layout?: SlideLayout;
  /** Free-form layer. Empty/absent for purely structured slides. */
  objects?: SlideObject[];
  /** How this slide reveals itself. Absent means all at once. */
  build?: SlideBuild;
  /** Skip the deck's master on this one — title slides usually want to. */
  bare?: boolean;
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
  /**
   * Overrides the theme's accent. A hex string, chosen from a fixed set — a
   * free colour picker is how decks end up with an accent that fights the
   * surface it sits on.
   */
  accent?: string;
  /** Surface treatment. Never louder than the type sitting on it. */
  background?: "flat" | "grain" | "glow" | "grid";
  /** How one slide gives way to the next while presenting. */
  transition?: "none" | "fade" | "rise";
  /**
   * A face from the kit, used for titles *and* body.
   *
   * The themes deliberately pair a display face with the UI sans, because a
   * body face chosen badly is unreadable from the back of a room. Bringing
   * your own overrides both — if someone has gone and found their school's
   * typeface, applying it to half the slide is not what they meant.
   */
  font?: string;
}

export const DEFAULT_DECK_STYLE: DeckStyle = {
  theme: "ink",
  scale: 1,
  align: "left",
  rule: true,
  numbers: false,
  background: "flat",
  transition: "fade",
};

/**
 * The deck's own model, which every slide inherits from.
 *
 * A theme is a preset — someone else's decisions, taken as a set. A master is
 * *yours*: the logo in the corner, the footer with the module code on it, the
 * page numbers a supervisor asked for. It is drawn behind each slide's own
 * content, so editing it changes forty slides at once, which is the entire
 * reason the concept exists.
 */
export interface SlideMaster {
  /** Drawn on every slide, behind its content. Positions are percentages. */
  objects?: SlideObject[];
  /** A line along the bottom — a module code, a name, a date. */
  footer?: string;
  /** Slide numbers, bottom right. */
  numbers?: boolean;
  /** Overrides the theme's background, where a brand needs its own. */
  background?: string;
}

export interface SlidesBlock extends BlockBase {
  type: "slides";
  slides: Slide[];
  style?: DeckStyle;
  /** Inherited by every slide that hasn't opted out with `bare`. */
  master?: SlideMaster;
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

/**
 * A contents page, derived from the document's headings every time it renders.
 *
 * It is a block rather than a fixed strip at the top because *where* it sits
 * is part of the document — after the title page, before the introduction, and
 * in an appendix sometimes twice.
 */
export interface TocBlock extends BlockBase {
  type: "toc";
  /** Deepest heading level listed. Default 3 — everything. */
  depth?: number;
}

export type Block =
  | TextBlock
  | TableBlock
  | ChartBlock
  | SlidesBlock
  | CodeBlock
  | ImageBlock
  | BibliographyBlock
  | TocBlock
  | FormBlock;

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
  /**
   * Members of the same group select and move as one. A flat id rather than a
   * tree: nested groups are a power that costs more in confusion than it pays.
   */
  groupId?: string;
  /** Locked items still render and can be commented on, but never move. */
  locked?: boolean;
  /** Pinned discussion. Anything on the board can be talked about. */
  comments?: BoardComment[];
}

export interface BoardComment {
  id: string;
  authorId: string;
  /**
   * Carried rather than looked up, for people who are not in the workspace.
   * Somebody commenting through a link has no seat in anybody's team list, so
   * an id alone would resolve to nothing on the other side and the note would
   * arrive from "Guest". The name they typed travels with the note.
   */
  authorName?: string;
  body: string;
  at: number;
  /** Emoji → the people who reacted with it. */
  reactions?: Record<string, string[]>;
  resolved?: boolean;
}

/** The small fixed palette shared by stickies, frames and connectors. */
export type BoardTone = "neutral" | "accent" | "mint" | "warn";

export const BOARD_TONES: BoardTone[] = ["neutral", "accent", "mint", "warn"];

export interface BoardTextItem extends BoardItemBase {
  kind: "text";
  text: string;
}

export interface BoardStickyItem extends BoardItemBase {
  kind: "sticky";
  text: string;
  /** A small fixed set — free colour choice would wreck the palette. */
  tone: BoardTone;
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

/**
 * A titled region. Frames always sit behind everything else and carry whatever
 * is inside them when they move, which is what makes a board readable at a
 * glance: sections instead of a field of stickies.
 */
export interface BoardFrameItem extends BoardItemBase {
  kind: "frame";
  title: string;
  tone: BoardTone;
}

export type ArrowStyle = "none" | "end" | "both";
export type ConnectorRoute = "straight" | "elbow" | "curve";

/**
 * A line between two items. It stores *ids*, never coordinates, so moving
 * either end re-routes the line instead of breaking it. Geometry (including
 * which sides to leave from) is derived at render time by `routeConnector`.
 */
export interface BoardConnectorItem extends BoardItemBase {
  kind: "connector";
  fromId: string;
  toId: string;
  label?: string;
  arrow: ArrowStyle;
  route: ConnectorRoute;
  tone: BoardTone;
  dashed?: boolean;
}

export type BoardItem =
  | BoardTextItem
  | BoardStickyItem
  | BoardImageItem
  | BoardCardItem
  | BoardFrameItem
  | BoardConnectorItem;

export type BoardItemKind = BoardItem["kind"];

/** Items a connector may attach to, and that a marquee can select by area. */
export const isPositioned = (
  i: BoardItem,
): i is Exclude<BoardItem, BoardConnectorItem> => i.kind !== "connector";

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
/** The page a document is set on. Tints the sheet, not the whole app. */
export type Paper = "canvas" | "sheet" | "warm" | "night";

export interface Typography {
  /** Line length in characters — 60–75 is the readable band. */
  measure: number;
  lineHeight: number;
  /** em. Negative tightens. */
  letterSpacing: number;
  fontSize: number;
  family: "sans" | "serif" | "mono";
  /**
   * A face brought in through the kit, overriding `family`.
   *
   * Additive rather than another member of `family`: presets compare on
   * `family`, and an older document simply doesn't have this — which is
   * exactly the shape of change that needs no migration.
   */
  fontFamily?: string;
  /** Vertical page padding, in px. */
  margin: number;

  /**
   * Justified text needs hyphenation to avoid rivers of white space, so the
   * two travel together in the presets even though they're separate switches.
   */
  align?: "left" | "justify";
  hyphenate?: boolean;
  /** Space between paragraphs, in em of the body size. */
  paragraphSpacing?: number;
  /** Indent the first line instead of spacing paragraphs — the book setting. */
  firstLineIndent?: boolean;
  /** How much bigger headings are than body text. 1 is the default ramp. */
  headingScale?: number;
  paper?: Paper;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  measure: 68,
  lineHeight: 1.75,
  letterSpacing: -0.003,
  fontSize: 17,
  family: "serif",
  margin: 64,
  align: "left",
  hyphenate: false,
  paragraphSpacing: 0.85,
  firstLineIndent: false,
  headingScale: 1,
  paper: "canvas",
};

/**
 * A place to put projects.
 *
 * Nested, because forty projects is where a flat list stops working and the
 * first thing anybody reaches for is a folder inside a folder. Folders hold
 * *only* projects and other folders — a document is never inside a document —
 * which keeps "where is this?" a single answer.
 */
export interface Folder {
  id: string;
  name: string;
  /** Null at the top level. */
  parentId: string | null;
  /**
   * Same vocabulary as a project's glyph (see `lib/avatars`): a character,
   * or a `~motif-color` animated mark. Absent draws the plain folder icon.
   */
  glyph?: string;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Single glyph shown in the sidebar and on Library rows. */
  glyph: string;
  /** Which folder it sits in. Absent or null means the top level. */
  folderId?: string | null;
  /**
   * Labels, which cut across folders on purpose.
   *
   * A project is in exactly one folder and can carry any number of labels,
   * because the two questions people ask are different: "where does this
   * live" has one answer, and "everything to do with the thesis" has many.
   */
  labels?: string[];
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

  /**
   * BCP-47 tag driving the browser's spellchecker, and what the assistant is
   * told the document is written in. Absent means the browser guesses, which
   * it does badly for anything that is not English.
   */
  language?: string;

  /** How the document sits on paper. See `lib/page.ts`. */
  page?: import("./page").PageSetup;

  /**
   * When a shared copy of this project stops opening.
   *
   * Only ever set on the copy inside a link, never on the original — see
   * `EXPIRY_IS_ADVISORY` in `lib/share.ts` for what it can and cannot do.
   */
  shareExpires?: number;
  /**
   * The room notes from a comment link go to.
   *
   * Random, and present only in a "can comment" link. The project's own id
   * would have been the obvious key and was the wrong one: every view link
   * carries that id too, so anybody ever given read access could write into
   * the owner's document and read every note left on it — for good, since a
   * link that has been sent cannot be taken back.
   */
  shareNote?: string;
  /**
   * The live session's room, for an edit or suggest link.
   *
   * Secret for the same reason `shareNote` is, and more urgently: the room was
   * the project's own id, which every view link also carries. Anybody ever
   * sent one could join the session, watch every keystroke arrive and send
   * their own — with no way for the owner to notice or to take it back.
   */
  shareRoom?: string;

  /**
   * Names standing for ranges, usable from any formula in the project.
   *
   * On the project rather than on a table: the whole point of a name is that
   * it means the same thing from wherever it is read, and one scoped to a
   * single table would be neither a name nor a range.
   */
  names?: import("./formula").NamedRange[];

  /**
   * Where notes are printed. The screen always lists them at the end — it has
   * no pages to put them at the foot of — so this only decides what an
   * exported file does.
   */
  notePlacement?: "foot" | "end";

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
