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
  type DayKey,
  type EventColor,
} from "./model";

interface AgendaState {
  events: AgendaEvent[];
  /** One line about the last sync failure, for the page to show. */
  problem: string | null;
  upsert: (event: AgendaEvent) => void;
  remove: (id: string) => void;
  setProblem: (problem: string | null) => void;
  /** Replace wholesale — what a pull does after merging. */
  keep: (events: AgendaEvent[]) => void;
}

export const useAgenda = create<AgendaState>()(
  persist(
    (set) => ({
      events: [],
      problem: null,
      upsert: (event) =>
        set((s) => ({
          events: [...s.events.filter((e) => e.id !== event.id), event],
        })),
      remove: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      setProblem: (problem) => set({ problem }),
      keep: (events) => set({ events }),
    }),
    {
      ...versioned<AgendaState>("assignments:agenda:v1", []),
      partialize: (s) => ({ events: s.events }),
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
}): AgendaEvent {
  const event: AgendaEvent = {
    id: uid(),
    repeat: "none",
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
  void bury(id);
}

/* ── The account ─────────────────────────────────────────────────────── */

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
  const { error } = await client
    .from("events")
    .upsert(asRow(event), { onConflict: "id" });
  useAgenda
    .getState()
    .setProblem(error ? `Not reaching your account: ${error.message}` : null);
}

async function bury(id: string): Promise<void> {
  const client = supabase();
  if (!client) return;
  const now = new Date().toISOString();
  const { error } = await client
    .from("events")
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

  const { data, error } = await client
    .from("events")
    .select(
      "id,title,day,start_minute,end_minute,color,location,notes,repeat,updated_at,deleted_at",
    );
  if (error) {
    useAgenda.getState().setProblem(`Not reaching your account: ${error.message}`);
    return;
  }

  const local = new Map(useAgenda.getState().events.map((e) => [e.id, e]));
  const merged = new Map(local);

  for (const row of data ?? []) {
    const id = String(row.id);
    const theirs = Date.parse(String(row.updated_at)) || 0;
    const mine = local.get(id);

    if (row.deleted_at) {
      // Their deletion beats my copy unless my copy is a newer edit — the
      // same "editing is deciding to keep it" rule the notes use.
      if (!mine || mine.updatedAt <= theirs) merged.delete(id);
      continue;
    }
    if (mine && mine.updatedAt > theirs) continue;

    merged.set(id, {
      id,
      title: String(row.title ?? "Untitled"),
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

  useAgenda.getState().keep([...merged.values()]);
  useAgenda.getState().setProblem(null);

  // Anything made while signed out or offline has never been pushed. The
  // account's copy of those is either absent or older, so pushing everything
  // newer than the pull is cheap and closes the gap.
  for (const event of merged.values()) {
    const theirs = (data ?? []).find((r) => String(r.id) === event.id);
    if (!theirs || (Date.parse(String(theirs.updated_at)) || 0) < event.updatedAt) {
      void push(event);
    }
  }
}
