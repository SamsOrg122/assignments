"use client";

/**
 * A live session on one project.
 *
 * Both sides run this same hook — the person who sent the link and the person
 * who opened it are the same kind of participant. It does three things:
 *
 *   1. announces you, and keeps a list of everyone else who is announcing;
 *   2. publishes your pointer and applies theirs;
 *   3. publishes the blocks you changed and applies the ones they changed.
 *
 * Everything it publishes comes from watching the store, not from being told.
 * No editor, no block and no board item has to know a session exists — which
 * is the only way "collaborative" stays true as the app grows.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, BoardItem, Collaborator, PeerState, Project } from "../types";
import { useProjects } from "../store";
import { uid } from "../factories";
import { pickTransport } from "./transport";
import type { CollabMessage, CollabTransport } from "./types";

/** How often a moving pointer is published. 20/s is smooth after CSS easing. */
const CURSOR_MS = 50;
/** How long after a change the document is published. */
const PATCH_MS = 220;
/** Silence after which a participant is treated as gone. */
const TIMEOUT_MS = 12_000;
/** Heartbeat, comfortably inside the timeout. */
const HELLO_MS = 4_000;

/** Colours for people who arrive without one. Fixed set, stable by position. */
const COLORS = ["#3d7dff", "#26a17b", "#c46be0", "#d8a33c", "#e0685b"];

export function guestIdentity(seat: number): Collaborator {
  return {
    id: `guest_${seat}`,
    name: "Guest",
    initials: "G",
    color: COLORS[seat % COLORS.length],
  };
}

interface Participant {
  user: Collaborator;
  cursor: { x: number; y: number } | null;
  activeBlockId: string | null;
  lastSeen: number;
}

export interface SessionState {
  /** Everyone else, in the shape the cursor and avatar components want. */
  peers: PeerState[];
  /** Whether a transport is running at all. */
  live: boolean;
  /** What this session can actually reach, in words. */
  reach: string | null;
  /** Why it isn't live, when it isn't. */
  problem: string | null;
}

/**
 * `enabled` is the whole switch. A project that nobody is sharing opens no
 * channel, sends nothing and costs nothing.
 */
export function useCollabSession({
  projectId,
  self,
  enabled,
}: {
  projectId: string | null;
  self: Collaborator;
  enabled: boolean;
}): SessionState {
  const [peers, setPeers] = useState<PeerState[]>([]);
  // Which transport we have is a fact about the environment, known before
  // anything joins — so it is decided once, during render, rather than
  // discovered in an effect and reported a frame later.
  const [choice] = useState(pickTransport);

  const transport = useRef<CollabTransport | null>(null);
  const participants = useRef(new Map<string, Participant>());
  // A session id, not a user id: the same person in two windows is two seats,
  // and they should see each other's cursor. Held as lazy state rather than a
  // ref because it is read while rendering the messages we publish.
  const [seat] = useState(uid);

  /** The last thing we published, so we only publish what actually changed. */
  const published = useRef(new Map<string, string>());
  /** Ids we last saw, so a deletion is detectable at all. */
  const knownIds = useRef(new Set<string>());
  /** Set while applying someone else's patch — stops it echoing straight back. */
  const applying = useRef(false);
  /**
   * When each item's current version was authored.
   *
   * Without this, "last writer wins" is really "last *arriver* wins" — and at
   * the moment someone joins, an older snapshot travelling in their link can
   * land on top of text typed since. Newest wins instead, which is what the
   * phrase was always supposed to mean.
   */
  const versions = useRef(new Map<string, number>());

  const publish = useCallback((message: Omit<CollabMessage, "from" | "at">) => {
    transport.current?.send({
      ...message,
      from: seat,
      at: Date.now(),
    } as CollabMessage);
  }, [seat]);

  const refreshPeers = useCallback(() => {
    const now = Date.now();
    const live: PeerState[] = [];
    for (const [id, p] of participants.current) {
      if (now - p.lastSeen > TIMEOUT_MS) {
        participants.current.delete(id);
        continue;
      }
      live.push({
        // Keyed by seat, not by person: one person in two windows is two
        // cursors on purpose, and two participants sharing a user id would
        // collide as React keys and render as one.
        user: { ...p.user, id: `${p.user.id}:${id}` },
        cursor: p.cursor,
        activeBlockId: p.activeBlockId,
        activity: p.activeBlockId ? "editing" : null,
      });
    }
    setPeers(live);
  }, []);

  /* ── Join, and leave cleanly ────────────────────────────── */

  useEffect(() => {
    // No room to join. Peers are already empty in that case — this hook only
    // ever adds them from inside a subscription — so there is nothing to
    // clear, and clearing would be a render pass for no change.
    if (!enabled || !projectId) return;

    const chosen = choice.transport;
    if (!chosen) return;

    chosen.join(projectId, (message) => {
      if (message.from === seat) return;

      if (message.kind === "bye") {
        participants.current.delete(message.from);
        refreshPeers();
        return;
      }

      const existing = participants.current.get(message.from);
      participants.current.set(message.from, {
        user: message.user ?? existing?.user ?? guestIdentity(0),
        cursor:
          message.kind === "cursor"
            ? (message.cursor ?? null)
            : (existing?.cursor ?? null),
        activeBlockId:
          message.activeBlockId !== undefined
            ? message.activeBlockId
            : (existing?.activeBlockId ?? null),
        lastSeen: Date.now(),
      });
      refreshPeers();

      // Only ever *answer* a request. A participant who joins asks for the
      // document; the ones already here reply. If joining also pushed, the
      // newcomer's copy — a snapshot taken when their link was made — would
      // overwrite everything typed since.
      if (message.kind === "resend") sendEverything();

      if (message.kind === "patch") applyPatch(message);
    });
    transport.current = chosen;

    /** Everything we own, for a participant who just arrived. */
    function sendEverything() {
      const project = useProjects
        .getState()
        .projects.find((p) => p.id === projectId);
      if (!project) return;
      // Stamped with what we know about each item, not with "now" — answering
      // a request must not make an untouched paragraph look freshly written.
      publish({
        kind: "patch",
        user: self,
        blocks: project.blocks,
        board: project.board,
        name: project.name,
      });
    }

    function applyPatch(message: CollabMessage) {
      applying.current = true;

      /**
       * Board items are grabbed, not typed into, so the one being dragged is
       * held off — a remote position landing mid-drag makes the item jump out
       * from under the pointer. Text blocks need no guard here: the editor
       * itself holds a remote version until the caret leaves, which is the
       * only place that judgement can be made correctly.
       */
      const focused = draggingItemId();

      try {
        useProjects.setState((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            let blocks = p.blocks;
            let board = p.board;

            const fresh = (id: string) =>
              id !== focused && message.at >= (versions.current.get(id) ?? 0);
            const incoming = message.blocks?.filter((b) => fresh(b.id));
            const incomingItems = message.board?.filter((i) => fresh(i.id));
            for (const item of [...(incoming ?? []), ...(incomingItems ?? [])])
              versions.current.set(item.id, message.at);
            if (incoming?.length) blocks = merge(blocks, incoming);
            if (incomingItems?.length) board = merge(board, incomingItems);
            if (message.removed?.length) {
              const gone = new Set(message.removed.filter((id) => id !== focused));
              blocks = blocks.filter((b) => !gone.has(b.id));
              board = board.filter((i) => !gone.has(i.id));
            }

            return {
              ...p,
              name: message.name ?? p.name,
              blocks,
              board,
              updatedAt: Date.now(),
            };
          }),
        }));
      } finally {
        // Cleared on the next tick: the store update above schedules a render,
        // and the subscription that would echo it runs before this line
        // otherwise.
        setTimeout(() => {
          applying.current = false;
        }, 0);
      }
    }

    publish({ kind: "hello", user: self, activeBlockId: focusedBlockId() });
    publish({ kind: "resend" });
    const beat = setInterval(() => {
      publish({ kind: "hello", user: self, activeBlockId: focusedBlockId() });
      refreshPeers();
    }, HELLO_MS);

    const onUnload = () => publish({ kind: "bye" });
    window.addEventListener("pagehide", onUnload);

    const roster = participants.current;
    return () => {
      clearInterval(beat);
      window.removeEventListener("pagehide", onUnload);
      publish({ kind: "bye" });
      chosen.leave();
      transport.current = null;
      roster.clear();
      setPeers([]);
    };
  }, [enabled, projectId, seat, choice, self, publish, refreshPeers]);

  // Nobody there means nothing to say. A room with no other participant costs
  // one idle channel and no traffic, which is what lets every open project sit
  // in its own room without a switch to remember to flip.
  const alone = peers.length === 0;

  /* ── Publish the pointer ────────────────────────────────── */

  useEffect(() => {
    if (!enabled || !projectId || alone) return;
    let last = 0;

    const onMove = (e: PointerEvent) => {
      const now = Date.now();
      if (now - last < CURSOR_MS) return;
      last = now;
      // Viewport fractions rather than pixels, so a cursor lands in the same
      // *place* on a laptop and a monitor rather than the same coordinate.
      publish({
        kind: "cursor",
        user: self,
        activeBlockId: focusedBlockId(),
        cursor: {
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        },
      });
    };
    const onLeave = () => publish({ kind: "cursor", user: self, cursor: null });

    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, projectId, alone, self, publish]);

  /* ── Publish what changed ───────────────────────────────── */

  useEffect(() => {
    if (!enabled || !projectId || alone) return;

    // Seed from the current document, so joining doesn't immediately republish
    // a project nobody has touched.
    const seed = useProjects.getState().projects.find((p) => p.id === projectId);
    published.current = fingerprint(seed);
    knownIds.current = new Set(published.current.keys());

    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = useProjects.subscribe((s) => {
      if (applying.current) return;
      const project = s.projects.find((p) => p.id === projectId);
      if (!project) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const now = fingerprint(project);
        const changed: Array<Block | BoardItem> = [];
        for (const [id, print] of now)
          if (published.current.get(id) !== print) {
            const item =
              project.blocks.find((b) => b.id === id) ??
              project.board.find((i) => i.id === id);
            if (item) changed.push(item);
          }
        const removed = [...knownIds.current].filter((id) => !now.has(id));

        published.current = now;
        knownIds.current = new Set(now.keys());

        if (!changed.length && !removed.length) return;
        const at = Date.now();
        for (const item of changed) versions.current.set(item.id, at);
        publish({
          kind: "patch",
          user: self,
          blocks: changed.filter((c): c is Block => "type" in c),
          board: changed.filter((c): c is BoardItem => "kind" in c),
          removed,
          name: project.name,
        });
      }, PATCH_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, projectId, alone, self, publish]);

  return {
    peers,
    live: Boolean(choice.transport) && enabled,
    reach: choice.reach,
    problem: choice.problem,
  };
}

/**
 * Which block the caret is in, read from the DOM rather than tracked.
 *
 * Every editable surface already sits inside a `[data-block-id]` (or a
 * `[data-board-item]`), so asking the document is exact and costs nothing —
 * where a tracked value would need every editor in the app to remember to
 * report focus, and would be wrong the first time one forgot.
 */
function focusedBlockId(): string | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement as HTMLElement | null;
  const block = active?.closest?.("[data-block-id]") as HTMLElement | null;
  if (block?.dataset.blockId) return block.dataset.blockId;
  const item = active?.closest?.("[data-board-item]") as HTMLElement | null;
  return item?.getAttribute("data-board-item") ?? null;
}

/** The board item under an active pointer grab, if any. */
function draggingItemId(): string | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement as HTMLElement | null;
  const item = active?.closest?.("[data-board-item]") as HTMLElement | null;
  return item?.getAttribute("data-board-item") ?? null;
}

/** id → a cheap content hash, for spotting what actually changed. */
function fingerprint(project: Project | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!project) return map;
  for (const b of project.blocks) map.set(b.id, JSON.stringify(b));
  for (const i of project.board) map.set(i.id, JSON.stringify(i));
  return map;
}

/**
 * Incoming items win over local ones of the same id, and new ones are
 * appended. Last-writer-wins, per item — see the note in `types.ts` for what
 * that does and doesn't survive.
 */
function merge<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((i) => [i.id, i]));
  const merged = current.map((item) => byId.get(item.id) ?? item);
  const seen = new Set(current.map((i) => i.id));
  for (const item of incoming) if (!seen.has(item.id)) merged.push(item);
  return merged;
}
