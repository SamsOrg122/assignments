/**
 * The relay: how two browsers reach each other.
 *
 * `BroadcastChannel` only ever reached other windows of the *same* browser,
 * which is not what "send this link to someone" means. Two people on two
 * machines need something in the middle, and this is the smallest honest
 * version of it: subscribers hold an open response, publishers POST, the
 * server copies bytes from one to the other. It stores nothing, reads nothing,
 * and forgets a room the moment its last participant leaves.
 *
 * Server-sent events rather than WebSockets, deliberately. A WebSocket needs
 * an upgrade the Next.js route handler doesn't own, and half of what makes
 * this work — proxies, corporate networks, HTTP/2 multiplexing — comes free
 * with an ordinary streaming response. The uplink is a POST, which is all a
 * pointer position needs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THIS BREAKS, stated plainly: the room registry lives in this
 * process's memory. One long-running server — `next start`, a container, a
 * VPS — and everyone lands in the same process, so it works. A platform that
 * spreads requests across several instances (serverless, autoscaled) will put
 * two people in two processes that cannot see each other. The client proves
 * the round trip before it claims to be live, so that case *reports itself*
 * rather than looking like a session where nobody talks — and the fix is the
 * Supabase Realtime transport, which is written and waiting on its
 * environment variables.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NextRequest } from "next/server";

export const runtime = "nodejs";
// Streaming and per-request state; nothing here may be cached or prerendered.
export const dynamic = "force-dynamic";

/** Guards against a single client filling memory. All generous for real use. */
const MAX_ROOMS = 500;
const MAX_PER_ROOM = 24;
const MAX_BYTES = 512 * 1024;

type Subscriber = (chunk: string) => void;

/**
 * Rooms, in memory.
 *
 * Hung off `globalThis` because Next replaces the module on every hot reload
 * in development — a module-level `Map` would be a *new* map each time and
 * every open connection would be orphaned mid-session.
 */
const rooms: Map<string, Set<Subscriber>> = ((
  globalThis as { __collabRooms?: Map<string, Set<Subscriber>> }
).__collabRooms ??= new Map());

function publish(room: string, payload: string) {
  const subscribers = rooms.get(room);
  if (!subscribers) return 0;
  // Copied before iterating: a send that fails removes itself, and mutating
  // the set mid-iteration would skip the next subscriber.
  for (const send of [...subscribers]) {
    try {
      send(payload);
    } catch {
      subscribers.delete(send);
    }
  }
  return subscribers.size;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  if (!room || room.length > 64)
    return new Response("Bad room", { status: 400 });

  if (!rooms.has(room)) {
    if (rooms.size >= MAX_ROOMS)
      return new Response("Too many rooms", { status: 503 });
    rooms.set(room, new Set());
  }
  const subscribers = rooms.get(room)!;
  if (subscribers.size >= MAX_PER_ROOM)
    return new Response("Room is full", { status: 503 });

  const encoder = new TextEncoder();
  let send: Subscriber;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = (chunk) => controller.enqueue(encoder.encode(chunk));
      subscribers.add(send);

      // An immediate comment flushes headers through any buffering proxy, so
      // the client's `open` fires now rather than on the first real message.
      send(": open\n\n");

      // Comment frames keep the connection off an idle timeout. They are not
      // messages and the client never sees them as data.
      const beat = setInterval(() => {
        try {
          send(": ping\n\n");
        } catch {
          clearInterval(beat);
        }
      }, 25_000);

      const close = () => {
        clearInterval(beat);
        subscribers.delete(send);
        if (subscribers.size === 0) rooms.delete(room);
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting. Nothing to do.
        }
      };
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      subscribers.delete(send);
      if (subscribers.size === 0) rooms.delete(room);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers streaming responses by default, which turns a live
      // session into a slideshow. This is the header that stops it.
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  if (!room || room.length > 64)
    return Response.json({ error: "Bad room" }, { status: 400 });

  const body = await request.text();
  if (body.length > MAX_BYTES)
    return Response.json({ error: "Message too large" }, { status: 413 });

  // Parsed only to reject nonsense — the relay never inspects what it carries,
  // and the client is the only thing that understands the shape.
  try {
    JSON.parse(body);
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  // Echoed to everyone including the sender. That is what lets a client prove
  // its own round trip works before telling someone the session is live.
  const delivered = publish(room, `data: ${body}\n\n`);
  return Response.json({ delivered });
}
