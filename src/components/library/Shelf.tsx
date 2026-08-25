"use client";

/**
 * The shelf — the four things in here that are not projects.
 *
 * Notes, study and the kit each had a sidebar row until this change, and now
 * they do not. Everything else on this page hides itself when it is empty,
 * which is right for an alarm and wrong for a door: a room with nothing in it
 * that also has no way in is a room nobody will ever put anything in. So this
 * line never hides. It is the floor that makes every band above it safe to
 * disappear, and it is the reason cutting those rows upstairs was allowed.
 *
 * One line of four words rather than four cards, because these are addresses,
 * not work. The Library is where the work is; this is the corridor past it.
 *
 * Templates is a button and the other three are links, which is not an
 * inconsistency worth designing away: templates has no address. The picker is
 * a dialog owned by this page — it is where saved templates, the workspace's
 * templates and the built-in ones are all listed — and inventing a `/templates`
 * URL to make four links match would be inventing a route, which this change
 * is not allowed to do. It opens the same picker the New menu opens.
 */

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/** Same shape for the three links and the one button, so the line reads flat. */
const ITEM =
  "flex items-center gap-1.5 rounded-xs px-1 py-0.5 text-[12px] text-fg-muted transition-colors duration-150 hover:text-fg";

export function Shelf({ onTemplates }: { onTemplates: () => void }) {
  return (
    <nav
      aria-label="Also in here"
      className="mt-6 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-line pt-3"
    >
      <span className="label-mono mr-1.5">also in here</span>

      <Link href="/notes" className={ITEM} title="The notepad">
        <Shape name="sticky" />
        notes
      </Link>
      <Dot />
      <Link
        href="/study"
        className={ITEM}
        title="Cards, and a session that asks the ones you keep missing"
      >
        <Shape name="copy" />
        study
      </Link>
      <Dot />
      <Link
        href="/kit"
        className={ITEM}
        title="Fonts, pictures and files you brought with you"
      >
        <Shape name="group" />
        kit
      </Link>
      <Dot />
      <button
        type="button"
        onClick={onTemplates}
        className={ITEM}
        title="Start something from a shape somebody already worked out"
      >
        <Shape name="frame" />
        templates
      </button>
    </nav>
  );
}

function Shape({ name }: { name: IconName }) {
  return <Icon name={name} size={12} className="shrink-0 text-fg-subtle" />;
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-fg-subtle">
      ·
    </span>
  );
}
