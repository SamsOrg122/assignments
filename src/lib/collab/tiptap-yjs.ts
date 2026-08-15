"use client";

/**
 * Binding one editor to one shared paragraph.
 *
 * A thin wrapper around `y-prosemirror`'s sync plugin rather than another
 * dependency: the published TipTap extension is itself a thin wrapper, and
 * this way there is one fewer package to keep in step with TipTap's major
 * versions.
 *
 * The undo swap is not optional. ProseMirror's own history is a stack of this
 * editor's steps, and in a shared document that means ⌘Z reaches over and
 * undoes a sentence somebody else just typed — the single most alarming thing
 * a collaborative editor can do. `yUndoPlugin` tracks only what this person
 * did, so the editor that uses this must turn StarterKit's `undoRedo` off.
 */

import { Extension } from "@tiptap/core";
import { ySyncPlugin, yUndoPlugin, undo, redo } from "y-prosemirror";
import type * as Y from "yjs";

export const YjsSync = (fragment: Y.XmlFragment) =>
  Extension.create({
    name: "yjsSync",

    addProseMirrorPlugins() {
      return [ySyncPlugin(fragment), yUndoPlugin()];
    },

    addKeyboardShortcuts() {
      return {
        "Mod-z": () => undo(this.editor.state),
        "Mod-y": () => redo(this.editor.state),
        "Shift-Mod-z": () => redo(this.editor.state),
      };
    },
  });
