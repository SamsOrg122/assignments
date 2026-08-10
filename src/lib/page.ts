/**
 * How the document sits on paper.
 *
 * Screen and paper are different media and this app has always been a screen
 * first — but a thesis is handed in on paper, and the requirements are
 * literally page-shaped: "A4, 2.5 cm margins, page number bottom right". Not
 * being able to say that was the single most common reason to give up and
 * paste everything into Word at the end.
 *
 * What is honest about each target:
 *
 *   - **Paper size, orientation and margins** work everywhere. `@page` carries
 *     them, and browsers honour it when printing.
 *   - **Headers, footers and page numbers do not work in a browser print.**
 *     CSS has margin boxes (`@top-center`, `counter(page)`) and no shipping
 *     engine implements them. They are stored here and written into the Word
 *     export, which has real headers and a real page field. Anything else
 *     would be a setting that silently does nothing.
 */

export type PaperSize = "a4" | "letter" | "legal";
export type Orientation = "portrait" | "landscape";
export type PageNumbers =
  | "none"
  | "footer-right"
  | "footer-centre"
  | "header-right";

export interface PageSetup {
  size: PaperSize;
  orientation: Orientation;
  /** Millimetres, because that is what a course handbook states them in. */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Repeated at the top of every page. Word only. */
  header?: string;
  /** Repeated at the foot. Word only. */
  footer?: string;
  numbers: PageNumbers;
  /** First page number. A chapter that continues from another document. */
  startAt?: number;
}

export const DEFAULT_PAGE: PageSetup = {
  size: "a4",
  orientation: "portrait",
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
  numbers: "none",
};

/** Millimetres, portrait. Landscape swaps them. */
const SIZES: Record<PaperSize, { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: "A4" },
  letter: { width: 216, height: 279, label: "Letter" },
  legal: { width: 216, height: 356, label: "Legal" },
};

export const paperLabel = (size: PaperSize) => SIZES[size].label;

export function paperSize(page: PageSetup): { width: number; height: number } {
  const { width, height } = SIZES[page.size];
  return page.orientation === "landscape"
    ? { width: height, height: width }
    : { width, height };
}

/** The width a line of text actually gets, in millimetres. */
export const textWidth = (page: PageSetup) =>
  paperSize(page).width - page.margins.left - page.margins.right;

/** `@page` for print and PDF. The part a browser genuinely honours. */
export function pageCss(page: PageSetup): string {
  const { width, height } = paperSize(page);
  const m = page.margins;
  return `@page { size: ${width}mm ${height}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
}

/** Whether anything here only shows up in a Word file. */
export const wordOnly = (page: PageSetup) =>
  Boolean(page.header?.trim() || page.footer?.trim() || page.numbers !== "none");
