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
 * The version the download links point at.
 *
 * One constant, and it has to match the `version` in
 * `desktop/src-tauri/tauri.conf.json` — the release is named from that file,
 * and the built filenames carry it. When a new one is cut, this changes with
 * it. If it ever drifts the links 404, which is why every one of them sits
 * beside a link to the releases page that cannot go stale.
 */
export const DESKTOP_VERSION = "0.1.2";

const REPO = "https://github.com/SamsOrg122/assignments";

/** Every build, for anyone who wants a format that is not offered below. */
export const RELEASES_URL = `${REPO}/releases/latest`;

const asset = (name: string) =>
  `${REPO}/releases/download/desktop-v${DESKTOP_VERSION}/${name}`;

/**
 * What to offer, per machine.
 *
 * Direct links to the files rather than to the releases page. A page listing
 * seven files with names like `aarch64` and `amd64` is a puzzle to somebody
 * who wanted the app — and "Download" that lands you on a list is not a
 * download.
 *
 * Two Macs, because a Mac owner does not necessarily know which one they
 * have, and giving them the wrong one produces an error that says nothing
 * useful. Two Linux entries, because a `.deb` is the right answer on Ubuntu
 * and the AppImage is the right answer nearly everywhere else.
 */
export const DOWNLOADS: Array<{ label: string; note?: string; href: string }> = [
  {
    label: "macOS",
    note: "Apple silicon",
    href: asset(`Tougather.note_${DESKTOP_VERSION}_aarch64.dmg`),
  },
  {
    label: "macOS",
    note: "Intel",
    href: asset(`Tougather.note_${DESKTOP_VERSION}_x64.dmg`),
  },
  {
    label: "Windows",
    href: asset(`Tougather.note_${DESKTOP_VERSION}_x64-setup.exe`),
  },
  {
    label: "Linux",
    note: "AppImage",
    href: asset(`Tougather.note_${DESKTOP_VERSION}_amd64.AppImage`),
  },
  {
    label: "Linux",
    note: ".deb",
    href: asset(`Tougather.note_${DESKTOP_VERSION}_amd64.deb`),
  },
];
