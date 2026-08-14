/**
 * Notes left on a document while nobody was watching.
 *
 * The relay next door forwards bytes between two people who are both present
 * and stores nothing. That is right for pointers and keystrokes and wrong for
 * a comment: somebody opens a link at eleven at night, marks up three
 * paragraphs, closes the tab — and under a pure relay every word of it is
 * gone, because the person who sent the link was asleep.
 *
 * So this holds them. A capped, expiring list per room, written by whoever has
 * the link and read by whoever owns the document when they next open their
 * Library.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THIS BREAKS, stated plainly, because the interface repeats it: this
 * is memory in one server process. A restart, a redeploy or a platform that
 * spreads requests across instances loses whatever was waiting — and after
 * NOTE_TTL_MS it is dropped on purpose. It closes the gap between "you were
 * both online at the same second" and "you opened it the same day". It is not
 * a database and nothing in the interface may call it one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A day. Long enough for "I'll look at it tomorrow", short enough to forget. */
export const NOTE_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_ROOMS = 500;
const MAX_NOTES_PER_ROOM = 200;
const MAX_BODY_BYTES = 64 * 1024;

export interface StoredNote {
  /** The comment's own id, so the owner can drop one they already have. */
  id: string;
  blockId: string;
  authorId: string;
  authorName?: string;
  body: string;
  at: number;
}

/* Hung off globalThis for the same reason as the rooms: Next replaces the
   module on every hot reload, and a module-level Map would be a new one. */
const boxes: Map<string, StoredNote[]> = ((
  globalThis as { __collabNotes?: Map<string, StoredNote[]> }
).__collabNotes ??= new Map());

/** Drops what has expired, and any room left empty by that. */
function sweep(now: number) {
  for (const [room, notes] of boxes) {
    const live = notes.filter((note) => now - note.at < NOTE_TTL_MS);
    if (live.length) boxes.set(room, live);
    else boxes.delete(room);
  }
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  if (!room || room.length > 64) return new Response("Bad room", { status: 400 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return new Response("Too large", { status: 413 });

  let body: Partial<StoredNote>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Expected JSON", { status: 400 });
  }

  const now = Date.now();
  const note: StoredNote = {
    id: text(body.id, 64) ?? `${now}-${Math.round(Math.random() * 1e9)}`,
    blockId: text(body.blockId, 64) ?? "",
    authorId: text(body.authorId, 64) ?? "guest",
    body: text(body.body, 4000) ?? "",
    at: now,
  };
  const name = text(body.authorName, 80);
  if (name) note.authorName = name;

  if (!note.blockId || !note.body)
    return new Response("A note needs a block and something to say", {
      status: 400,
    });

  sweep(now);

  if (!boxes.has(room)) {
    if (boxes.size >= MAX_ROOMS)
      return new Response("Too many rooms", { status: 503 });
    boxes.set(room, []);
  }

  const notes = boxes.get(room)!;
  // Same id twice is a retry, not a second note.
  if (notes.some((existing) => existing.id === note.id))
    return Response.json({ stored: notes.length });

  if (notes.length >= MAX_NOTES_PER_ROOM)
    return new Response("This document has all the notes it can hold", {
      status: 507,
    });

  notes.push(note);
  return Response.json({ stored: notes.length });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  if (!room || room.length > 64) return new Response("Bad room", { status: 400 });

  const now = Date.now();
  sweep(now);

  const since = Number(request.nextUrl.searchParams.get("since") ?? "0");
  const notes = (boxes.get(room) ?? []).filter(
    (note) => !Number.isFinite(since) || note.at > since,
  );

  /*
   * Reading does not clear the box. Two devices, or one person who reloads,
   * would otherwise race for the same notes and one of them would lose. The
   * owner drops the ones they already hold by id — expiry does the clearing.
   */
  return Response.json({ notes, now });
}
