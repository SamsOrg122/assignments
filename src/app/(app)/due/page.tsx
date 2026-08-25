"use client";

/**
 * Due — one dated list of everything a person owes.
 *
 * The deadlines were already on two pages. /assignments draws them as a
 * three-column board, /agenda draws them as a week grid, and the two show
 * the same Friday in two shapes. So the daily question — "what do I owe and
 * when" — cost two sidebar rows and two page loads, and neither page could
 * answer it alone: the essay lives on the board, the dentist lives on the
 * calendar, and the afternoon they collide in lived in somebody's head.
 *
 * One column, in date order, with all three kinds interleaved. This is the
 * only screen in the reorganisation that makes a daily path shorter, and it
 * earns that by being read top to bottom and nowhere else — no columns, no
 * views, no filters beyond the one whose-work switch the whole app obeys.
 *
 * It replaces neither page. A board is how you see how much you have on; a
 * calendar is how you see the shape of a Tuesday; a list is how you see what
 * is next. The two doors at the foot are permanent for that reason.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  addDays,
  clock,
  dateOf,
  keyOf,
  occursOn,
  type AgendaEvent,
  type AgendaTask,
  type DayKey,
} from "@/lib/agenda/model";
import {
  createEvent,
  createTask,
  hydrateAgenda,
  pullAgenda,
  toggleTask,
  useAgenda,
} from "@/lib/agenda";
import { parseQuick } from "@/lib/agenda/quick";
import {
  hydrateAssignments,
  pullAssignments,
  setStatus,
  useAssignments,
} from "@/lib/assignments";
import {
  daysBetween,
  dueClock,
  STATUSES,
  STATUS_LABELS,
  type Assignment,
  type Status,
} from "@/lib/assignments/model";
import { hydrateScope, useHasTeam, useScope } from "@/lib/scope";
import { useProjects } from "@/lib/store";
import { hydrateStudy, pullStudy, useStudy } from "@/lib/study";
import { progressOf } from "@/lib/study/model";

/** How far ahead a list like this is worth reading. The same fortnight the
 *  library strip uses, so the two agree about what "soon" means. */
const HORIZON = 14;

/** Where a thing with no time of day sorts inside its own day: last, the
 *  same sentinel `byDeadline` uses, so this list and the board never
 *  disagree about the order of the same two assignments. */
const DAY_END = 24 * 60;

/** Among things at the same minute: what is owed before what is merely on. */
const RANK = { assignment: 0, task: 1, event: 2 } as const;

type Row =
  | { kind: "assignment"; key: string; day: DayKey; minute: number; title: string; assignment: Assignment }
  | { kind: "task"; key: string; day: DayKey; minute: number; title: string; task: AgendaTask }
  | { kind: "event"; key: string; day: DayKey; minute: number; title: string; event: AgendaEvent };

const DOORS: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/agenda", icon: "calendar", label: "the calendar" },
  { href: "/assignments", icon: "board", label: "the board" },
];

export default function DuePage() {
  const allAssignments = useAssignments((s) => s.assignments);
  const assignmentProblem = useAssignments((s) => s.problem);
  const allEvents = useAgenda((s) => s.events);
  const allTasks = useAgenda((s) => s.tasks);
  const agendaProblem = useAgenda((s) => s.problem);
  const sets = useStudy((s) => s.sets);
  const projects = useProjects((s) => s.projects);
  const chosen = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  // Without a team there is no team world, so the switch upstairs must not be
  // able to empty this page into a view somebody cannot get out of. The
  // downgraded value is the one to filter on — library/DueSoon filters on the
  // raw persisted scope instead, and shows an empty strip to anybody who once
  // looked at a team and then left it.
  const world = hasTeam ? chosen : "personal";

  const [today, setToday] = useState<DayKey>("");
  const [quick, setQuick] = useState("");
  const [held, setHeld] = useState<string[]>([]);

  useEffect(() => {
    hydrateAssignments();
    hydrateAgenda();
    hydrateStudy();
    hydrateScope();
    // The date is read here rather than during render: rendering a date on
    // the server and a different one in the browser is a hydration mismatch,
    // and around midnight it is a wrong answer as well. Off the effect body
    // deliberately — a synchronous setState here cascades, and a microtask
    // later is soon enough for something nothing is waiting on.
    void Promise.resolve().then(() => setToday(keyOf(new Date())));
    void pullAssignments();
    void pullAgenda();
    void pullStudy();
  }, []);

  const ahead = useMemo(
    () =>
      today
        ? Array.from({ length: HORIZON + 1 }, (_, i) => addDays(today, i))
        : [],
    [today],
  );

  /**
   * A row you have just settled stays where it is until you leave.
   *
   * Handed-in work and finished tasks are not owed and do not belong on this
   * page — but a control that deletes its own row the instant you touch it
   * cannot be un-touched, and the only way back from a mis-click would be
   * one of the pages this list exists to save you opening. So a thing
   * settled during this visit is held in place, struck through, still
   * reversible; it is gone next time the page is opened.
   */
  const hold = (id: string) =>
    setHeld((ids) => (ids.includes(id) ? ids : [...ids, id]));

  const list = useMemo(() => {
    const empty = { overdue: [] as Row[], days: [] as Array<{ day: DayKey; rows: Row[] }> };
    if (!today) return empty;

    const owed = (id: string, settled: boolean) => !settled || held.includes(id);
    const rows: Row[] = [];

    for (const assignment of allAssignments) {
      if ((assignment.scope ?? "personal") !== world) continue;
      if (!owed(assignment.id, assignment.status === "handed")) continue;
      rows.push({
        kind: "assignment",
        key: assignment.id,
        day: assignment.due,
        minute: assignment.dueMinute ?? DAY_END,
        title: assignment.title,
        assignment,
      });
    }

    for (const task of allTasks) {
      if ((task.scope ?? "personal") !== world) continue;
      if (!owed(task.id, task.done)) continue;
      rows.push({
        kind: "task",
        key: task.id,
        day: task.day,
        minute: DAY_END,
        title: task.title,
        task,
      });
    }

    // Events are walked day by day rather than read off `event.day`, because
    // a weekly lecture has one stored day — in September — and every
    // occurrence after it. Only forward: a lecture that has happened is not
    // owed and pinning it above today would be a lie about the morning.
    for (const day of ahead) {
      for (const event of allEvents) {
        if ((event.scope ?? "personal") !== world) continue;
        if (!occursOn(event, day)) continue;
        rows.push({
          kind: "event",
          key: `${event.id}:${day}`,
          day,
          minute: event.start,
          title: event.title,
          event,
        });
      }
    }

    const order = (a: Row, b: Row) =>
      a.day !== b.day
        ? a.day < b.day
          ? -1
          : 1
        : a.minute - b.minute ||
          RANK[a.kind] - RANK[b.kind] ||
          a.title.localeCompare(b.title);

    return {
      overdue: rows.filter((row) => row.kind !== "event" && row.day < today).sort(order),
      days: ahead
        .map((day) => ({ day, rows: rows.filter((row) => row.day === day).sort(order) }))
        .filter((group) => group.rows.length > 0),
    };
  }, [today, ahead, allAssignments, allTasks, allEvents, world, held]);

  /**
   * Cards waiting, across every set — deliberately not filtered by world.
   *
   * A set carries a scope, but /study shows all of them regardless, so
   * filtering here would hide the line pointing at a page that would have
   * shown the cards anyway. Counting what that page will actually ask you is
   * the honest number.
   */
  const practice = useMemo(
    () => (today ? sets.reduce((n, set) => n + progressOf(set, today).due, 0) : 0),
    [sets, today],
  );

  // Both stores can be unhappy about the same thing at once; saying it twice
  // helps nobody.
  const problems = useMemo(
    () => [
      ...new Set(
        [assignmentProblem, agendaProblem].filter((p): p is string => Boolean(p)),
      ),
    ],
    [assignmentProblem, agendaProblem],
  );

  const stillLate = (row: Row) =>
    row.kind === "assignment"
      ? row.assignment.status !== "handed"
      : row.kind === "task"
        ? !row.task.done
        : false;

  const add = (submit: React.FormEvent) => {
    submit.preventDefault();
    // The agenda's parser, not a second one: a time makes an event, no time
    // makes a task, and the same sentence typed on either page must land in
    // the same place.
    // Read now rather than using the `today` captured at mount: a tab left
    // open past midnight would otherwise file "vandaag afwassen" against
    // yesterday, which is the one day it can never mean.
    const parsed = parseQuick(quick, keyOf(new Date()));
    if (!parsed) return;
    if (parsed.kind === "task") {
      createTask({ title: parsed.title, day: parsed.day, scope: world });
    } else {
      createEvent({
        title: parsed.title,
        day: parsed.day,
        start: parsed.start,
        end: parsed.end,
        color: "slate",
        repeat: parsed.repeat,
        scope: world,
      });
    }
    setQuick("");
  };

  /*
   * Still owed, as opposed to still on screen.
   *
   * A row settled during this visit stays visible so the click can be taken
   * back, which is right — but counting those in the badge means handing in
   * three overdue essays and watching the number refuse to move.
   */
  const stillOverdue = list.overdue.filter((row) =>
    row.kind === "assignment"
      ? row.assignment.status !== "handed"
      : row.kind === "task"
        ? !row.task.done
        : true,
  ).length;
  const nothing = today !== "" && list.overdue.length === 0 && list.days.length === 0;

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">Due</span>
      </TopBar>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
          <h1 className="text-[15px] font-medium tracking-tight text-fg">
            {world === "team" ? "What the team owes" : "What you owe"}
          </h1>
          {/* Counted over what is still owed, not over what is still on
              screen. A row settled during this visit stays visible so the
              click can be taken back, and counting those would mean handing
              in three essays and watching the number refuse to move. */}
          {stillOverdue > 0 && (
            <span className="rounded-xs bg-warn/12 px-1.5 py-0.5 text-[11px] text-warn">
              {stillOverdue} overdue
            </span>
          )}
          <form className="ml-auto min-w-0 flex-1 basis-56" onSubmit={add}>
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder={'Quick add — "wiskunde ma 9:30-11" or "morgen afwassen"'}
              aria-label="Quick add"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
            />
          </form>
        </div>

        {problems.map((problem) => (
          <p
            key={problem}
            className="border-b border-line px-4 py-1.5 text-[11.5px] text-warn"
            role="status"
          >
            {problem}
          </p>
        ))}

        {practice > 0 && (
          <Link
            href="/study"
            className="flex items-center gap-2 border-b border-line px-4 py-2 text-[12px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <Icon name="sparkle" size={12} className="shrink-0 text-fg-subtle" />
            practice — {practice} {practice === 1 ? "card" : "cards"} due today
            <Icon name="chevron-right" size={12} className="ml-auto shrink-0 text-fg-subtle" />
          </Link>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {nothing ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-[400px] text-center">
                <p className="text-[13.5px] text-fg">nothing due in the next fortnight.</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
                  no deadline, no task and no event between today and{" "}
                  {addDays(today, HORIZON)}. add one in the box above — the
                  calendar and the board are below if you would rather go and
                  look.
                </p>
              </div>
            </div>
          ) : (
            <>
              {list.overdue.length > 0 && (
                <Group label="overdue" tone="late">
                  {list.overdue.map((row) => (
                    <Line
                      key={`${row.kind}:${row.key}`}
                      row={row}
                      late={stillLate(row) ? lateness(row.day, today) : null}
                      projects={projects}
                      onStatus={(status) => {
                        setStatus(row.key, status);
                        hold(row.key);
                      }}
                      onToggle={() => {
                        toggleTask(row.key);
                        hold(row.key);
                      }}
                    />
                  ))}
                </Group>
              )}

              {list.days.map((group) => (
                <Group
                  key={group.day}
                  label={dayLabel(group.day, today)}
                  tone={group.day === today ? "now" : "calm"}
                >
                  {group.rows.map((row) => (
                    <Line
                      key={`${row.kind}:${row.key}`}
                      row={row}
                      late={null}
                      projects={projects}
                      onStatus={(status) => {
                        setStatus(row.key, status);
                        hold(row.key);
                      }}
                      onToggle={() => {
                        toggleTask(row.key);
                        hold(row.key);
                      }}
                    />
                  ))}
                </Group>
              ))}
            </>
          )}
        </div>

        {/*
          * Rendered once, and outside the scroller.
          *
          * The board and the calendar are not being replaced, so the way back
          * to them cannot be something that appears only when this list is
          * empty or only when it is long. One row, always in the same place.
          */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          {DOORS.map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <Icon name={door.icon} size={12} />
              {door.label}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

/** One day, or the overdue pile above them all. */
function Group({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "late" | "now" | "calm";
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label}>
      <h2 className="sticky top-0 z-10 border-b border-line bg-canvas px-4 py-1.5">
        <span
          className={cn(
            "label-mono",
            tone === "late" ? "text-warn" : tone === "now" ? "text-fg" : "text-fg-subtle",
          )}
        >
          {label}
        </span>
      </h2>
      <ul className="grid gap-px px-2 py-1.5">{children}</ul>
    </section>
  );
}

const ROW = "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-sm px-2 py-1.5";
const TIME = "w-[42px] shrink-0 text-[11px] tabular-nums text-fg-subtle";

/**
 * One thing owed, whatever kind it is.
 *
 * The three kinds are told apart by what you can do to them rather than by a
 * badge: an assignment carries its three states, a task carries a box to
 * tick, an event carries neither because an event is not owed — it is the
 * shape of the day the owed things have to fit into, and it is drawn quieter
 * for the same reason.
 */
function Line({
  row,
  late,
  projects,
  onStatus,
  onToggle,
}: {
  row: Row;
  late: string | null;
  projects: Array<{ id: string; name: string }>;
  onStatus: (status: Status) => void;
  onToggle: () => void;
}) {
  if (row.kind === "event") {
    return (
      <li className={ROW}>
        <span className={TIME}>{clock(row.event.start)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-fg-muted">{row.event.title}</p>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            until {clock(row.event.end)}
            {row.event.location ? ` · ${row.event.location}` : ""}
          </p>
        </div>
      </li>
    );
  }

  if (row.kind === "task") {
    return (
      <li className={cn(ROW, "hover:bg-surface")}>
        <span className={TIME} />
        <label className="flex min-w-0 flex-1 items-baseline gap-2">
          <input
            type="checkbox"
            checked={row.task.done}
            onChange={onToggle}
            className="accent-current"
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px]",
              row.task.done ? "text-fg-subtle line-through" : "text-fg",
            )}
          >
            {row.task.title}
          </span>
        </label>
        {late && <span className="shrink-0 text-[11px] text-warn">{late}</span>}
      </li>
    );
  }

  const assignment = row.assignment;
  const project = assignment.projectId
    ? projects.find((p) => p.id === assignment.projectId)
    : undefined;

  return (
    <li className={cn(ROW, "hover:bg-surface")}>
      <span className={TIME}>{dueClock(assignment) ?? ""}</span>

      <div className="min-w-0 flex-1 basis-40">
        <p
          className={cn(
            "truncate text-[12.5px]",
            assignment.status === "handed" ? "text-fg-subtle line-through" : "text-fg",
          )}
        >
          {assignment.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-subtle">
          {late && <span className="text-warn">{late}</span>}
          {assignment.course && <span>{assignment.course}</span>}
          {assignment.projectId && (
            <Link
              href={`/p/${assignment.projectId}`}
              className="flex max-w-[180px] items-center gap-1 text-fg-muted transition-colors hover:text-fg"
            >
              <Icon name="text" size={10} className="shrink-0" />
              <span className="truncate">{project?.name ?? "the document"}</span>
            </Link>
          )}
        </p>
      </div>

      <div
        className="ml-auto flex shrink-0 rounded-xs border border-line p-0.5"
        role="group"
        aria-label={`Move ${assignment.title}`}
      >
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatus(status)}
            aria-pressed={assignment.status === status}
            className={cn(
              "rounded-xs px-1.5 py-0.5 text-[10.5px] transition-colors",
              assignment.status === status
                ? "bg-surface-2 text-fg"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * How late something is, in the words `standing` already uses for a late
 * assignment — a task has no `Assignment` to hand that function, and a
 * deadline that shows up both here and on the board should not be described
 * two different ways.
 */
function lateness(day: DayKey, today: DayKey): string {
  const days = Math.abs(daysBetween(today, day));
  return days === 1 ? "overdue by a day" : `overdue by ${days} days`;
}

/**
 * The heading for a day. Lowercased throughout, including the dates, so that
 * "today" and "friday 29 august" read as the same kind of thing rather than
 * as a word and a title.
 */
function dayLabel(day: DayKey, today: DayKey): string {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  return dateOf(day)
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toLowerCase();
}
