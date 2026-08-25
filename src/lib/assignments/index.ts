"use client";

/**
 * The assignments store, and how it reaches the account.
 *
 * Deliberately the same shape as `lib/agenda`: local first, per-row
 * last-write-wins on `updatedAt`, tombstones in the account and plain
 * removals here. Two stores that sync the same way should be readable as the
 * same thing, and the differences that remain — three states instead of a
 * boolean, a document on the row — are then the only differences.
 *
 * A deployment that has not run migration 0013 has no `assignments` table.
 * That is not a fault to throw about: everything stays local, works, and the
 * page says which file to run. Half the point of local-first is that the
 * database being behind is survivable.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { supabase } from "../db/client";
import type { DayKey } from "../agenda/model";
import type { Assignment, Status } from "./model";

interface AssignmentState {
  assignments: Assignment[];
  /** One line about the last sync failure, for the page to show. */
  problem: string | null;
  upsert: (assignment: Assignment) => void;
  remove: (id: string) => void;
  setProblem: (problem: string | null) => void;
  /** Replace wholesale — what a pull does after merging. */
  keep: (assignments: Assignment[]) => void;
}

export const useAssignments = create<AssignmentState>()(
  persist(
    (set) => ({
      assignments: [],
      problem: null,
      upsert: (assignment) =>
        set((s) => ({
          assignments: [
            ...s.assignments.filter((a) => a.id !== assignment.id),
            assignment,
          ],
        })),
      remove: (id) =>
        set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) })),
      setProblem: (problem) => set({ problem }),
      keep: (assignments) => set({ assignments }),
    }),
    {
      ...versioned<AssignmentState>("assignments:work:v1", []),
      partialize: (s) => ({ assignments: s.assignments }),
      skipHydration: true,
    },
  ),
);

export function hydrateAssignments() {
  void useAssignments.persist.rehydrate();
}

/* ── Making and changing ─────────────────────────────────────────────── */

export function createAssignment(partial: {
  title: string;
  due: DayKey;
  dueMinute?: number;
  course?: string;
  notes?: string;
  projectId?: string;
  scope?: "personal" | "team";
}): Assignment {
  const assignment: Assignment = {
    id: uid(),
    status: "todo",
    scope: "personal",
    ...partial,
    title: partial.title.trim() || "Untitled",
    updatedAt: Date.now(),
  };
  useAssignments.getState().upsert(assignment);
  void push(assignment);
  return assignment;
}

export function updateAssignment(assignment: Assignment): void {
  const touched = { ...assignment, updatedAt: Date.now() };
  useAssignments.getState().upsert(touched);
  void push(touched);
}

/** Change one field without the caller having to rebuild the whole record. */
function patch(id: string, change: Partial<Assignment>): void {
  const current = useAssignments.getState().assignments.find((a) => a.id === id);
  if (!current) return;
  updateAssignment({ ...current, ...change });
}

export function setStatus(id: string, status: Status): void {
  patch(id, { status });
}

/** Point an assignment at the document being written for it. */
export function linkProject(id: string, projectId: string | undefined): void {
  patch(id, { projectId });
}

export function deleteAssignment(id: string): void {
  useAssignments.getState().remove(id);
  void bury(id);
}

/* ── The account ─────────────────────────────────────────────────────── */

/**
 * The team's workspace, found once.
 *
 * Same reasoning as the agenda's copy: a team row carries the workspace id so
 * the policy shows it to every member, personal rows carry null, and this
 * changes at most when somebody joins a team.
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

/**
 * Whether the account has this table at all.
 *
 * Remembered after the first refusal so a page full of cards does not fire a
 * failing request per card. `pullAssignments` clears it, which is what makes
 * running the migration and pressing refresh work without a reload.
 */
let tableMissing = false;

const missing = (message: string) =>
  /assignments/i.test(message) &&
  /(does not exist|schema cache|not find the table)/i.test(message);

function report(error: { message: string } | null): void {
  const state = useAssignments.getState();
  if (!error) return state.setProblem(null);
  if (missing(error.message)) {
    tableMissing = true;
    return state.setProblem(
      "Assignments aren't syncing yet — run supabase/migrations/0013 in the SQL editor.",
    );
  }
  state.setProblem(`Not reaching your account: ${error.message}`);
}

async function push(assignment: Assignment): Promise<void> {
  const client = supabase();
  if (!client || tableMissing) return;
  const workspace = assignment.scope === "team" ? await teamWorkspace() : null;
  const { error } = await client.from("assignments").upsert(
    {
      id: assignment.id,
      title: assignment.title,
      course: assignment.course ?? null,
      due: assignment.due,
      due_minute: assignment.dueMinute ?? null,
      status: assignment.status,
      project_id: assignment.projectId ?? null,
      notes: assignment.notes ?? null,
      workspace_id: workspace,
      updated_at: new Date(assignment.updatedAt).toISOString(),
      deleted_at: null,
    },
    { onConflict: "id" },
  );
  report(error);
}

async function bury(id: string): Promise<void> {
  const client = supabase();
  if (!client || tableMissing) return;
  const now = new Date().toISOString();
  const { error } = await client
    .from("assignments")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
  report(error);
}

const rowToAssignment = (row: Record<string, unknown>, updatedAt: number): Assignment => ({
  id: String(row.id),
  title: String(row.title ?? "Untitled"),
  course: row.course ? String(row.course) : undefined,
  due: String(row.due),
  dueMinute: row.due_minute === null || row.due_minute === undefined
    ? undefined
    : Number(row.due_minute),
  status:
    row.status === "doing" || row.status === "handed" ? (row.status as Status) : "todo",
  projectId: row.project_id ? String(row.project_id) : undefined,
  notes: row.notes ? String(row.notes) : undefined,
  scope: row.workspace_id ? "team" : "personal",
  updatedAt,
});

/**
 * Bring the account's copy in, newest edit winning per row.
 *
 * Everything, every time. A person has tens of assignments, not thousands,
 * and the bookkeeping for "only what changed" would cost more than it saves —
 * the same call the agenda and the notes made.
 */
export async function pullAssignments(): Promise<void> {
  const client = supabase();
  if (!client) return;

  // A retry after the migration has been run should work, so the memo that
  // the table is missing is dropped here rather than kept for the session.
  tableMissing = false;

  const { data, error } = await client
    .from("assignments")
    .select(
      "id,title,course,due,due_minute,status,project_id,notes,workspace_id,updated_at,deleted_at",
    );

  if (error) return report(error);

  const local = new Map(useAssignments.getState().assignments.map((a) => [a.id, a]));
  const merged = new Map(local);

  for (const row of data ?? []) {
    const id = String(row.id);
    const theirs = Date.parse(String(row.updated_at)) || 0;
    const mine = local.get(id);

    if (row.deleted_at) {
      // Their deletion beats my copy unless my copy is a newer edit — the
      // same "editing is deciding to keep it" rule the agenda uses.
      if (!mine || mine.updatedAt <= theirs) merged.delete(id);
      continue;
    }
    if (mine && mine.updatedAt > theirs) continue;
    merged.set(id, rowToAssignment(row as Record<string, unknown>, theirs));
  }

  useAssignments.getState().keep([...merged.values()]);
  useAssignments.getState().setProblem(null);

  // Anything made while signed out has never been pushed; the account's copy
  // is absent or older, so pushing those closes the gap cheaply.
  for (const assignment of merged.values()) {
    const theirs = (data ?? []).find((r) => String(r.id) === assignment.id);
    if (!theirs || (Date.parse(String(theirs.updated_at)) || 0) < assignment.updatedAt) {
      void push(assignment);
    }
  }
}
