"use client";

/**
 * Picking a transport.
 *
 * Three, in order of how far they reach:
 *
 *   1. **The relay** (`/api/collab/[room]`) — server-sent events down, POST
 *      up. Reaches anyone, on any machine, with no configuration. This is the
 *      one that makes "send someone the link" mean what it says.
 *   2. **BroadcastChannel** — no server at all, but only other windows of the
 *      same browser. The fallback when the relay can't be reached.
 *   3. **Supabase Realtime** — the same reach as the relay but backed by a
 *      service, for when the app runs on more than one instance and the
 *      relay's in-memory rooms stop being shared.
 *
 * Nothing here *claims* a reach it hasn't proven. The relay sends a probe
 * through the server and waits for it to come back before reporting live; if
 * it doesn't, the session drops to BroadcastChannel and says so. A transport
 * that quietly fails to reach the person you shared with is the worst outcome
 * this file can produce, so it is designed to be impossible.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CollabMessage, CollabTransport, TransportStatus } from "./types";
import { supabase } from "../db/client";

/** How long the relay gets to prove itself before we fall back. */
const PROBE_MS = 5_000;

/* ── 1. The relay: anyone, anywhere ─────────────────────── */

class RelayTransport implements CollabTransport {
  readonly name = "relay";
  readonly reach = "anyone you send the link to";

  private source: EventSource | null = null;
  private room = "";
  private probe: ReturnType<typeof setTimeout> | null = null;
  private verified = false;
  /** Distinguishes our probe from anyone else's, in a shared room. */
  private readonly probeId = `probe_${Math.random().toString(36).slice(2, 10)}`;
  private fallback: BroadcastTransport | null = null;
  private onMessage: ((m: CollabMessage) => void) | null = null;
  private onStatus: ((s: TransportStatus) => void) | null = null;

  isAvailable() {
    return typeof EventSource !== "undefined" && typeof fetch !== "undefined";
  }

  join(
    room: string,
    onMessage: (message: CollabMessage) => void,
    onStatus: (status: TransportStatus) => void,
  ) {
    this.leave();
    this.room = room;
    this.onMessage = onMessage;
    this.onStatus = onStatus;

    this.source = new EventSource(`/api/collab/${encodeURIComponent(room)}`);

    // Probe only once the stream is actually open. Sent any earlier it races
    // the subscription and is delivered to nobody — and then the first thing
    // to prove the round trip is the session's next heartbeat, seconds later,
    // which looks exactly like a session that doesn't work.
    this.source.onopen = () => {
      void this.post({
        kind: "probe",
        from: this.probeId,
        at: Date.now(),
      });
    };

    this.source.onmessage = (event) => {
      let message: CollabMessage;
      try {
        message = JSON.parse(event.data) as CollabMessage;
      } catch {
        return;
      }

      // The server echoes to everyone, sender included. Anything coming back
      // is proof the round trip works.
      if (!this.verified) {
        this.verified = true;
        if (this.probe) clearTimeout(this.probe);
        this.probe = null;
        onStatus({ state: "live", reach: this.reach });
      }

      // The probe was ours and means nothing to a session.
      if (message.kind === "probe") return;
      onMessage(message);
    };

    // An error here is the *connection* failing, not a bad message: the
    // endpoint is missing, a proxy refused the stream, or the platform put
    // this request somewhere else. Either way, fall back.
    this.source.onerror = () => {
      if (!this.verified) this.downgrade("The live relay couldn't be reached");
    };

    this.probe = setTimeout(() => {
      if (!this.verified)
        this.downgrade("The live relay didn't answer in time");
    }, PROBE_MS);
  }

  /**
   * Hand the session over to BroadcastChannel, in place.
   *
   * Swapping underneath rather than making the caller re-join keeps the
   * session's own state — its seat, its roster, its published fingerprints —
   * intact through what is, to the person using it, a change in how far their
   * words travel and nothing else.
   */
  private downgrade(reason: string) {
    this.source?.close();
    this.source = null;
    if (this.probe) clearTimeout(this.probe);
    this.probe = null;

    const local = new BroadcastTransport();
    if (!local.isAvailable() || !this.onMessage) {
      this.onStatus?.({ state: "failed", problem: reason });
      return;
    }
    this.fallback = local;
    local.join(this.room, this.onMessage, () => {});
    this.onStatus?.({
      state: "live",
      reach: local.reach,
      note: `${reason}, so this session only reaches other windows of this browser.`,
    });
  }

  send(message: CollabMessage) {
    if (this.fallback) {
      this.fallback.send(message);
      return;
    }
    void this.post(message);
  }

  private post(message: CollabMessage) {
    return fetch(`/api/collab/${encodeURIComponent(this.room)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      // A pointer position that arrives late is worthless, and a queued
      // request holding the tab open on unload is worse.
      keepalive: true,
    }).catch(() => {
      if (!this.verified) this.downgrade("The live relay refused a message");
    });
  }

  leave() {
    if (this.probe) clearTimeout(this.probe);
    this.probe = null;
    this.source?.close();
    this.source = null;
    this.fallback?.leave();
    this.fallback = null;
    this.verified = false;
    this.onMessage = null;
    this.onStatus = null;
  }
}

/* ── 2. Same browser, no server ─────────────────────────── */

class BroadcastTransport implements CollabTransport {
  readonly name = "broadcast";
  readonly reach = "other windows of this browser";
  private channel: BroadcastChannel | null = null;

  isAvailable() {
    return typeof BroadcastChannel !== "undefined";
  }

  join(
    room: string,
    onMessage: (message: CollabMessage) => void,
    onStatus: (status: TransportStatus) => void,
  ) {
    this.leave();
    this.channel = new BroadcastChannel(`assignments:collab:${room}`);
    // A BroadcastChannel never echoes to the sender, so there is no self-filter
    // here — unlike every server-backed transport, where there has to be one.
    this.channel.onmessage = (event) => onMessage(event.data as CollabMessage);
    onStatus({ state: "live", reach: this.reach });
  }

  send(message: CollabMessage) {
    this.channel?.postMessage(message);
  }

  leave() {
    this.channel?.close();
    this.channel = null;
  }
}

/* ── 3. Other people, at scale ──────────────────────────── */

/**
 * Supabase Realtime, behind the same environment variables as the database.
 *
 * Preferred over the relay whenever it is configured, because the relay's
 * rooms live in one process's memory: on a platform that spreads requests
 * across instances — serverless, autoscaled, which is where this deploys —
 * two people can land in two processes whose rooms will never meet. A hosted
 * pub/sub has no such edge.
 */
class SupabaseTransport implements CollabTransport {
  readonly name = "supabase";
  readonly reach = "anyone you send the link to";
  private channel: RealtimeChannel | null = null;

  isAvailable() {
    return supabase() !== null;
  }

  join(
    room: string,
    onMessage: (message: CollabMessage) => void,
    onStatus: (status: TransportStatus) => void,
  ) {
    const client = supabase();
    if (!client) {
      onStatus({ state: "failed", problem: "Supabase isn't configured." });
      return;
    }
    this.leave();

    this.channel = client.channel(`collab:${room}`, {
      // The server would otherwise echo our own messages back, and every
      // session would see itself as a second participant.
      config: { broadcast: { self: false } },
    });

    this.channel
      .on("broadcast", { event: "m" }, ({ payload }) =>
        onMessage(payload as CollabMessage),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          onStatus({ state: "live", reach: this.reach });
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          onStatus({
            state: "failed",
            problem: "Couldn't reach the realtime service.",
          });
      });
  }

  send(message: CollabMessage) {
    void this.channel?.send({ type: "broadcast", event: "m", payload: message });
  }

  leave() {
    if (this.channel) void this.channel.unsubscribe();
    this.channel = null;
  }
}

/**
 * A *fresh* transport each time, never a shared instance.
 *
 * Two sessions holding one object is a channel one of them can close out from
 * under the other — which is exactly what a React double-mount in development
 * does, and it silently kills a live session that looked fine.
 */
export function pickTransport(): CollabTransport | null {
  // Not named `supabase` — that is the client factory imported above, and
  // shadowing it here would quietly disable it for anything added later.
  const hosted = new SupabaseTransport();
  if (hosted.isAvailable()) return hosted;

  const relay = new RelayTransport();
  if (relay.isAvailable()) return relay;

  const broadcast = new BroadcastTransport();
  return broadcast.isAvailable() ? broadcast : null;
}

/**
 * What a session is *expected* to reach, before one has been opened.
 *
 * Only ever used to describe a link that hasn't been sent yet. Anything on
 * screen during a live session reads the verified status instead, because
 * this is a hope and that is a fact.
 */
export function transportReach(): string | null {
  return pickTransport()?.reach ?? null;
}
