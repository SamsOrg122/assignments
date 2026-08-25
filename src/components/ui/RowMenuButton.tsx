"use client";

/**
 * The visible way into a row's menu.
 *
 * Every action you can take *on* a project or a channel — eighteen of them,
 * counting Export's five formats — used to have exactly one pointer entry
 * point: a contextmenu event. Below 1024px the sidebar is the touch drawer
 * and there is no right-click at all, so on a phone none of those actions
 * existed. Export in particular had no visible control anywhere in the
 * product: the only way to get a finished document out was to right-click
 * its row in a list, which is not a thing anybody guesses.
 *
 * So: a button, on the row, opening the same menu the right-click opens.
 * Right-click stays exactly as it was — this is an addition, and nothing is
 * taken away from the people who already learned it.
 *
 * It is a **sibling** of the row's link, never a child of it. A button inside
 * an anchor is invalid markup that browsers disagree about, and the two
 * activation behaviours fight; positioning it over the row's right edge gets
 * the same picture with none of that. The row supplies `relative` and enough
 * right padding for the button to sit in.
 */

import { Icon } from "./Icon";
import { cn } from "@/lib/cn";

export function RowMenuButton({
  label,
  onOpen,
  className,
}: {
  /** Named for what it acts on: "More for Thesis draft". */
  label: string;
  onOpen: (event: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The row underneath is a link and a click here is not a click on it.
        event.preventDefault();
        event.stopPropagation();
        onOpen(event);
      }}
      className={cn(
        "absolute top-1/2 right-1 z-10 -translate-y-1/2 rounded-xs p-1",
        "text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
        // Always present for a keyboard, and for touch, where there is no
        // hover to reveal anything. Faint until the row is hovered or the
        // button itself is focused, so a list of forty rows is not forty dots
        // competing with the names.
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        "max-[1024px]:opacity-100",
        className,
      )}
    >
      <Icon name="dots" size={13} />
    </button>
  );
}
