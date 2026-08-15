"use client";

/**
 * The merge layer.
 *
 * Until now two people in different paragraphs never collided and two people
 * in the same paragraph did: sync was per block and last-writer-wins, so one
 * of them lost a sentence with nothing on screen to say so. This is the fix,
 * and it is a real CRDT rather than a cleverer version of the same guess.
 *
 * Yjs rather than a hand-rolled sequence type. A fortnight of merge code that
 * is subtly wrong for a year is the expensive mistake available here, and the
 * interesting problems in this file are not the algorithm — they are seeding
 * and identity, both below.
 *
 * ── What is authoritative, and when ──────────────────────────────────────
 * The store still holds `block.html`, and everything downstream — export,
 * share links, the reader, .docx — still reads it. The Y document is the live
 * model while an editor is mounted on it, and every change writes the HTML
 * back. That is the dual-write the roadmap called for: no migration, no
 * project in anybody's browser that stops opening, and the merge where the
 * collisions actually happen.
 *
 * The limit that follows, stated once here and repeated where it shows: the Y
 * document is rebuilt from HTML when a block mounts, so it survives a
 * disconnect but not a reload. Two people editing the same paragraph while
 * both offline for a day, each reloading before they reconnect, still have two
 * versions and the newer one wins. Persisting the update log fixes that and is
 * the next piece of this, not this piece.
 */

import * as Y from "yjs";

/** Marks an update that arrived from somewhere else, so it isn't echoed back. */
export const REMOTE = Symbol("remote");

const docs = new Map<string, Y.Doc>();

export function docFor(projectId: string): Y.Doc {
  let doc = docs.get(projectId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(projectId, doc);
  }
  return doc;
}

/**
 * One fragment per block, keyed by the block's own id.
 *
 * Not one fragment for the whole document: the editor is per block here, and a
 * shared fragment would mean every keystroke in any paragraph re-rendering all
 * of them. Block ids are stable and unique, which is what makes them usable as
 * the key on both sides of a session without agreeing on anything first.
 */
export function fragmentFor(projectId: string, blockId: string): Y.XmlFragment {
  return docFor(projectId).getXmlFragment(blockId);
}

/** Whether a block has any Y state at all — the seeding question. */
export function isSeeded(projectId: string, blockId: string): boolean {
  return fragmentFor(projectId, blockId).length > 0;
}

/* ── Over the wire ──────────────────────────────────────── */

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Everything this browser knows about the document, for somebody joining. */
export function fullState(projectId: string): string {
  return toBase64(Y.encodeStateAsUpdate(docFor(projectId)));
}

/**
 * A summary of what this browser already has — the repair half of the
 * protocol, and the part whose absence made the first version of this wrong.
 *
 * Broadcasting each update on its own is only correct on a transport that
 * never loses a message. Ours can: the relay drops a subscriber whose write
 * fails, a reconnecting client misses whatever went past while it was away,
 * and a Yjs update that never lands is missing for good — the two documents
 * then disagree quietly, for ever, which is worse than the last-writer-wins
 * this replaced.
 *
 * So each side also says, periodically, "here is what I have". Anybody who
 * holds more answers with exactly the difference. Small — a state vector is
 * a few bytes per author — and it means any gap heals on the next beat
 * instead of never.
 */
export function stateVector(projectId: string): string {
  return toBase64(Y.encodeStateVector(docFor(projectId)));
}

/** Everything the holder of `vector` is missing. Empty-ish when they're level. */
export function diffSince(projectId: string, vector: string): string {
  try {
    return toBase64(
      Y.encodeStateAsUpdate(docFor(projectId), fromBase64(vector)),
    );
  } catch {
    return fullState(projectId);
  }
}

/**
 * Fold in what somebody else knows.
 *
 * Idempotent and order-independent, which is the whole reason for using a CRDT
 * here: the same update applied twice, or three updates arriving backwards,
 * all land on the same document.
 */
export function applyRemote(projectId: string, update: string) {
  try {
    Y.applyUpdate(docFor(projectId), fromBase64(update), REMOTE);
  } catch {
    // A malformed update is somebody else's problem arriving as bytes. The
    // document is unchanged; dropping it is the only safe answer.
  }
}

/**
 * Local changes, ready to send. Remote ones are filtered out here rather than
 * at the transport, so nothing can echo an update back to the person it came
 * from and start a loop.
 */
export function onLocalUpdate(
  projectId: string,
  send: (update: string) => void,
): () => void {
  const doc = docFor(projectId);
  const handler = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    send(toBase64(update));
  };
  doc.on("update", handler);
  return () => doc.off("update", handler);
}

/* ── Seeding, and the race it would otherwise lose ──────── */

/**
 * The one genuinely dangerous moment.
 *
 * A block seeds its fragment from `block.html` when it finds it empty. Two
 * people opening the same shared document both find it empty — the guest has
 * their own copy of the same words, out of the link — and if both seed, the
 * merge is honest about it and they end up with the paragraph twice.
 *
 * So while a session is joining, seeding waits: whoever already has state
 * sends it, and the fragment stops being empty. If no state arrives at all —
 * a transport that never reached anybody — the wait ends and the blocks seed
 * locally, because an empty document is a worse outcome than a duplicated one
 * and this way neither happens.
 */
const waiting = new Map<string, Array<() => void>>();

export function expectRemoteState(projectId: string, timeoutMs = 2500) {
  if (waiting.has(projectId)) return;
  waiting.set(projectId, []);
  setTimeout(() => releaseSeeding(projectId), timeoutMs);
}

export function releaseSeeding(projectId: string) {
  const queued = waiting.get(projectId);
  if (!queued) return;
  waiting.delete(projectId);
  for (const run of queued) run();
}

/** Run `seed` now, or as soon as waiting for somebody else's state is over. */
export function whenSeedable(projectId: string, seed: () => void) {
  const queued = waiting.get(projectId);
  if (!queued) {
    seed();
    return;
  }
  queued.push(seed);
}

/** Let go of a document nobody is looking at any more. */
export function dropDoc(projectId: string) {
  const doc = docs.get(projectId);
  if (!doc) return;
  doc.destroy();
  docs.delete(projectId);
}

/** For tests and diagnostics: how many documents this tab is holding. */
export const heldDocs = () => docs.size;
