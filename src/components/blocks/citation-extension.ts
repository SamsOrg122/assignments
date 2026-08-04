import { Node, mergeAttributes } from "@tiptap/core";

/**
 * An inline citation.
 *
 * Stored as an atom carrying the source id plus the rendered label. Keeping the
 * label in the document (rather than deriving it at render time) means the HTML
 * round-trips through copy/paste and export intact; keeping the id alongside it
 * means the label can be *re-derived* whenever the citation style or the source
 * itself changes. `refreshCitations` in the store does exactly that.
 */
export const Citation = Node.create({
  name: "citation",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-citation"),
        renderHTML: (attrs) =>
          attrs.sourceId ? { "data-citation": attrs.sourceId } : {},
      },
      label: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        // The label is the node's text content, not an attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "citation" }),
      node.attrs.label || "(citation)",
    ];
  },

  renderText({ node }) {
    return node.attrs.label || "";
  },
});
