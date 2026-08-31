"use client";

/**
 * Assignments — the deadline, the document and the hand-in in one place.
 *
 * The tool was full of documents and full of dates, and the two knew nothing
 * about each other. An essay lived in the Library; "essay due Friday" lived
 * on the agenda as a task; and the fact that they were the same piece of work
 * lived in somebody's head, which is where it stops living around week
 * eleven. This page is that connection made real.
 *
 * Three columns because there are three states worth telling apart, and a
 * board rather than a list because the question "how much have I got on" is
 * answered by the shape of the thing before any of it is read.
 *
 * Deliberately not drag-and-drop. Moving a card is one of three named
 * destinations, and three buttons work with a keyboard, on a phone, and
 * under a screen reader — none of which a drag handle does without a great
 * deal of code standing between somebody and their own homework.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { keyOf, type DayKey } from "@/lib/agenda/model";
import { hydrateScope, useHasTeam, useScope } from "@/lib/scope";
import { useProjects } from "@/lib/store";
import {
  createAssignment,
  deleteAssignment,
  hydrateAssignments,
  linkProject,
  pullAssignments,
  setStatus,
  updateAssignment,
  useAssignments,
} from "@/lib/assignments";
import {
  byDeadline,
  standing,
  dueClock,
  STATUSES,
  STATUS_LABELS,
  type Assignment,
  type Status,
} from "@/lib/assignments/model";
import {
  AssignmentEditor,
  draftFrom,
  minutesOf,
  type Draft,
} from "@/components/assignments/AssignmentEditor";

const TONE: Record<string, string> = {
  calm: "text-fg-subtle",
  soon: "text-fg",
  late: "text-warn",
  done: "text-fg-subtle",
};

export default function AssignmentsPage() {
  const all = useAssignments((s) => s.assignments);
  const problem = useAssignments((s) => s.problem);
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const chosen = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  // Without a team there is no team world, so the switch upstairs must not be
  // able to empty this page into a view somebody cannot get out of.
  const scope = hasTeam ? chosen : "personal";

  const [today, setToday] = useState<DayKey>("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showHanded, setShowHanded] = useState(true);

  useEffect(() => {
    hydrateAssignments();
    hydrateScope();
    // The date is read here rather than during render: rendering a date on
    // the server and a different one in the browser is a hydration mismatch,
    // and around midnight it is a real one. Off the effect body deliberately
    // — React's lint is right that a synchronous setState here cascades, and
    // a microtask later is soon enough for something nothing is waiting on.
    void Promise.resolve().then(() => setToday(keyOf(new Date())));
    void pullAssignments();
  }, []);

  const mine = useMemo(
    () => all.filter((a) => (a.scope ?? "personal") === scope),
    [all, scope],
  );

  const columns = useMemo(() => {
    const byStatus: Record<Status, Assignment[]> = { todo: [], doing: [], handed: [] };
    for (const assignment of mine) byStatus[assignment.status].push(assignment);
    for (const status of STATUSES) byStatus[status].sort(byDeadline);
    return byStatus;
  }, [mine]);

  const overdue = useMemo(
    () =>
      today
        ? mine.filter((a) => a.status !== "handed" && a.due < today).length
        : 0,
    [mine, today],
  );

  const save = () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) return;
    const shared = {
      title,
      course: editing.course.trim() || undefined,
      due: editing.due,
      dueMinute: minutesOf(editing.time),
      notes: editing.notes.trim() || undefined,
      scope: editing.scope,
    };
    if (editing.id) {
      const was = all.find((a) => a.id === editing.id);
      if (was) updateAssignment({ ...was, ...shared });
    } else {
      createAssignment(shared);
    }
    setEditing(null);
  };

  /**
   * Start the document this assignment is for.
   *
   * Named after the assignment, so the Library shows something recognisable
   * rather than "Untitled 4" — the whole reason the two are being connected
   * is that a document nobody can place is a document nobody opens.
   */
  const startDocument = (assignment: Assignment) => {
    const id = addProject("doc", assignment.title);
    linkProject(assignment.id, id);
  };

  const visible = showHanded ? STATUSES : STATUSES.filter((s) => s !== "handed");

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() => setEditing(draftFrom(null, today || keyOf(new Date()), scope))}
            className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={12} />
            New assignment
          </button>
        }
      >
        <span className="text-[13px] font-medium text-fg">Assignments</span>
      </TopBar>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
          <h1 className="text-[15px] font-medium tracking-tight text-fg">
            {scope === "team" ? "The team's work" : "Your work"}
          </h1>
          {overdue > 0 && (
            <span className="rounded-xs bg-warn/12 px-1.5 py-0.5 text-[11px] text-warn">
              {overdue} overdue
            </span>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
            <input
              type="checkbox"
              checked={showHanded}
              onChange={(e) => setShowHanded(e.target.checked)}
              className="accent-current"
            />
            Show handed in
          </label>
        </div>

        {problem && (
          <p className="border-b border-line px-4 py-1.5 text-[11.5px] text-warn" role="status">
            {problem}
          </p>
        )}

        {mine.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-[380px] text-center">
              <p className="text-[13.5px] text-fg">Nothing due.</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
                An assignment is a deadline with a document attached to it. Add
                one and you can start writing from the same card you are
                counting down on.
              </p>
              <button
                type="button"
                onClick={() =>
                  setEditing(draftFrom(null, today || keyOf(new Date()), scope))
                }
                className="mt-3 rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"
              >
                Add the first one
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-px overflow-y-auto bg-line md:grid-cols-3 md:overflow-hidden">
            {visible.map((status) => (
              <section
                key={status}
                aria-label={STATUS_LABELS[status]}
                className="flex min-h-0 flex-col bg-bg md:overflow-y-auto"
              >
                <h2 className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg px-3 py-2">
                  <span className="text-meta text-fg-subtle">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-[11px] text-fg-subtle">
                    {columns[status].length}
                  </span>
                </h2>

                <ul className="grid gap-2 p-3">
                  {columns[status].map((assignment) => (
                    <li key={assignment.id}>
                      <Card
                        assignment={assignment}
                        today={today}
                        projectName={
                          projects.find((p) => p.id === assignment.projectId)?.name
                        }
                        onEdit={() =>
                          setEditing(draftFrom(assignment, today, scope))
                        }
                        onMove={(next) => setStatus(assignment.id, next)}
                        onStart={() => startDocument(assignment)}
                      />
                    </li>
                  ))}
                  {columns[status].length === 0 && (
                    <li className="px-1 py-2 text-[11.5px] text-fg-subtle">
                      Nothing here.
                    </li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <AssignmentEditor
          draft={editing}
          hasTeam={hasTeam}
          onChange={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={
            editing.id
              ? () => {
                  deleteAssignment(editing.id as string);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/**
 * One assignment.
 *
 * The countdown is the loudest thing on the card, above the title, because
 * "three days left" is what somebody scanning the board is actually reading
 * for — the titles they already know.
 */
function Card({
  assignment,
  today,
  projectName,
  onEdit,
  onMove,
  onStart,
}: {
  assignment: Assignment;
  today: DayKey;
  projectName?: string;
  onEdit: () => void;
  onMove: (status: Status) => void;
  onStart: () => void;
}) {
  // Before the date is known there is nothing honest to say, so the line is
  // held back rather than guessed at from the server's clock.
  const due = today ? standing(assignment, today) : null;
  const time = dueClock(assignment);

  return (
    <article className="group rounded-sm border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
      <div className="flex items-baseline justify-between gap-2">
        {due && (
          <span className={cn("text-[11px] font-medium", TONE[due.tone])}>
            {due.text}
          </span>
        )}
        <span className="text-[10.5px] text-fg-subtle">
          {assignment.due}
          {time ? ` · ${time}` : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-1 block w-full text-left text-[12.5px] leading-snug text-fg hover:underline"
      >
        {assignment.title}
      </button>

      {assignment.course && (
        <p className="mt-0.5 text-[11px] text-fg-subtle">{assignment.course}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {assignment.projectId ? (
          <Link
            href={`/p/${assignment.projectId}`}
            className="flex items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="text" size={10} />
            <span className="max-w-[140px] truncate">
              {projectName ?? "Open the document"}
            </span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={10} />
            Start a document
          </button>
        )}
      </div>

      <div
        className="mt-2 flex rounded-xs border border-line p-0.5"
        role="group"
        aria-label={`Move ${assignment.title}`}
      >
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onMove(status)}
            aria-pressed={assignment.status === status}
            className={cn(
              "flex-1 rounded-xs px-1 py-0.5 text-[10.5px] transition-colors",
              assignment.status === status
                ? "bg-surface-2 text-fg"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </article>
  );
}
