"use client";

/**
 * The client half of the note box.
 *
 * Two callers, at opposite ends of the same document: somebody reading a
 * comment link leaves notes, and the person who owns the document collects
 * them the next time they open their Library.
 *
 * Both sides fail quietly and completely on purpose. If the server is a
 * platform that spreads requests across instances, or has restarted, or is
 * simply not there, then leaving a note fails and the interface says so at the
 * moment it happens — and collecting them returns nothing, which is
 * indistinguishable from nobody having commented, and is the right thing for
 * it to look like.
 */

import type { BoardComment } from "../types";

export interface StoredNote {
  id: string;
  blockId: string;
  authorId: string;
  authorName?: string;
  body: string;
  at: number;
}

const url = (room: string) => `/api/collab/${encodeURIComponent(room)}/notes`;

/** Leave a note. Resolves false if it did not get there — never throws. */
export async function leaveNote(
  room: string,
  note: StoredNote,
): Promise<boolean> {
  try {
    const response = await fetch(url(room), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(note),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Everything waiting on a document. Empty on any failure at all. */
export async function waitingNotes(room: string): Promise<StoredNote[]> {
  try {
    const response = await fetch(url(room), { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as { notes?: StoredNote[] };
    return Array.isArray(body.notes) ? body.notes : [];
  } catch {
    return [];
  }
}

/** A stored note, in the shape a block's comment thread holds. */
export function asComment(note: StoredNote): BoardComment {
  return {
    id: note.id,
    authorId: note.authorId,
    ...(note.authorName ? { authorName: note.authorName } : {}),
    body: note.body,
    at: note.at,
  };
}
