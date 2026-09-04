/**
 * Talking to the store.
 *
 * A thin layer, deliberately. There is no client-side cache of notes beyond
 * what a component is currently rendering: the SQLite file is the truth, and
 * a second copy in JavaScript is a second thing that can be wrong.
 */
import { invoke } from "@tauri-apps/api/core";

export interface Note {
  id: string;
  body: string;
  /** Milliseconds since the epoch. */
  updated_at: number;
}

export const listNotes = () => invoke<Note[]>("notes_list");
export const createNote = () => invoke<Note>("note_create");
export const saveNote = (id: string, body: string) =>
  invoke<Note>("note_save", { id, body });
export const deleteNote = (id: string) => invoke<void>("note_delete", { id });
export const restoreNote = (id: string) =>
  invoke<Note | null>("note_restore", { id });
export const storePath = () => invoke<string>("store_path");
export const hideWindow = () => invoke<void>("hide_window");

/**
 * Grow the window into a sheet, or shrink it back to the bar.
 *
 * A boolean, because the Rust side takes a boolean — see
 * `visibility::set_sheet` for why this is a named command rather than a window
 * permission the webview holds.
 */
export const setSheetOpen = (open: boolean) => invoke<void>("set_sheet", { open });

/** How many dropped files have not reached the account yet. */
export const filesWaiting = () => invoke<number>("files_waiting");

/* ── Recording ────────────────────────────────────────────────────────── */

/**
 * What came of a recording.
 *
 * `note` is not decoration. It is where the desktop says out loud that the
 * dates in the document have *not* been put in the agenda — the web app's
 * `land.ts` does that, with a per-row check against the words each fact came
 * from, and a second implementation of it here would be a second set of rules
 * for writing into somebody's calendar.
 */
export interface RecordDone {
  name: string | null;
  words: number;
  seconds: number;
  note: string;
}

export const recordStart = () => invoke<void>("record_start");
export const recordStop = () => invoke<RecordDone>("record_stop");
export const recordCancel = () => invoke<void>("record_cancel");
export const recordStanding = () => invoke<boolean>("record_standing");
export const readyToQuit = () => invoke<void>("ready_to_quit");

/**
 * The first line, for the list.
 *
 * Not stored. A title column would be a second thing that has to agree with
 * the body, and the day they disagree is the day the list shows a note you
 * cannot find by its contents.
 */
export function titleOf(note: Note): string {
  const first = note.body.split("\n").find((line) => line.trim().length > 0);
  return first?.trim().slice(0, 80) ?? "";
}

/** The rest of it, for the second line of a list row. */
export function previewOf(note: Note): string {
  const lines = note.body.split("\n");
  const start = lines.findIndex((line) => line.trim().length > 0);
  if (start === -1) return "";
  return lines
    .slice(start + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/* ── Sync ─────────────────────────────────────────────────────────────── */

export interface SyncStanding {
  /** Notes written here that the account has not been told about yet. */
  waiting: number;
  /** When the last round finished, in milliseconds. Zero if never. */
  at: number;
  /** Why the last round did not finish, if it did not. */
  problem: string | null;
  running: boolean;
}

export const syncStanding = () => invoke<SyncStanding>("sync_standing");
export const syncNow = () => invoke<SyncStanding>("sync_now");
