"use client";

/**
 * The study sets store, and how it reaches the account.
 *
 * The same shape as `lib/agenda` and `lib/assignments`, once more on
 * purpose: local first, per-row last-write-wins on `updatedAt`, tombstones in
 * the account, and a deployment without the migration keeps working locally
 * and says which file to run. Three stores that sync the same way should read
 * as the same thing.
 *
 * The cards travel as one JSON document rather than a row each, and so does
 * the progress inside them — a set is studied whole, and which box a card is
 * in is only meaningful next to the card it belongs to.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { supabase } from "../db/client";
import type { DayKey } from "../agenda/model";
import { afterAnswer, type Card, type StudySet } from "./model";

interface StudyState {
  sets: StudySet[];
  problem: string | null;
  upsert: (set: StudySet) => void;
  remove: (id: string) => void;
  setProblem: (problem: string | null) => void;
  keep: (sets: StudySet[]) => void;
}

export const useStudy = create<StudyState>()(
  persist(
    (set) => ({
      sets: [],
      problem: null,
      upsert: (studySet) =>
        set((s) => ({ sets: [...s.sets.filter((x) => x.id !== studySet.id), studySet] })),
      remove: (id) => set((s) => ({ sets: s.sets.filter((x) => x.id !== id) })),
      setProblem: (problem) => set({ problem }),
      keep: (sets) => set({ sets }),
    }),
    {
      ...versioned<StudyState>("assignments:study:v1", []),
      partialize: (s) => ({ sets: s.sets }),
      skipHydration: true,
    },
  ),
);

export function hydrateStudy() {
  void useStudy.persist.rehydrate();
}

/* ── Making and changing ─────────────────────────────────────────────── */

/** A set from cards the endpoint made. Every card starts in the first box. */
export function createSet(partial: {
  name: string;
  source?: string;
  cards: Array<{ front: string; back: string }>;
  scope?: "personal" | "team";
}): StudySet {
  const studySet: StudySet = {
    id: uid(),
    name: partial.name.trim() || "Untitled set",
    source: partial.source,
    scope: partial.scope ?? "personal",
    cards: partial.cards.map((card) => ({ id: uid(), ...card, box: 0 })),
    updatedAt: Date.now(),
  };
  useStudy.getState().upsert(studySet);
  void push(studySet);
  return studySet;
}

function patch(id: string, change: (set: StudySet) => StudySet): void {
  const current = useStudy.getState().sets.find((s) => s.id === id);
  if (!current) return;
  const next = { ...change(current), updatedAt: Date.now() };
  useStudy.getState().upsert(next);
  void push(next);
}

/** Record an answer and move the card to the box it has earned. */
export function answer(setId: string, cardId: string, right: boolean, today: DayKey): void {
  patch(setId, (set) => ({
    ...set,
    cards: set.cards.map((card) =>
      card.id === cardId ? afterAnswer(card, right, today) : card,
    ),
  }));
}

/**
 * Put every card back in the first box.
 *
 * Not a delete-and-remake: somebody revising for a resit wants the same
 * cards, and losing the set to get them back would be an absurd trade.
 */
export function resetProgress(setId: string): void {
  patch(setId, (set) => ({
    ...set,
    cards: set.cards.map((card) => ({ ...card, box: 0, dueDay: undefined })),
  }));
}

/** Correct a card. The model wrote it; the person studying it knows better. */
export function editCard(setId: string, cardId: string, change: Partial<Card>): void {
  patch(setId, (set) => ({
    ...set,
    cards: set.cards.map((card) => (card.id === cardId ? { ...card, ...change } : card)),
  }));
}

/** Throw one out — a card that is wrong is worse than one that is missing. */
export function dropCard(setId: string, cardId: string): void {
  patch(setId, (set) => ({
    ...set,
    cards: set.cards.filter((card) => card.id !== cardId),
  }));
}

export function renameSet(setId: string, name: string): void {
  const next = name.trim();
  if (!next) return;
  patch(setId, (set) => ({ ...set, name: next }));
}

export function deleteSet(id: string): void {
  useStudy.getState().remove(id);
  void bury(id);
}

/* ── The account ─────────────────────────────────────────────────────── */

let cachedWorkspace: string | null | undefined;
async function teamWorkspace(): Promise<string | null> {
  if (cachedWorkspace !== undefined) return cachedWorkspace;
  const client = supabase();
  if (!client) return (cachedWorkspace = null);
  const { data } = await client.from("workspaces").select("id").limit(1).maybeSingle();
  cachedWorkspace = data?.id ? String(data.id) : null;
  return cachedWorkspace;
}

/** Remembered after the first refusal, so a page of sets asks once. */
let tableMissing = false;

const missing = (message: string) =>
  /study_sets/i.test(message) &&
  /(does not exist|schema cache|not find the table)/i.test(message);

function report(error: { message: string } | null): void {
  const state = useStudy.getState();
  if (!error) return state.setProblem(null);
  if (missing(error.message)) {
    tableMissing = true;
    return state.setProblem(
      "Study sets aren't syncing yet — run supabase/migrations/0014 in the SQL editor.",
    );
  }
  state.setProblem(`Not reaching your account: ${error.message}`);
}

async function push(studySet: StudySet): Promise<void> {
  const client = supabase();
  if (!client || tableMissing) return;
  const workspace = studySet.scope === "team" ? await teamWorkspace() : null;
  const { error } = await client.from("study_sets").upsert(
    {
      id: studySet.id,
      name: studySet.name,
      source: studySet.source ?? null,
      cards: studySet.cards,
      workspace_id: workspace,
      updated_at: new Date(studySet.updatedAt).toISOString(),
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
    .from("study_sets")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
  report(error);
}

/**
 * A row's cards, with anything malformed left out.
 *
 * The column only promises an array. What is in it came from this app, but
 * "came from this app" includes a version of it that has not been written
 * yet, so each card is checked rather than trusted.
 */
const cardsOf = (raw: unknown): Card[] => {
  if (!Array.isArray(raw)) return [];
  const cards: Card[] = [];
  for (const item of raw) {
    const card = item as Record<string, unknown>;
    const front = typeof card?.front === "string" ? card.front : "";
    const back = typeof card?.back === "string" ? card.back : "";
    if (!front || !back) continue;
    cards.push({
      id: typeof card.id === "string" ? card.id : uid(),
      front,
      back,
      box: typeof card.box === "number" && card.box >= 0 ? Math.min(4, card.box) : 0,
      dueDay: typeof card.dueDay === "string" ? card.dueDay : undefined,
    });
  }
  return cards;
};

/** Bring the account's copy in, newest edit winning per set. */
export async function pullStudy(): Promise<void> {
  const client = supabase();
  if (!client) return;

  tableMissing = false;

  const { data, error } = await client
    .from("study_sets")
    .select("id,name,source,cards,workspace_id,updated_at,deleted_at");

  if (error) return report(error);

  const local = new Map(useStudy.getState().sets.map((s) => [s.id, s]));
  const merged = new Map(local);

  for (const row of data ?? []) {
    const id = String(row.id);
    const theirs = Date.parse(String(row.updated_at)) || 0;
    const mine = local.get(id);

    if (row.deleted_at) {
      if (!mine || mine.updatedAt <= theirs) merged.delete(id);
      continue;
    }
    if (mine && mine.updatedAt > theirs) continue;

    merged.set(id, {
      id,
      name: String(row.name ?? "Untitled set"),
      source: row.source ? String(row.source) : undefined,
      cards: cardsOf(row.cards),
      scope: row.workspace_id ? "team" : "personal",
      updatedAt: theirs,
    });
  }

  useStudy.getState().keep([...merged.values()]);
  useStudy.getState().setProblem(null);

  for (const studySet of merged.values()) {
    const theirs = (data ?? []).find((r) => String(r.id) === studySet.id);
    if (!theirs || (Date.parse(String(theirs.updated_at)) || 0) < studySet.updatedAt) {
      void push(studySet);
    }
  }
}

/* ── Asking for cards ────────────────────────────────────────────────── */

export interface MadeCards {
  cards: Array<{ front: string; back: string }>;
  /** How many the endpoint threw out. Said out loud, never hidden. */
  dropped: number;
}

/**
 * Ask the server to make cards from some text.
 *
 * The session token goes with it for the same reason every other endpoint
 * gets one: the key is server-side, and the account is what the daily
 * allowance is counted against.
 */
export async function makeCards(
  text: string,
  kind: "cards" | "questions",
  count: number,
  signal?: AbortSignal,
): Promise<MadeCards> {
  const client = supabase();
  const token = client
    ? (await client.auth.getSession()).data.session?.access_token
    : undefined;

  const response = await fetch("/api/study", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, kind, count }),
  });

  const payload = (await response.json().catch(() => null)) as {
    cards?: Array<{ front: string; back: string }>;
    dropped?: number;
    error?: string;
  } | null;

  if (!response.ok || !payload?.cards)
    throw new Error(payload?.error ?? "The cards didn't come back.");

  return { cards: payload.cards, dropped: payload.dropped ?? 0 };
}
