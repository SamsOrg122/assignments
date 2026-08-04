import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * A deliberately quiet syntax palette: one accent for keywords, off-white for
 * identifiers, and muted greys for everything structural. Editors that light up
 * like a Christmas tree fight the rest of this UI.
 */
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "#7aa2ff" },
  { tag: [t.name, t.deleted, t.character, t.propertyName], color: "#ededed" },
  { tag: [t.function(t.variableName), t.labelName], color: "#c9d6ff" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#8fd6b4" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#d9a441" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#5c5c5c", fontStyle: "italic" },
  { tag: [t.tagName], color: "#7aa2ff" },
  { tag: [t.attributeName], color: "#c46be0" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "#8a8a8a" },
  { tag: [t.typeName, t.className, t.definition(t.typeName)], color: "#e3c08d" },
  { tag: t.invalid, color: "#e5484d" },
  { tag: t.link, color: "#3d7dff", textDecoration: "underline" },
  { tag: [t.heading, t.strong], color: "#ededed", fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
]);

const view = EditorView.theme(
  {
    "&": { color: "#ededed", backgroundColor: "transparent" },
    ".cm-content": { caretColor: "#3d7dff", padding: "10px 0" },
    ".cm-line": { padding: "0 12px" },
    ".cm-gutterElement": { padding: "0 8px 0 12px" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "rgba(61,125,255,0.18)",
      outline: "none",
    },
    ".cm-tooltip": {
      backgroundColor: "#1c1c1c",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "rgba(61,125,255,0.18)",
      color: "#ededed",
    },
  },
  { dark: true },
);

export const codeTheme = [view, syntaxHighlighting(highlight)];
