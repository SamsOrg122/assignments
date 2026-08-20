"use client";

/**
 * The agenda's store, and how it reaches the account.
 *
 * Local first, like everything here: the event is in this browser the moment
 * it is made, and the account is told afterwards. Sync is per-event
 * last-write-wins on `updatedAt` — the same trade the desktop notes make, for
 * the same reason: two people editing one calendar entry at the same second
 * is not the case to design for, and losing one edit beats a merge dialog on
 * a dentist appointment.
 *
 * Deletions are tombstones in the account (`deleted_at`) and plain removals
 * here; the pull filters tombstones out and removes their local copies, so a
 * deletion made on another machine lands here too.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { supabase } from "../db/client";
import {
  type AgendaEvent,
  type AgendaTask,
  type DayKey,
  type EventColor,
} from "./model";

interface AgendaState {
  events: AgendaEvent[];
  tasks: AgendaTask[];
  /** One line about the last sync failure, for the page to show. */
  problem: string | null;
  upsert: (event: AgendaEvent) => void;
  remove: (id: string) => void;
  upsertTask: (task: AgendaTask) => void;
  removeTask: (id: string) => void;
  setProblem: (problem: string | null) => void;
  /** Replace wholesale — what a pull does after merging. */
  keep: (events: AgendaEvent[], tasks: AgendaTask[]) => void;
}

export const useAgenda = create<AgendaState>()(
  persist(
    (set) => ({
      events: [],
      tasks: [],
      problem: null,
      upsert: (event) =>
        set((s) => ({
          events: [...s.events.filter((e) => e.id !== event.id), event],
        })),
      remove: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      upsertTask: (task) =>
        set((s) => ({
          tasks: [...s.tasks.filter((t) => t.id !== task.id), task],
        })),
      removeTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      setProblem: (problem) => set({ problem }),
      keep: (events, tasks) => set({ events, tasks }),
    }),
    {
      ...versioned<AgendaState>("assignments:agenda:v1", []),
      partialize: (s) => ({ events: s.events, tasks: s.tasks }),
      skipHydration: true,
    },
  ),
);

export function hydrateAgenda() {
  void useAgenda.persist.rehydrate();
}

/* ── Making and changing events ──────────────────────────────────────── */

export function createEvent(partial: {
  title: string;
  day: DayKey;
  start: number;
  end: number;
  color: EventColor;
  location?: string;
  notes?: string;
  repeat?: "none" | "weekly";
  scope?: "personal" | "team";
}): AgendaEvent {
  const event: AgendaEvent = {
    id: uid(),
    repeat: "none",
    scope: "personal",
    ...partial,
    title: partial.title.trim() || "Untitled",
    updatedAt: Date.now(),
  };
  useAgenda.getState().upsert(event);
  void push(event);
  return event;
}

export function updateEvent(event: AgendaEvent): void {
  const touched = { ...event, updatedAt: Date.now() };
  useAgenda.getState().upsert(touched);
  void push(touched);
}

export function deleteEvent(id: string): void {
  useAgenda.getState().remove(id);
  void bury("events", id);
}

/* ── Tasks: a day, a title, done or not ──────────────────────────────── */

export function createTask(partial: {
  title: string;
  day: DayKey;
  scope?: "personal" | "team";
}): AgendaTask {
  const task: AgendaTask = {
    id: uid(),
    done: false,
    scope: "personal",
    ...partial,
    title: partial.title.trim() || "Untitled",
    updatedAt: Date.now(),
  };
  useAgenda.getState().upsertTask(task);
  void pushTask(task);
  return task;
}

export function toggleTask(id: string): void {
  const task = useAgenda.getState().tasks.find((t) => t.id === id);
  if (!task) return;
  const flipped = { ...task, done: !task.done, updatedAt: Date.now() };
  useAgenda.getState().upsertTask(flipped);
  void pushTask(flipped);
}

export function deleteTask(id: string): void {
  useAgenda.getState().removeTask(id);
  void bury("agenda_tasks", id);
}

/* ── The account ─────────────────────────────────────────────────────── */

/**
 * The team's workspace in the account, found once.
 *
 * A team event's row carries the workspace id so the policy can show it to
 * every member. Personal events carry null and stay owner-only. Cached after
 * the first answer because it changes at most when somebody joins a team,
 * and a query per keystroke would be silly.
 */
let cachedWorkspace: string | null | undefined;
async function teamWorkspace(): Promise<string | null> {
  if (cachedWorkspace !== undefined) return cachedWorkspace;
  const client = supabase();
  if (!client) return (cachedWorkspace = null);
  const { data } = await client.from("workspaces").select("id").limit(1).maybeSingle();
  cachedWorkspace = data?.id ? String(data.id) : null;
  return cachedWorkspace;
}

const asRow = (event: AgendaEvent) => ({
  id: event.id,
  title: event.title,
  day: event.day,
  start_minute: event.start,
  end_minute: event.end,
  color: event.color,
  location: event.location ?? null,
  notes: event.notes ?? null,
  repeat: event.repeat,
  updated_at: new Date(event.updatedAt).toISOString(),
  deleted_at: null,
});

async function push(event: AgendaEvent): Promise<void> {
  const client = supabase();
  if (!client) return;
  const workspace = event.scope === "team" ? await teamWorkspace() : null;
  const { error } = await client
    .from("events")
    .upsert({ ...asRow(event), workspace_id: workspace }, { onConflict: "id" });
  useAgenda
    .getState()
    .setProblem(error ? `Not reaching your account: ${error.message}` : null);
}

async function pushTask(task: AgendaTask): Promise<void> {
  const client = supabase();
  if (!client) return;
  const workspace = task.scope === "team" ? await teamWorkspace() : null;
  const { error } = await client.from("agenda_tasks").upsert(
    {
      id: task.id,
      title: task.title,
      day: task.day,
      done: task.done,
      workspace_id: workspace,
      updated_at: new Date(task.updatedAt).toISOString(),
      deleted_at: null,
    },
    { onConflict: "id" },
  );
  useAgenda
    .getState()
    .setProblem(error ? `Not reaching your account: ${error.message}` : null);
}

async function bury(table: "events" | "agenda_tasks", id: string): Promise<void> {
  const client = supabase();
  if (!client) return;
  const now = new Date().toISOString();
  const { error } = await client
    .from(table)
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
  useAgenda
    .getState()
    .setProblem(error ? `Not reaching your account: ${error.message}` : null);
}

/**
 * Bring the account's copy in, newest edit winning per event.
 *
 * Everything, every time — an agenda is hundreds of rows at most, and the
 * bookkeeping for "only what changed" costs more than it saves at that size
 * (the same call the desktop notes made).
 */
export async function pullAgenda(): Promise<void> {
  const client = supabase();
  if (!client) return;

  const [eventRows, taskRows] = await Promise.all([
    client
      .from("events")
      .select(
        "id,title,day,start_minute,end_minute,color,location,notes,repeat,workspace_id,updated_at,deleted_at",
      ),
    client
      .from("agenda_tasks")
      .select("id,title,day,done,workspace_id,updated_at,deleted_at"),
  ]);

  if (eventRows.error) {
    useAgenda.getState().setProblem(`Not reaching your account: ${eventRows.error.message}`);
    return;
  }
  // A deployment that has run 0006 but not 0007 has events and no tasks
  // table. Events still sync; tasks stay local; the page's banner names the
  // migration rather than this failing the whole pull.
  const tasksMissing = Boolean(taskRows.error);

  const localEvents = new Map(useAgenda.getState().events.map((e) => [e.id, e]));
  const events = new Map(localEvents);

  for (const row of eventRows.data ?? []) {
    const id = String(row.id);
    const theirs = Date.parse(String(row.updated_at)) || 0;
    const mine = localEvents.get(id);

    if (row.deleted_at) {
      // Their deletion beats my copy unless my copy is a newer edit — the
      // same "editing is deciding to keep it" rule the notes use.
      if (!mine || mine.updatedAt <= theirs) events.delete(id);
      continue;
    }
    if (mine && mine.updatedAt > theirs) continue;

    events.set(id, {
      id,
      title: String(row.title ?? "Untitled"),
      scope: row.workspace_id ? "team" : "personal",
      day: String(row.day),
      start: Number(row.start_minute) || 0,
      end: Number(row.end_minute) || 0,
      color: (row.color as AgendaEvent["color"]) ?? "slate",
      location: row.location ? String(row.location) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      repeat: row.repeat === "weekly" ? "weekly" : "none",
      updatedAt: theirs,
    });
  }

  const localTasks = new Map(useAgenda.getState().tasks.map((t) => [t.id, t]));
  const tasks = new Map(localTasks);
  if (!tasksMissing) {
    for (const row of taskRows.data ?? []) {
      const id = String(row.id);
      const theirs = Date.parse(String(row.updated_at)) || 0;
      const mine = localTasks.get(id);
      if (row.deleted_at) {
        if (!mine || mine.updatedAt <= theirs) tasks.delete(id);
        continue;
      }
      if (mine && mine.updatedAt > theirs) continue;
      tasks.set(id, {
        id,
        title: String(row.title ?? "Untitled"),
        day: String(row.day),
        done: Boolean(row.done),
        scope: row.workspace_id ? "team" : "personal",
        updatedAt: theirs,
      });
    }
  }

  useAgenda.getState().keep([...events.values()], [...tasks.values()]);
  useAgenda
    .getState()
    .setProblem(
      tasksMissing
        ? "Tasks aren't syncing yet — run supabase/migrations/0007 in the SQL editor."
        : null,
    );

  // Anything made while signed out or offline has never been pushed. The
  // account's copy of those is either absent or older, so pushing everything
  // newer than the pull is cheap and closes the gap.
  for (const event of events.values()) {
    const theirs = (eventRows.data ?? []).find((r) => String(r.id) === event.id);
    if (!theirs || (Date.parse(String(theirs.updated_at)) || 0) < event.updatedAt) {
      void push(event);
    }
  }
  if (!tasksMissing) {
    for (const task of tasks.values()) {
      const theirs = (taskRows.data ?? []).find((r) => String(r.id) === task.id);
      if (!theirs || (Date.parse(String(theirs.updated_at)) || 0) < task.updatedAt) {
        void pushTask(task);
      }
    }
  }
}
