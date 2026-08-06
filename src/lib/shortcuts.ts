/**
 * Every keyboard shortcut in the app, in one list.
 *
 * The sheet users press ⌘/ for is generated from this, which is the only way a
 * shortcut reference stays true: a list maintained beside the handlers drifts
 * within a week, and a wrong shortcut sheet is worse than none because it
 * teaches people something that doesn't work.
 *
 * `where` names the surface a binding is live on, so the sheet can lead with
 * the section you're actually in rather than making you scan for it.
 */

export type Surface = "global" | "writing" | "table" | "deck" | "board";

export interface Shortcut {
  keys: string;
  what: string;
}

export interface ShortcutGroup {
  where: Surface;
  title: string;
  items: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    where: "global",
    title: "Anywhere",
    items: [
      { keys: "⌘K", what: "Command palette, and search across everything you've written" },
      { keys: "⌘J", what: "Ask AI about the selection" },
      { keys: "⌘B", what: "Show or hide the sidebar" },
      { keys: "⌘/", what: "This sheet" },
      { keys: "Esc", what: "Close whatever is open" },
    ],
  },
  {
    where: "writing",
    title: "Writing",
    items: [
      { keys: "/", what: "Insert a block — table, chart, slides, code" },
      { keys: "⌘F", what: "Find and replace in this project" },
      { keys: "⌘B / ⌘I", what: "Bold, italic" },
      { keys: "⌘⇧F", what: "Focus mode" },
      { keys: "⌘Z", what: "Undo" },
    ],
  },
  {
    where: "table",
    title: "Tables",
    items: [
      { keys: "↑ ↓ ← →", what: "Move between cells" },
      { keys: "Tab / ⇧Tab", what: "Next, previous cell" },
      { keys: "Enter", what: "Edit, then commit and drop down a row" },
      { keys: "F2", what: "Edit without clearing the cell" },
      { keys: "⇧-click", what: "Extend the selection to a range" },
      { keys: "⌘C / ⌘V", what: "Copy and paste a whole range" },
      { keys: "⌘D", what: "Fill down from the top of the selection" },
      { keys: "⌘A", what: "Select every cell" },
      { keys: "Delete", what: "Clear the selected cells" },
    ],
  },
  {
    where: "deck",
    title: "Slides",
    items: [
      { keys: "← →", what: "Previous, next slide" },
      { keys: "P", what: "Present" },
      { keys: "↑ ↓ ← →", what: "Nudge the selected object" },
      { keys: "⇧ + arrows", what: "Nudge further" },
      { keys: "Delete", what: "Remove the selected object" },
    ],
  },
  {
    where: "board",
    title: "Board",
    items: [
      { keys: "N", what: "New sticky" },
      { keys: "F", what: "New frame" },
      { keys: "C", what: "Connect two items" },
      { keys: "P", what: "Promote the selection into a project" },
      { keys: "⌘G / ⌘⇧G", what: "Group, ungroup" },
      { keys: "⌘L", what: "Lock or unlock" },
      { keys: "⌘D", what: "Duplicate" },
      { keys: "⌘A", what: "Select everything" },
      { keys: "⌘0", what: "Fit the board to the window" },
      { keys: "⇧-drag", what: "Marquee-select" },
      { keys: "⌘-scroll", what: "Zoom about the pointer" },
      { keys: "↑ ↓ ← →", what: "Nudge the selection" },
    ],
  },
];

/** Which section the sheet should open on, given the project kind. */
export function surfaceFor(kind?: string): Surface {
  switch (kind) {
    case "board":
      return "board";
    case "deck":
      return "deck";
    case "doc":
    case "notes":
      return "writing";
    default:
      return "global";
  }
}
