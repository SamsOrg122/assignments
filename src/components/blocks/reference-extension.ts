import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A cross-reference — "see figure 3".
 *
 * Stores only what it points *at*. The words it renders are derived, because
 * the number changes whenever anything is inserted above the target, and a
 * reference that says 3 while the caption says 4 is worse than no reference:
 * it is confidently wrong, and a reader trusts it.
 *
 * Same shape as the footnote marker, for the same reason. Labels arrive by
 * transaction because a block's editor cannot see the figures in other blocks.
 */
export const referenceLabels = new PluginKey<Record<string, string>>(
  "reference-labels",
);

export const Reference = Node.create({
  name: "reference",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-ref"),
        renderHTML: (attrs) =>
          attrs.targetId ? { "data-ref": attrs.targetId } : {},
      },
      /**
       * The label as it read when it was written.
       *
       * Carried as an attribute rather than as the span's text so there is
       * exactly one thing on screen: the decoration overwrites this attribute
       * with the current number, and CSS renders whichever is there. A node
       * with text content *and* a decoration would show both.
       *
       * It still matters when nothing is decorating — a copied fragment, the
       * raw markup — so it is written correctly at insert time.
       */
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label ?? "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "xref" })];
  },

  renderText({ node }) {
    return node.attrs.label || "reference";
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Record<string, string>>({
        key: referenceLabels,
        state: {
          init: () => ({}),
          apply: (tr, value) => tr.getMeta(referenceLabels) ?? value,
        },
        props: {
          decorations(state) {
            const labels = referenceLabels.getState(state) ?? {};
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "reference") return;
              const label = labels[node.attrs.targetId as string];
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  "data-label": label ?? "[missing reference]",
                  class: label ? "xref" : "xref xref-missing",
                }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
