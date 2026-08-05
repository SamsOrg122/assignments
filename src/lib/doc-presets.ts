/**
 * Document presets.
 *
 * A preset is a whole setting, not a starting point: face, measure, leading,
 * spacing, alignment and paper chosen together, because those decisions are
 * only right in combination. Justified text without hyphenation opens rivers;
 * indented paragraphs with a paragraph gap does both jobs at once and looks
 * like neither.
 *
 * The fine controls stay available underneath. The preset is there so nobody
 * *has* to touch them.
 */

import { DEFAULT_TYPOGRAPHY, type Typography } from "./types";

export interface DocPreset {
  id: string;
  name: string;
  hint: string;
  values: Typography;
}

export const DOC_PRESETS: DocPreset[] = [
  {
    id: "thesis",
    name: "Thesis",
    hint: "Serif, generous leading, wide margins",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 68,
      lineHeight: 1.8,
      letterSpacing: -0.003,
      fontSize: 18,
      family: "serif",
      margin: 72,
      paragraphSpacing: 0.9,
    },
  },
  {
    id: "book",
    name: "Book",
    hint: "Justified and indented, on warm paper",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 62,
      lineHeight: 1.72,
      letterSpacing: 0,
      fontSize: 18.5,
      family: "serif",
      margin: 96,
      align: "justify",
      hyphenate: true,
      firstLineIndent: true,
      paragraphSpacing: 0,
      paper: "warm",
    },
  },
  {
    id: "report",
    name: "Report",
    hint: "Sans, tighter, headings pulled back",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 74,
      lineHeight: 1.65,
      letterSpacing: -0.006,
      fontSize: 15.5,
      family: "sans",
      margin: 48,
      paragraphSpacing: 0.75,
      headingScale: 0.92,
    },
  },
  {
    id: "manuscript",
    name: "Manuscript",
    hint: "Double-spaced, on a white sheet",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 62,
      lineHeight: 2,
      letterSpacing: 0,
      fontSize: 18,
      family: "serif",
      margin: 88,
      paragraphSpacing: 0,
      firstLineIndent: true,
      paper: "sheet",
    },
  },
  {
    id: "notes",
    name: "Notes",
    hint: "Sans, dense, easy to scan",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 82,
      lineHeight: 1.6,
      letterSpacing: -0.004,
      fontSize: 15,
      family: "sans",
      margin: 36,
      paragraphSpacing: 0.7,
      headingScale: 0.9,
    },
  },
  {
    id: "draft",
    name: "Draft",
    hint: "Mono, for seeing structure",
    values: {
      ...DEFAULT_TYPOGRAPHY,
      measure: 80,
      lineHeight: 1.7,
      letterSpacing: 0,
      fontSize: 14,
      family: "mono",
      margin: 40,
      paragraphSpacing: 0.8,
      paper: "night",
    },
  },
];

/** Which preset a document currently matches, if any. */
export function matchPreset(t: Typography): DocPreset | undefined {
  const keys: Array<keyof Typography> = [
    "measure",
    "lineHeight",
    "letterSpacing",
    "fontSize",
    "family",
    "margin",
    "align",
    "hyphenate",
    "paragraphSpacing",
    "firstLineIndent",
    "headingScale",
    "paper",
  ];
  return DOC_PRESETS.find((p) =>
    keys.every((k) => {
      const a = p.values[k] ?? DEFAULT_TYPOGRAPHY[k];
      const b = t[k] ?? DEFAULT_TYPOGRAPHY[k];
      return a === b;
    }),
  );
}

/** The custom properties a document's typography resolves to. */
export function proseVars(t: Typography): React.CSSProperties {
  return {
    "--prose-size": `${t.fontSize}px`,
    "--prose-leading": String(t.lineHeight),
    "--prose-tracking": `${t.letterSpacing}em`,
    "--prose-align": t.align ?? "left",
    "--prose-hyphens": t.hyphenate ? "auto" : "manual",
    "--prose-para-gap": `${t.paragraphSpacing ?? 0.85}em`,
    "--prose-heading-scale": String(t.headingScale ?? 1),
  } as React.CSSProperties;
}
