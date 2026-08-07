"use client";

/**
 * Picking a transport.
 *
 * Two exist. `BroadcastChannel` is real and works right now, with no server at
 * all — but it only reaches other windows of the *same browser*, because that
 * is the whole of what a browser can do unaided. Supabase Realtime reaches
 * other people, and switches on when its environment variables are set and its
 * client library is installed.
 *
 * Availability is decided synchronously, before anything joins, so the UI can
 * say what a session reaches *before* someone sends the link rather than after
 * they wonder why nothing is happening. A transport that quietly can't reach
 * the person you shared with is the worst outcome here, so it is never left
 * unsaid — including the case where Supabase is configured but the dependency
 * is missing, which downgrades rather than failing.
 */

import type { CollabMessage, CollabTransport } from "./types";
import { isRemoteConfigured } from "../db";

/* ── Same browser, no server ────────────────────────────── */

class BroadcastTransport implements CollabTransport {
  readonly name = "broadcast";
  readonly reach = "other windows of this browser";
  private channel: BroadcastChannel | null = null;

  isAvailable() {
    return typeof BroadcastChannel !== "undefined";
  }

  join(room: string, onMessage: (message: CollabMessage) => void) {
    this.leave();
    this.channel = new BroadcastChannel(`assignments:collab:${room}`);
    // A BroadcastChannel never echoes to the sender, so there is no self-filter
    // here — unlike every server-backed transport, where there has to be one.
    this.channel.onmessage = (event) => onMessage(event.data as CollabMessage);
  }

  send(message: CollabMessage) {
    this.channel?.postMessage(message);
  }

  leave() {
    this.channel?.close();
    this.channel = null;
  }
}

/* ── Other people, when there's a backend ───────────────── */

/**
 * Supabase Realtime, behind the same environment variables as the database.
 *
 * Written and inert. `isAvailable` is false until the client library is here,
 * so a half-configured deployment degrades to the local transport and says so
 * instead of throwing in the middle of a session.
 */
class SupabaseTransport implements CollabTransport {
  readonly name = "supabase";
  readonly reach = "anyone you send the link to";
  private channel: { send: (a: unknown) => void; unsubscribe: () => void } | null =
    null;

  /** True once `@supabase/supabase-js` is a dependency of this app. */
  static readonly installed = false;

  isAvailable() {
    return isRemoteConfigured() && SupabaseTransport.installed;
  }

  join(room: string, onMessage: (message: CollabMessage) => void) {
    void room;
    void onMessage;
    // FOUNDER: with @supabase/supabase-js installed, flip `installed` above
    // and this becomes
    //
    //   const client = createClient(URL, ANON_KEY);
    //   this.channel = client.channel(`collab:${room}`, {
    //     config: { broadcast: { self: false } },
    //   });
    //   this.channel
    //     .on("broadcast", { event: "m" }, ({ payload }) => onMessage(payload))
    //     .subscribe();
    //
    // Nothing above this class changes. Deliberately not stubbed with a fake
    // that "succeeds": a session claiming to reach other people and not doing
    // it is worse than one that says it can't.
  }

  send(message: CollabMessage) {
    this.channel?.send({ type: "broadcast", event: "m", payload: message });
  }

  leave() {
    this.channel?.unsubscribe();
    this.channel = null;
  }
}

export interface TransportChoice {
  transport: CollabTransport | null;
  /** What it reaches, in words fit for a sentence. Null when there is none. */
  reach: string | null;
  /** Set when something better was configured but couldn't be used. */
  problem: string | null;
}

/**
 * A *fresh* transport each time, never a shared instance.
 *
 * Two sessions holding one object is a channel one of them can close out from
 * under the other — which is exactly what a React double-mount in development
 * does, and it silently kills a live session that looked fine.
 */
export function pickTransport(): TransportChoice {
  const supabase = new SupabaseTransport();
  if (supabase.isAvailable())
    return { transport: supabase, reach: supabase.reach, problem: null };

  const broadcast = new BroadcastTransport();

  const downgraded =
    isRemoteConfigured() && !SupabaseTransport.installed
      ? "Supabase is configured but @supabase/supabase-js isn't installed, so this session is local to this browser."
      : null;

  if (broadcast.isAvailable())
    return { transport: broadcast, reach: broadcast.reach, problem: downgraded };

  return {
    transport: null,
    reach: null,
    problem: "This browser can't open a live session.",
  };
}

export function transportReach(): string | null {
  return pickTransport().reach;
}
