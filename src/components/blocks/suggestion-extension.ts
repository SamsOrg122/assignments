import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

/**
 * Suggesting instead of editing.
 *
 * Two marks and one rule. While suggesting is on, anything you type is marked
 * as *proposed* rather than written, and anything you delete is marked as
 * *proposed for removal* rather than removed. The author sees both in colour
 * and decides.
 *
 * Why marks and not a diff computed later: a diff has to guess what happened,
 * and it guesses wrong exactly where it matters — a moved sentence reads as a
 * deletion plus an unrelated insertion, and the reviewer loses the thread. A
 * mark records the intent at the moment it was formed.
 *
 * What this deliberately does not cover: deleting a whole block, or dragging
 * content between blocks. Those are not text edits, and pretending to track
 * them by leaving a ghost block behind would make the document unreadable
 * while it was being reviewed. Suggesting is turned off for structural work,
 * and the panel says so.
 */

export interface SuggestingState {
  on: boolean;
  /** Who is suggesting. Stamped onto every mark so a reviewer can tell. */
  by: string;
}

export const suggesting = new PluginKey<SuggestingState>("suggesting");

const author = {
  by: {
    default: "",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-by") ?? "",
    renderHTML: (attrs: Record<string, unknown>) => ({
      "data-by": String(attrs.by ?? ""),
    }),
  },
};

/** Proposed text. */
export const SuggestInsert = Mark.create({
  name: "suggestInsert",
  /*
   * Not inclusive. An inclusive mark spreads: type one character after an
   * accepted proposal and the mark reaches out and swallows it, so text
   * written with suggesting *off* comes out marked as somebody's suggestion.
   * The marking pass below adds the mark to what was actually inserted, and
   * ProseMirror merges neighbouring runs, so nothing is lost by refusing to
   * let it spread on its own.
   */
  inclusive: false,
  addAttributes: () => ({ ...author }),
  parseHTML: () => [{ tag: "ins[data-suggest]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "ins",
    mergeAttributes(HTMLAttributes, {
      "data-suggest": "insert",
      class: "suggest-insert",
    }),
    0,
  ],
});

/** Text proposed for removal. Still present, so rejecting costs nothing. */
export const SuggestDelete = Mark.create({
  name: "suggestDelete",
  inclusive: false,
  addAttributes: () => ({ ...author }),
  parseHTML: () => [{ tag: "del[data-suggest]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "del",
    mergeAttributes(HTMLAttributes, {
      "data-suggest": "delete",
      class: "suggest-delete",
    }),
    0,
  ],
});

/**
 * The rule, as a plugin.
 *
 * `state` carries whether suggesting is on, so the keymap and the transaction
 * hook read one source rather than each holding their own copy. Turning it on
 * and off is a transaction, which means undo sees it too.
 */
export const Suggesting = Mark.create({
  name: "suggestingMode",

  /**
   * Deleting, while suggesting, marks instead of removing.
   *
   * Your own unaccepted insertion is the exception: removing text you just
   * proposed is a correction, not a proposal about somebody else's writing,
   * and leaving a struck-through ghost of your own typo would be absurd.
   */
  addKeyboardShortcuts() {
    const propose = (forward: boolean) => () => {
      const { state, view } = this.editor;
      const mode = suggesting.getState(state);
      if (!mode?.on) return false;

      const del = state.schema.marks.suggestDelete;
      const ins = state.schema.marks.suggestInsert;
      if (!del || !ins) return false;

      const { empty, from, to } = state.selection;
      const start = empty ? (forward ? from : from - 1) : from;
      const end = empty ? (forward ? from + 1 : from) : to;
      if (start < 0 || end > state.doc.content.size || end <= start) return false;

      // Mine and not yet accepted — take it back for real.
      let allMine = true;
      state.doc.nodesBetween(start, end, (node) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type === ins);
        if (!mark || mark.attrs.by !== mode.by) allMine = false;
      });
      if (allMine) return false;

      const tr = state.tr
        .addMark(start, end, del.create({ by: mode.by }))
        .setMeta(suggesting, mode);
      // Step over what was just struck through, so holding backspace keeps
      // moving instead of re-marking the same character.
      tr.setSelection(TextSelection.near(tr.doc.resolve(forward ? end : start)));
      view.dispatch(tr);
      return true;
    };

    return { Backspace: propose(false), Delete: propose(true) };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SuggestingState>({
        key: suggesting,
        state: {
          init: () => ({ on: false, by: "" }),
          apply: (tr, value) => tr.getMeta(suggesting) ?? value,
        },

        /**
         * Mark what was just typed.
         *
         * Runs after the fact rather than intercepting the input, because
         * intercepting means reimplementing every way text can arrive —
         * typing, paste, autocorrect, dictation — and getting one of them
         * wrong means silently untracked edits.
         */
        appendTransaction(transactions, _old, newState) {
          const mode = suggesting.getState(newState);
          if (!mode?.on) return null;
          if (!transactions.some((t) => t.docChanged)) return null;
          // Our own marking pass must not mark itself.
          if (transactions.some((t) => t.getMeta(suggesting))) return null;

          const inserted: Array<{ from: number; to: number }> = [];
          for (const transaction of transactions)
            for (const step of transaction.steps) {
              const map = step.getMap();
              map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                if (newEnd > newStart) inserted.push({ from: newStart, to: newEnd });
              });
            }
          if (!inserted.length) return null;

          const mark = newState.schema.marks.suggestInsert;
          if (!mark) return null;
          const tr = newState.tr.setMeta(suggesting, mode).setMeta("addToHistory", false);
          for (const range of inserted) {
            const from = Math.max(0, Math.min(range.from, newState.doc.content.size));
            const to = Math.max(from, Math.min(range.to, newState.doc.content.size));
            if (to > from) tr.addMark(from, to, mark.create({ by: mode.by }));
          }
          return tr.steps.length ? tr : null;
        },
      }),
    ];
  },
});
