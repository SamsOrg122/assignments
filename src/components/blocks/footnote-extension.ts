import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A footnote marker.
 *
 * The note text travels *inside the marker*, not in a side table keyed by id.
 * That is the decision everything else here follows from: cut a paragraph and
 * paste it into another document and the note comes with it, because it was
 * never anywhere else. A registry would leave the marker pointing at nothing,
 * and the failure would be invisible until someone printed.
 *
 * The number is deliberately *not* stored. Numbering is document order, and
 * document order changes whenever a paragraph moves or a note is inserted
 * above another one — a stored number would be wrong within a minute of real
 * use. It is computed as a decoration instead, which recomputes on every edit
 * and costs nothing to keep right.
 *
 * A CSS counter would do the same job with less code, and was the first
 * attempt. It renders a number that exists only in the stylesheet: a screen
 * reader announces nothing, copied text carries nothing, and no test can read
 * it. A number a person cannot hear is not a number.
 *
 * Each editor only holds one block, so the count has to start somewhere —
 * `base` is how many notes stand in front of this block. Export recomputes the
 * whole sequence the same way; see `lib/notes.ts`.
 *
 * The note is plain text. Rich notes would mean a nested editor inside an
 * attribute, and the honest version of that is a lot more than a footnote is
 * worth here — a note that needs a table is a paragraph.
 */
/**
 * How many notes stand in front of this block.
 *
 * Kept in the editor's own state rather than in a React ref the plugin closes
 * over: a transaction carrying it is something ProseMirror already knows how
 * to react to, so the decorations recompute on their own. Dispatch
 * `tr.setMeta(footnoteBase, n)` when the count changes.
 */
export const footnoteBase = new PluginKey<number>("footnote-base");

export const Footnote = Node.create({
  name: "footnote",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-footnote"),
        renderHTML: (attrs) =>
          attrs.noteId ? { "data-footnote": attrs.noteId } : {},
      },
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note") ?? "",
        renderHTML: (attrs) => ({ "data-note": attrs.text ?? "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // No text content. The number is a decoration, so writing one here would
    // bake a second, disagreeing number into the saved HTML.
    return [
      "sup",
      mergeAttributes(HTMLAttributes, {
        class: "footnote-ref",
        title: HTMLAttributes["data-note"] || "Note",
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<number>({
        key: footnoteBase,
        state: {
          init: () => 0,
          apply: (tr, value) => tr.getMeta(footnoteBase) ?? value,
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            let n = footnoteBase.getState(state) ?? 0;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "footnote") return;
              n += 1;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  "data-n": String(n),
                  // Announced instead of the silence a bare superscript gives.
                  "aria-label": `Note ${n}: ${node.attrs.text || "empty"}`,
                  role: "button",
                }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  renderText() {
    // Copying prose out should not silently drop the note, and it should not
    // claim a number that only means anything inside this document either.
    return "[note]";
  },
});
