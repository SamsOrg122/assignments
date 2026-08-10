/**
 * Equations.
 *
 * The source of truth is the LaTeX, stored in an attribute. Everything on
 * screen is rendered from it, so an equation can never drift from what was
 * typed, and a document that outlives this renderer still carries the maths
 * rather than a picture of it.
 *
 * Two renderings, on purpose:
 *
 *   - On screen, KaTeX's HTML — it is what the library is good at, and the
 *     stylesheet and fonts are already in the bundle.
 *   - In an exported file, MathML only. It needs no stylesheet and no fonts,
 *     so a `.html` handed to somebody renders correctly on its own, and Word
 *     reads MathML as a real equation rather than as broken markup.
 */

import katex from "katex";

export interface MathRender {
  html: string;
  /** Set when the LaTeX doesn't parse, so the editor can say what is wrong. */
  problem?: string;
}

/** For the screen. KaTeX HTML plus the MathML it ships for screen readers. */
export function renderMath(latex: string, display = false): MathRender {
  const source = latex.trim();
  if (!source) return { html: "", problem: "Nothing to render yet." };
  try {
    return {
      html: katex.renderToString(source, {
        displayMode: display,
        throwOnError: true,
        strict: false,
        // KaTeX's own guard against `\def`-style expansion bombs.
        maxExpand: 1000,
        trust: false,
      }),
    };
  } catch (error) {
    return {
      html: "",
      problem: error instanceof Error ? error.message : "That didn't parse.",
    };
  }
}

/** For an exported file: no stylesheet, no fonts, still an equation. */
export function renderMathML(latex: string, display = false): string {
  const source = latex.trim();
  if (!source) return "";
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: true,
      strict: false,
      output: "mathml",
      trust: false,
    });
  } catch {
    // A formula that doesn't parse still has to leave the building. The source
    // is the document; dropping it because a renderer disagreed would be the
    // worst possible trade.
    return `<code>${source.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code>`;
  }
}

const MARKER = /<span\b[^>]*\bdata-math="[^"]*"[^>]*>(?:[\s\S]*?<\/span>)?/gi;

const attr = (tag: string, name: string): string => {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  if (!match) return "";
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
};

/** Swap every marker in a block for real maths. Used by export and the viewer. */
export function renderMathIn(html: string, forExport = false): string {
  if (!html.includes("data-math")) return html;
  return html.replace(MARKER, (tag) => {
    const latex = attr(tag, "data-math");
    const display = /data-display="true"/.test(tag);
    if (forExport) return renderMathML(latex, display);
    const { html: rendered, problem } = renderMath(latex, display);
    return problem
      ? `<code class="math-broken" title="${problem.replace(/"/g, "&quot;")}">${latex}</code>`
      : rendered;
  });
}

/** Equations as their source, for anything reading the document as text. */
export const mathToText = (html: string) =>
  html.replace(MARKER, (tag) => ` ${attr(tag, "data-math")} `);
