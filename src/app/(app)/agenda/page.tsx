"use client";

/**
 * The agenda.
 *
 * A week of columns with the day's shape drawn in blocks — modelled on the
 * timetable it replaces: hours down the side, Monday first, colour carrying
 * the kind of thing, repeats marked, and a Day / Week / Month switch at the
 * top. Clicking an empty slot makes an event there; clicking a block edits
 * it.
 *
 * Everything is local first and reaches the account afterwards, like the
 * rest of the tool — the page works signed out, and says so quietly rather
 * than gating.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  createEvent,
  createTask,
  deleteEvent,
  deleteTask,
  hydrateAgenda,
  pullAgenda,
  toggleTask,
  updateEvent,
  useAgenda,
} from "@/lib/agenda";
import { parseQuick } from "@/lib/agenda/quick";
import { hydrateAssignments, pullAssignments, useAssignments } from "@/lib/assignments";
import { dueClock, standing, type Assignment } from "@/lib/assignments/model";
import { hydrateScope, useHasTeam, useScope } from "@/lib/scope";
import {
  addDays,
  clock,
  dateOf,
  eventsOn,
  keyOf,
  layout,
  monthGrid,
  sameMonth,
  snap,
  weekOf,
  type AgendaEvent,
  type AgendaTask,
  type DayKey,
} from "@/lib/agenda/model";
import { blockStyle } from "@/components/agenda/palette";
import {
  draftFrom,
  EventEditor,
  type Draft,
} from "@/components/agenda/EventEditor";

type View = "day" | "week" | "month";

/** Pixels per hour. The whole grid's scale hangs off this one number. */
const HOUR = 52;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AgendaPage() {
  const allEvents = useAgenda((s) => s.events);
  const allTasks = useAgenda((s) => s.tasks);
  const allAssignments = useAssignments((s) => s.assignments);
  const problem = useAgenda((s) => s.problem);
  const chosen = useScope((s) => s.scope);
  const setScope = useScope((s) => s.setScope);
  const hasTeam = useHasTeam();
  // Without a team there is no team agenda, so the switch upstairs cannot
  // empty this page — "you don't even have that option" includes not having
  // the empty calendar behind it.
  const scope = hasTeam ? chosen : "personal";

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<DayKey>(() => keyOf(new Date()));
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showBoth, setShowBoth] = useState(false);
  const [quick, setQuick] = useState("");

  useEffect(() => {
    hydrateAgenda();
    hydrateAssignments();
    hydrateScope();
    void pullAgenda();
    void pullAssignments();
  }, []);

  /*
   * Which calendar is on the grid.
   *
   * The switch picks one; "both" overlays the other at reduced strength so a
   * clash between your dentist and the team's standup is visible without the
   * two agendas bleeding into one. Without a team there is nothing to
   * overlay and the whole apparatus stays out of the way.
   */
  const events = useMemo(
    () =>
      showBoth && hasTeam
        ? allEvents
        : allEvents.filter((e) => (e.scope ?? "personal") === scope),
    [allEvents, scope, showBoth, hasTeam],
  );
  const tasks = useMemo(
    () =>
      showBoth && hasTeam
        ? allTasks
        : allTasks.filter((t) => (t.scope ?? "personal") === scope),
    [allTasks, scope, showBoth, hasTeam],
  );

  // Deadlines belong on the calendar even though they are kept elsewhere:
  // somebody planning a week needs the essay due Friday in the same picture
  // as the lectures, or the picture is wrong. Handed-in work drops out — it
  // is no longer something to plan around.
  const due = useMemo(
    () =>
      allAssignments.filter(
        (a) =>
          a.status !== "handed" &&
          (showBoth && hasTeam ? true : (a.scope ?? "personal") === scope),
      ),
    [allAssignments, scope, showBoth, hasTeam],
  );

  const today = keyOf(new Date());
  const days = useMemo(
    () => (view === "day" ? [anchor] : weekOf(anchor)),
    [view, anchor],
  );

  const jump = (direction: -1 | 1) => {
    const step = view === "day" ? 1 : view === "week" ? 7 : 0;
    if (view === "month") {
      const date = dateOf(anchor);
      date.setMonth(date.getMonth() + direction, 1);
      setAnchor(keyOf(date));
    } else {
      setAnchor(addDays(anchor, step * direction));
    }
  };

  const label = dateOf(anchor).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const startNew = (day: DayKey, minute: number) => {
    const start = snap(minute);
    setEditing({
      title: "",
      day,
      start,
      end: Math.min(24 * 60, start + 60),
      color: "slate",
      location: "",
      notes: "",
      repeat: "none",
      scope,
    });
  };

  const save = (draft: Draft) => {
    if (draft.id) {
      const was = allEvents.find((e) => e.id === draft.id);
      if (was)
        updateEvent({
          ...was,
          title: draft.title.trim() || "Untitled",
          day: draft.day,
          start: draft.start,
          end: draft.end,
          color: draft.color,
          location: draft.location.trim() || undefined,
          notes: draft.notes.trim() || undefined,
          repeat: draft.repeat,
          scope: draft.scope,
        });
    } else {
      createEvent({
        title: draft.title,
        day: draft.day,
        start: draft.start,
        end: draft.end,
        color: draft.color,
        location: draft.location.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        repeat: draft.repeat,
        scope: draft.scope,
      });
    }
    setEditing(null);
  };

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() => startNew(today, 9 * 60)}
            className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={12} />
            New event
          </button>
        }
      >
        <span className="text-[13px] font-medium text-fg">Agenda</span>
      </TopBar>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* ── The bar: where, and which view ─────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <h1 className="text-[15px] font-medium tracking-tight text-fg">
            {label}
          </h1>

          <div className="ml-2 flex items-center gap-0.5">
            <button type="button" aria-label="Previous" onClick={() => jump(-1)} className="rounded-sm px-1.5 py-1 text-fg-muted hover:bg-surface hover:text-fg">
              <Icon name="chevron-left" size={13} />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="rounded-sm px-2 py-1 text-[11.5px] text-fg-muted hover:bg-surface hover:text-fg"
            >
              Today
            </button>
            <button type="button" aria-label="Next" onClick={() => jump(1)} className="rounded-sm px-1.5 py-1 text-fg-muted hover:bg-surface hover:text-fg">
              <Icon name="chevron-right" size={13} />
            </button>
          </div>

          {/* Quick add. A time makes an event, no time makes a task — the
              parser's rule, stated in the placeholder by example. */}
          <form
            className="min-w-0 flex-1 basis-48"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parseQuick(quick);
              if (!parsed) return;
              if (parsed.kind === "task") {
                createTask({ title: parsed.title, day: parsed.day, scope });
              } else {
                createEvent({
                  title: parsed.title,
                  day: parsed.day,
                  start: parsed.start,
                  end: parsed.end,
                  color: "slate",
                  repeat: parsed.repeat,
                  scope,
                });
              }
              setQuick("");
            }}
          >
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder={'Quick add — "wiskunde ma 9:30-11" or "morgen afwassen"'}
              aria-label="Quick add"
              className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
            />
          </form>

          {hasTeam ? (
            <div className="flex items-center gap-1.5">
              <div
                className="flex rounded-sm border border-line p-0.5"
                role="tablist"
                aria-label="Whose agenda"
              >
                {(["personal", "team"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={scope === option}
                    onClick={() => setScope(option)}
                    className={cn(
                      "rounded-xs px-2 py-1 text-[11.5px] capitalize transition-colors",
                      scope === option
                        ? "bg-surface-3 text-fg"
                        : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-[11px] text-fg-muted">
                <input
                  type="checkbox"
                  checked={showBoth}
                  onChange={(e) => setShowBoth(e.target.checked)}
                />
                both
              </label>
            </div>
          ) : null}

          {problem ? (
            <span className="min-w-0 truncate text-[11px] text-warn">{problem}</span>
          ) : null}

          {/* The switch, exactly as the reference has it. */}
          <div className="ml-auto flex rounded-sm border border-line p-0.5" role="tablist" aria-label="View">
            {(["day", "week", "month"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "rounded-xs px-2.5 py-1 text-[11.5px] capitalize transition-colors",
                  view === option
                    ? "bg-surface-3 text-fg"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <MonthView
            anchor={anchor}
            today={today}
            events={events}
            onOpenDay={(day) => {
              setAnchor(day);
              setView("day");
            }}
          />
        ) : (
          <TimeGrid
            days={days}
            today={today}
            events={events}
            tasks={tasks}
            due={due}
            scope={scope}
            onCreate={startNew}
            onEdit={(event) => setEditing(draftFrom(event))}
          />
        )}
      </main>

      {editing ? (
        <EventEditor
          draft={editing}
          hasTeam={hasTeam}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={
            editing.id
              ? () => {
                  deleteEvent(editing.id!);
                  setEditing(null);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

/* ── The hour grid: day and week are the same thing, 1 or 7 wide ──────── */

function TimeGrid({
  days,
  today,
  events,
  tasks,
  due,
  scope,
  onCreate,
  onEdit,
}: {
  days: DayKey[];
  today: DayKey;
  events: AgendaEvent[];
  tasks: AgendaTask[];
  due: Assignment[];
  scope: "personal" | "team";
  onCreate: (day: DayKey, minute: number) => void;
  onEdit: (event: AgendaEvent) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Opened at the working day, not at midnight — the reference grid starts
    // where the day starts.
    scroller.current?.scrollTo({ top: HOUR * 7.5 });
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headings, outside the scroll so they stay put. */}
      <div className="grid border-b border-line pr-2" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <span />
        {days.map((day) => {
          const date = dateOf(day);
          return (
            <div key={day} className="border-l border-line px-2 py-1.5">
              <span className={cn("text-[11.5px]", day === today ? "font-medium text-accent" : "text-fg-muted")}>
                {DAY_NAMES[(date.getDay() + 6) % 7]} {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Deadlines, above everything. A row that is empty most weeks and
          impossible to miss in the one that matters. */}
      {due.some((a) => days.includes(a.due)) && (
        <div
          role="group"
          aria-label="Deadlines"
          className="grid border-b border-line pr-2"
          style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
        >
          <span className="self-center pr-2 text-right text-[9.5px] uppercase tracking-wide text-fg-subtle">
            due
          </span>
          {days.map((day) => (
            <div key={day} className="min-h-[26px] border-l border-line px-1.5 py-1">
              {due
                .filter((assignment) => assignment.due === day)
                .map((assignment) => {
                  const how = standing(assignment, today);
                  const time = dueClock(assignment);
                  return (
                    <Link
                      key={assignment.id}
                      href="/assignments"
                      title={`${assignment.title} — ${how.text}`}
                      className={cn(
                        "flex items-center gap-1 truncate rounded-xs px-1 py-0.5 text-[11px] transition-colors hover:bg-surface",
                        how.tone === "late" ? "text-warn" : "text-fg-muted",
                        (assignment.scope ?? "personal") !== scope && "opacity-60",
                      )}
                    >
                      <Icon name="check" size={9} className="shrink-0" />
                      <span className="truncate">{assignment.title}</span>
                      {time && <span className="shrink-0 tabular-nums">{time}</span>}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      )}

      {/* The day's tasks, above the hours: things to do that have no time.
          Ticking one is the whole interaction, so it happens here, not in an
          editor. */}
      <div
        className="grid border-b border-line pr-2"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
      >
        <span className="self-center pr-2 text-right text-[9.5px] uppercase tracking-wide text-fg-subtle">
          tasks
        </span>
        {days.map((day) => {
          const here = tasks
            .filter((task) => task.day === day)
            .sort((a, b) => Number(a.done) - Number(b.done) || a.updatedAt - b.updatedAt);
          return (
            <div key={day} className="min-h-[26px] border-l border-line px-1.5 py-1">
              {here.map((task) => (
                <span key={task.id} className="group flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggleTask(task.id)}
                    aria-label={`${task.title}, ${task.done ? "done" : "to do"}`}
                    className="size-3 accent-current"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[11px]",
                      task.done ? "text-fg-subtle line-through" : "text-fg-muted",
                      (task.scope ?? "personal") !== scope && "opacity-60",
                    )}
                  >
                    {task.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTask(task.id)}
                    aria-label={`Delete ${task.title}`}
                    className="hidden shrink-0 rounded-xs p-0.5 text-fg-subtle hover:text-fg group-hover:block"
                  >
                    <Icon name="x" size={9} />
                  </button>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid pr-2" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)`, height: HOUR * 24 }}>
          {/* Hours down the side */}
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => (
              <span
                key={i}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-fg-subtle"
                style={{ top: HOUR * (i + 1) }}
              >
                {String(i + 1).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {days.map((day) => {
            const placed = layout(eventsOn(events, day));
            return (
              <div
                key={day}
                data-day={day}
                className="relative border-l border-line"
                onClick={(e) => {
                  // Only the empty grid: a click on a block is editing.
                  if (e.target !== e.currentTarget) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  const minute = ((e.clientY - box.top) / HOUR) * 60;
                  onCreate(day, minute);
                }}
              >
                {/* Hour rules */}
                {Array.from({ length: 23 }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-line/50"
                    style={{ top: HOUR * (i + 1) }}
                  />
                ))}

                {day === today ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-accent"
                    style={{ top: nowTop }}
                  />
                ) : null}

                {placed.map(({ event, column, of }) => (
                  <button
                    key={event.id + day}
                    type="button"
                    onClick={() => onEdit(event)}
                    className={cn(
                      "absolute overflow-hidden rounded-sm px-1.5 py-1 text-left transition-[filter] hover:brightness-110",
                      (event.scope ?? "personal") !== scope && "opacity-55",
                    )}
                    style={{
                      ...blockStyle(event.color),
                      top: (event.start / 60) * HOUR + 1,
                      height: Math.max(18, ((event.end - event.start) / 60) * HOUR - 2),
                      left: `calc(${(column / of) * 100}% + 2px)`,
                      width: `calc(${100 / of}% - 4px)`,
                    }}
                  >
                    <span className="block truncate text-[11.5px] font-medium leading-tight text-fg">
                      {event.title}
                      {event.repeat === "weekly" ? (
                        <Icon name="refresh" size={9} className="ml-1 inline-block opacity-60" />
                      ) : null}
                    </span>
                    <span className="block truncate text-[10px] text-fg-muted">
                      {clock(event.start)}–{clock(event.end)}
                    </span>
                    {event.location ? (
                      <span className="block truncate text-[10px] text-fg-subtle">
                        {event.location}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── The month: shape at a glance, days as doors ──────────────────────── */

function MonthView({
  anchor,
  today,
  events,
  onOpenDay,
}: {
  anchor: DayKey;
  today: DayKey;
  events: AgendaEvent[];
  onOpenDay: (day: DayKey) => void;
}) {
  const days = monthGrid(anchor);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-line bg-line">
        {DAY_NAMES.map((name) => (
          <span key={name} className="bg-surface px-2 py-1 text-[10.5px] text-fg-subtle">
            {name}
          </span>
        ))}
        {days.map((day) => {
          const here = eventsOn(events, day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              className={cn(
                "min-h-[84px] bg-canvas px-1.5 py-1 text-left align-top transition-colors hover:bg-surface",
                !sameMonth(day, anchor) && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  day === today
                    ? "inline-block rounded-full bg-accent px-1.5 text-on-accent"
                    : "text-fg-muted",
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span className="mt-0.5 block space-y-0.5">
                {here.slice(0, 3).map((event) => (
                  <span
                    key={event.id + day}
                    className="block truncate rounded-xs px-1 text-[10px] leading-4 text-fg"
                    style={blockStyle(event.color)}
                  >
                    {event.title}
                  </span>
                ))}
                {here.length > 3 ? (
                  <span className="block px-1 text-[10px] text-fg-subtle">
                    +{here.length - 3} more
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
