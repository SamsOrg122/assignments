"use client";

/**
 * Where you were, at the top of the page you land on.
 *
 * The sidebar used to carry a list of your projects, and that list was how
 * most people got back into yesterday's work. It does not any more: the
 * sidebar's one "recent" list mixes projects with rooms and the notepad, so
 * on a talkative day the document you were writing is below four channels.
 * The work hub has to answer "where was I" itself, and answer it first —
 * above the deadlines, and well above a grid you have to search.
 *
 * Cards rather than more rows. The Library underneath is rows, and a band of
 * rows above rows reads as the top of that list rather than as a separate
 * offer; six cards in two lines of three is a different shape, which is the
 * only thing that makes it a different thing.
 *
 * Quiet until there are two. With one project the card is the same name as
 * the single row directly beneath it, and with none the empty state is the
 * entire point of the screen — nothing may sit on top of that.
 *
 * Every card carries the same ⋯ as a Library row, built by the caller from
 * `projectMenu` and the shared `useProjectActions`. With the sidebar's list
 * gone this menu is the only pointer route left to Rename, Icon, Duplicate,
 * Change type, Move to, Labels, Save as template, all five exports, Settings
 * and Delete, so it cannot be a second, smaller menu written here.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { RowMenuButton } from "@/components/ui/RowMenuButton";
import { KINDS } from "@/lib/kinds";
import { projectSummary } from "@/lib/summary";
import { formatDayMonth } from "@/lib/format";
import type { Project } from "@/lib/types";

/** Two lines of three at full width. A seventh is not "where you were". */
const MOST = 6;

export function PickUpWhere({
  projects,
  showTime,
  onMenu,
}: {
  /** Already narrowed to the world on screen; this does no filtering. */
  projects: Project[];
  /** False until the store has rehydrated — see `relativeTime` below. */
  showTime: boolean;
  onMenu: (event: React.MouseEvent, project: Project) => void;
}) {
  /*
   * Sorted here rather than read off the grid below, which reorders itself
   * with the search box and the sort control. This band means one thing and
   * has to keep meaning it while somebody types in the box underneath.
   *
   * "Last opened" is approximated by `updatedAt`, which is what the store
   * records. It is right in every case except reading a document without
   * typing in it.
   */
  const cards = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MOST),
    [projects],
  );

  if (cards.length < 2) return null;

  return (
    <section aria-label="Pick up where you left off" className="mb-4">
      <p className="label-mono mb-1.5">pick up where you left off</p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((project) => (
          <li key={project.id} className="group relative">
            <Link
              href={`/p/${project.id}`}
              prefetch
              onContextMenu={(event) => onMenu(event, project)}
              className="flex h-full flex-col gap-1.5 rounded-md border border-line bg-surface p-2.5 pr-8 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-xs border border-line bg-surface-2 text-fg-muted"
                >
                  <Avatar glyph={project.glyph} kind={project.kind} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                  {project.name}
                </span>
              </span>

              <span className="block truncate font-mono text-[10px] text-fg-subtle">
                {projectSummary(project)}
              </span>

              <span className="mt-auto flex items-center gap-2 font-mono text-[9.5px] text-fg-subtle">
                <span className="tracking-wide uppercase">
                  {KINDS[project.kind].label}
                </span>
                <span className="ml-auto shrink-0">
                  {showTime ? relativeTime(project.updatedAt) : ""}
                </span>
              </span>
            </Link>

            {/* Sibling of the link, never a child of it: a button inside an
                anchor is markup browsers disagree about. */}
            <RowMenuButton
              label={`More for ${project.name}`}
              onOpen={(event: React.MouseEvent) => onMenu(event, project)}
              className="right-2"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Rendered only after hydration — `Date.now()` differs between server and
 * client, and a countdown that corrects itself on load is a mismatch.
 *
 * It lives here, and the Library page imports it, because both surfaces show
 * the same timestamps and `lib/format` is not a file this change may open.
 * Two copies of "2h ago" is how two lists start disagreeing about the hour.
 */
export function relativeTime(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDayMonth(ts);
}
