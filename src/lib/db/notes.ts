"use client";

/**
 * The notes the desktop app writes.
 *
 * A separate table from `projects` and a separate module, because they are a
 * separate thing: a sticky note is a few hundred bytes written every eight
 * hundred milliseconds on somebody's laptop, and a project is a document with
 * blocks, board items and a search index. Sharing a table would have meant
 * pushing all of that over the wire for a changed word.
 *
 * Read-only from here, near enough. The browser can edit a note's text and
 * delete one — because a note you can see and cannot fix is worse than one
 * you cannot see — but the desktop app is where they are made.
 */

import { supabase } from "./client";

export interface Note {
  id: string;
  body: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}

const asMillis = (value: string): number => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

/** Every note in this account, newest first. Tombstones filtered out here. */
export async function listNotes(): Promise<Note[]> {
  const client = supabase();
  if (!client) return [];

  const { data, error } = await client
    .from("notes")
    .select("id,body,updated_at,deleted_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    body: typeof row.body === "string" ? row.body : "",
    updatedAt: asMillis(String(row.updated_at)),
  }));
}

/**
 * Change a note's text.
 *
 * `updated_at` is set here rather than by the database, because the desktop
 * app's last-write-wins compares two clients' timestamps — a server-set one
 * would make this edit look older or newer than it is depending on which
 * machine's clock is off, and the whole point is that both sides are playing
 * the same game.
 */
export async function saveNote(id: string, body: string): Promise<void> {
  const client = supabase();
  if (!client) throw new Error("Supabase isn't configured.");

  const { error } = await client
    .from("notes")
    .update({ body, updated_at: new Date().toISOString(), deleted_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * A tombstone, not a delete.
 *
 * A row that is simply gone cannot be told apart, from the laptop's side,
 * from one it has never seen — and it would come straight back at the next
 * sync, for ever.
 */
export async function deleteNote(id: string): Promise<void> {
  const client = supabase();
  if (!client) throw new Error("Supabase isn't configured.");

  const now = new Date().toISOString();
  const { error } = await client
    .from("notes")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** The first line, for the card. Worked out, never stored — see the app. */
export function titleOf(note: Note): string {
  const first = note.body.split("\n").find((line) => line.trim().length > 0);
  return first?.trim().slice(0, 80) ?? "";
}

export function previewOf(note: Note): string {
  const lines = note.body.split("\n");
  const start = lines.findIndex((line) => line.trim().length > 0);
  if (start === -1) return "";
  return lines
    .slice(start + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/* ── Where the desktop app comes from ─────────────────────────────────── */

/**
 * The releases page.
 *
 * One constant rather than a URL typed into a component, because the day this
 * moves — to a CDN, to a download service, to a signed installer host — it has
 * to move in one place, and a link that quietly points at the old one is how
 * people end up installing a build from last year.
 */
export const RELEASES_URL =
  "https://github.com/SamsOrg122/assignments/releases/latest";

/**
 * What to offer, per platform.
 *
 * All four point at the same releases page for now rather than at direct
 * asset URLs. A direct link is nicer right up until a release is cut with a
 * different filename, at which point it 404s and looks like the product is
 * broken. When there is a stable naming scheme worth relying on, these become
 * direct links and nothing else changes.
 */
export const DOWNLOADS: Array<{ label: string; href: string }> = [
  { label: "macOS", href: RELEASES_URL },
  { label: "Windows", href: RELEASES_URL },
  { label: "Linux", href: RELEASES_URL },
];
