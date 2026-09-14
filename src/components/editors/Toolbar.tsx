"use client";

/**
 * The tools above a document, grouped.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 * Ten icon buttons in a row, each in its own 1px box, each the same grey,
 * with nothing between them. Every one of those boxes was drawing an edge
 * round something that already had an edge — the gap — and the sum was a
 * fence of twenty vertical lines above a page of prose. Worse, the row said
 * nothing about itself: the outline, the sources and the history are three
 * ways of moving around a document, page setup and typography are how it is
 * shaped, and suggesting and reviewing are what two people do to it. None of
 * that was visible, so the only way to find a tool was to hover all ten.
 *
 * ── WHAT IT IS NOW ────────────────────────────────────────────────────────
 * One recessed track holding the buttons, with a hairline between groups.
 * The track is the box — one, instead of ten — and the hairlines are the only
 * marks left, each of them carrying the thing the boxes never did: which
 * tools belong together. It is the shape a toolbar has in every drawing tool,
 * and the reason is that it works.
 *
 * Pressed is still ink and weight first: `text-fg-subtle` → `text-fg` with a
 * fill behind it that only reinforces, because the surface ramp is 1.08–1.24:1
 * and a state nobody can see is not a state. `aria-pressed` says it too.
 */

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** The track. Children are `ToolGroup`s; the rule between them is drawn by
 *  the group itself so an empty one leaves no orphan line. */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center rounded-md bg-surface p-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ToolGroup({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 px-0.5",
        // The separator, on every group but the first. A border rather than a
        // spacer element, so a group that renders nothing takes no line with
        // it — and `:empty` cannot be relied on here because a group's only
        // child may be a fragment that renders null.
        "border-l border-line first:border-l-0",
      )}
    >
      {children}
    </span>
  );
}

export function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  /**
   * A toggle passes this and gets `aria-pressed` with it. A button that just
   * *does* something — drop a sticky on the board — passes nothing, because
   * `aria-pressed={false}` on a thing that is not a toggle tells a screen
   * reader there is a state to watch that will never change.
   */
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded-sm p-1.5 transition-colors duration-150",
        active
          ? "bg-surface-3 text-fg"
          : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon name={icon} size={13} />
    </button>
  );
}

/** The same button with its name showing, for the few that cannot be guessed
 *  from a glyph. Shares the track so the row stays one object. */
export function ToolText({
  icon,
  children,
  active,
  onClick,
  title,
  className,
}: {
  icon?: React.ComponentProps<typeof Icon>["name"];
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        // text-meta, not the 11.5px these buttons were all written at. That
        // half-pixel was off the scale in seven files and said nothing; 11px
        // is the step the scale actually has, and a control word that is also
        // an icon with a `title` is exactly what it is sized for.
        "flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-meta transition-colors duration-150",
        active
          ? "bg-surface-3 text-fg"
          : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </button>
  );
}
