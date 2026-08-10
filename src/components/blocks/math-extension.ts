import { Node, mergeAttributes } from "@tiptap/core";
import { renderMath } from "@/lib/math";

/**
 * An equation in the prose.
 *
 * An atom carrying LaTeX. The rendering is produced by a node view rather than
 * stored, for the same reason note numbers are not stored: the moment a
 * rendered copy lives in the document, it is a copy that can disagree with the
 * source. Here the disagreement would be silent and wrong in a way only a
 * mathematician notices.
 *
 * Display maths is an attribute rather than a second node type. `$x$` and
 * `$$x$$` are the same equation shown two ways, and splitting them into two
 * nodes would mean two of everything downstream for no gain.
 */
export const MathNode = Node.create({
  name: "math",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-math") ?? "",
        renderHTML: (attrs) => ({ "data-math": String(attrs.latex ?? "") }),
      },
      display: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-display") === "true",
        renderHTML: (attrs) =>
          attrs.display ? { "data-display": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // Empty on purpose: the source is in the attribute and the rendering is
    // made where it is shown. See `renderMathIn`.
    return ["span", mergeAttributes(HTMLAttributes, { class: "math" })];
  },

  renderText({ node }) {
    return String(node.attrs.latex ?? "");
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      // An atom's rendering is not text you can put a caret inside. Without
      // this the browser lets you click into KaTeX's own spans, and the click
      // never reaches the editor as "you clicked this node".
      dom.contentEditable = "false";
      dom.className = node.attrs.display ? "math math-display" : "math";
      dom.setAttribute("data-math", String(node.attrs.latex ?? ""));
      if (node.attrs.display) dom.setAttribute("data-display", "true");

      const draw = (latex: string, display: boolean) => {
        const { html, problem } = renderMath(latex, display);
        if (problem) {
          dom.textContent = latex || "empty equation";
          dom.classList.add("math-broken");
          dom.title = problem;
        } else {
          dom.classList.remove("math-broken");
          dom.title = latex;
          // KaTeX's own output, built from the source we just handed it —
          // not markup from a document, so there is nothing here to sanitise.
          dom.innerHTML = html;
        }
      };

      draw(String(node.attrs.latex ?? ""), Boolean(node.attrs.display));

      return {
        dom,
        /*
         * KaTeX writes its own markup into this element. ProseMirror watches
         * the editor's DOM for changes it did not make and re-reads the
         * document when it sees any — so without this, every render looks like
         * the user editing the equation by hand, and the node view is torn
         * down and rebuilt underneath the click that opened it.
         */
        ignoreMutation: () => true,
        update(updated) {
          if (updated.type.name !== "math") return false;
          draw(
            String(updated.attrs.latex ?? ""),
            Boolean(updated.attrs.display),
          );
          return true;
        },
      };
    };
  },
});
