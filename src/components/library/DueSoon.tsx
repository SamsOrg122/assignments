"use client";

/**
 * What is due, on the first screen.
 *
 * An assignments board nobody opens is a to-do list nobody reads, and the
 * page people actually land on is this one. So the deadlines come to them:
 * the next fortnight, soonest first, with the countdown in words rather than
 * a date somebody has to do arithmetic on.
 *
 * Silent when there is nothing due — which is most weeks, and is what lets
 * this be a strip rather than a permanent panel of empty state. Silent too
 * while the date is still unknown: rendering "3 days left" from a server
 * clock and then correcting it in the browser is a mismatch, and near
 * midnight it is a wrong answer as well.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { keyOf, type DayKey } from "@/lib/agenda/model";
import { hydrateAssignments, pullAssignments, useAssignments } from "@/lib/assignments";
import { pressing, standing } from "@/lib/assignments/model";
import { useWorld } from "@/lib/scope";

/** How far ahead is worth worrying about on a page that is not the board. */
const HORIZON = 14;

export function DueSoon() {
  const assignments = useAssignments((s) => s.assignments);
  // The downgraded world, not the stored one: somebody who once looked at a
  // team and left had a stored scope of "team" and got an empty strip here
  // with nothing on screen to change it back.
  const world = useWorld();
  const [today, setToday] = useState<DayKey>("");

  useEffect(() => {
    hydrateAssignments();
    void Promise.resolve().then(() => setToday(keyOf(new Date())));
    void pullAssignments();
  }, []);

  if (!today) return null;

  const soon = pressing(
    assignments.filter((a) => (a.scope ?? "personal") === world),
    today,
    HORIZON,
  );
  if (soon.length === 0) return null;

  return (
    /* No box. Five dated rows are a list, and a list belongs to the page it
       is on — the border was here because a panel on this palette is a 1.12:1
       step and could not group anything by tone, so it drew four lines
       instead. What groups them now is a label and 40px of air, and the one
       thing on this page allowed to be warm — a late deadline — is no longer
       arguing with a rectangle drawn round it. */
    <section aria-label="Due soon" className="mb-(--space-5)">
      <div className="mb-(--space-3) flex items-center gap-2">
        <span className="text-meta text-fg-subtle">Due soon</span>
        <Link
          /* /due, not /assignments: this strip is a dated list and /due is the
             dated list. The board is one of /due's two doors. */
          href="/due"
          className="ml-auto text-meta text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          All of it
        </Link>
      </div>

      <ul className="grid gap-px">
        {soon.slice(0, 5).map((assignment) => {
          const how = standing(assignment, today);
          return (
            <li key={assignment.id}>
              <Link
                href={assignment.projectId ? `/p/${assignment.projectId}` : "/assignments"}
                className="flex items-center gap-2 rounded-xs px-1.5 py-1 transition-colors hover:bg-surface-2"
              >
                <Icon
                  name={assignment.projectId ? "text" : "check"}
                  size={11}
                  className="shrink-0 text-fg-subtle"
                />
                <span className="min-w-0 flex-1 truncate text-body text-fg">
                  {assignment.title}
                </span>
                {assignment.course && (
                  <span className="hidden shrink-0 text-meta text-fg-subtle sm:block">
                    {assignment.course}
                  </span>
                )}
                <span
                  className={cn(
                    // Late is the one warm thing on this page, and it is
                    // carried by ink AND weight together — never by ink
                    // alone, and never by a fill.
                    "shrink-0 text-meta",
                    how.tone === "late" ? "text-warn font-medium" : "text-fg-muted",
                  )}
                >
                  {how.text}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
