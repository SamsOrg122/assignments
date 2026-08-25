"use client";

/**
 * The deadline, in the document being written for it.
 *
 * The other half of the connection. The board can point at a document; this
 * is the document pointing back — so somebody three hours into an essay can
 * see when it is due, and mark it handed in, without going looking for the
 * card that says so.
 *
 * Renders nothing for a document that is not somebody's assignment, which is
 * most of them. It sits in the shared editor bar rather than in each editor,
 * so a spreadsheet or a slide deck handed in for a course gets it too.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { keyOf, type DayKey } from "@/lib/agenda/model";
import { hydrateAssignments, setStatus, useAssignments } from "@/lib/assignments";
import { dueClock, standing } from "@/lib/assignments/model";

export function DeadlineChip({ projectId }: { projectId: string }) {
  const assignment = useAssignments((s) =>
    s.assignments.find((a) => a.projectId === projectId),
  );
  const [today, setToday] = useState<DayKey>("");

  useEffect(() => {
    hydrateAssignments();
    void Promise.resolve().then(() => setToday(keyOf(new Date())));
  }, []);

  // No assignment, or no date to compare against yet: say nothing. A
  // countdown rendered from the server's clock and corrected a frame later
  // is a mismatch, and near midnight it is also wrong.
  if (!assignment || !today) return null;

  const how = standing(assignment, today);
  const time = dueClock(assignment);
  const handed = assignment.status === "handed";

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        title={`Due ${assignment.due}${time ? ` at ${time}` : ""}`}
        className={cn(
          "flex items-center gap-1 rounded-sm border px-2 py-1 text-[11.5px]",
          how.tone === "late"
            ? "border-warn/50 text-warn"
            : "border-line text-fg-muted",
        )}
      >
        <Icon name="calendar" size={11} />
        {how.text}
      </span>

      <button
        type="button"
        onClick={() => setStatus(assignment.id, handed ? "doing" : "handed")}
        title={
          handed
            ? "Put it back — this is still being written"
            : "Mark it handed in"
        }
        className={cn(
          "rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
          handed
            ? "border-line-strong bg-surface-2 text-fg"
            : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
        )}
      >
        {handed ? "Handed in" : "Hand in"}
      </button>
    </span>
  );
}
