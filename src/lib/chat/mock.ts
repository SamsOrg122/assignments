"use client";

/**
 * Simulated chat transport.
 *
 * Invented peers answer you — with a delay, a typing indicator first, and
 * replies that respond to what you actually said (a question gets an answer, a
 * shared project gets acknowledged by name). A canned "Lorem ipsum" bot would
 * make the feature impossible to evaluate; this makes the interaction honest
 * even though the intelligence isn't.
 *
 * WHOSE MOUTH IT MAY PUT WORDS IN, and what separates the two cases. Only the
 * three from `lib/realtime/mock` — Mira Chen, Dev Raman, Ana Silva — who exist
 * to be looked at in the landing page's demo frame, behind `setSimulatedPeers`.
 * A room can now hold a real person: the picker files a direct message under a
 * friend's account id from the connections table, and `personById` resolves
 * that id to the name they set. A reply invented here and posted under it is
 * therefore drawn with their real name above it — message a friend, and a
 * minute later you watch them answer in words they never wrote. What makes the
 * one honest and the other a forgery is not the room and not the transport, it
 * is who the message is attributed to: words put in the mouth of somebody who
 * does not exist demonstrate the feature; words put in the mouth of somebody
 * who does are a lie about a real person, told to the one person who trusts
 * this app to tell them what that person said.
 */

import { PEERS } from "../realtime/mock";
import { uid } from "../factories";
import { SEED_CHANNELS, SEED_MESSAGES } from "./seed";
import type { Channel, ChatHandlers, ChatProvider, ChatSnapshot, Message } from "./types";

/**
 * The invented people this transport is allowed to speak as.
 *
 * An allowlist of three ids, rather than a test for "is this member a real
 * account?". The only such test is `knownPerson`, and it answers null both for
 * an id nothing has ever heard of and for a real friend whose directory read
 * has not landed yet — on that second answer a fabricated reply would go out
 * under their name, which is the whole thing being prevented. Three fixed ids
 * can only ever be the three fixed people.
 *
 * `setSimulatedPeers` cannot be asked directly: it sets a module-private flag
 * in `lib/realtime/mock` and there is no reader for it. It does not need one
 * here. Nothing the app writes today puts these ids in a member list at all —
 * `lib/chat` dropped them from PEOPLE, from new channels and from the picker —
 * so what is still allowed is a room left in a browser from before that
 * removal, and the demo frame if it is ever given rooms of its own. Either way
 * it is the same population that flag turns on, and it stays right if the flag
 * later grows a reader.
 */
const SIMULATED = new Set(PEERS.map((p) => p.id));

const ACKS = [
  "Got it.",
  "Makes sense.",
  "Agreed.",
  "That reads better, yes.",
  "Noted — I'll pick it up.",
];

const QUESTION_REPLIES = [
  "I'd say yes, but check the method section first.",
  "Before the meeting, if there's time.",
  "Either works. I'd lean towards the simpler one.",
  "Good question — I don't think we settled that.",
];

const PROJECT_REPLIES = [
  "Opening it now.",
  "This is the version I had notes on.",
  "Reading it — give me a minute.",
];

function replyTo(message: Message): string {
  if (message.attachments?.length)
    return PROJECT_REPLIES[Math.floor(Math.random() * PROJECT_REPLIES.length)];
  if (message.body.trim().endsWith("?"))
    return QUESTION_REPLIES[Math.floor(Math.random() * QUESTION_REPLIES.length)];
  return ACKS[Math.floor(Math.random() * ACKS.length)];
}

export function createMockChatProvider(): ChatProvider {
  let handlers: ChatHandlers | null = null;
  let channels: Channel[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  /** An invented member of the channel writes back, or nobody does. */
  const scheduleReply = (to: Message) => {
    const channel = channels.find((c) => c.id === to.channelId);
    // The assistant channel already has a responder — the assistant. A
    // simulated colleague chiming in there produces two answers to one
    // question, from two different things claiming to be in the room.
    if (channel?.kind === "ai") return;
    // You, the assistant and every real account fall out here: silence is the
    // right answer for a room whose other member is somebody who could be
    // shown what this said. A direct message with a friend now simply sits
    // there unanswered, which is the truth — nothing has been sent to them.
    const others = (channel?.memberIds ?? []).filter((id) => SIMULATED.has(id));
    if (others.length === 0) return;

    const authorId = others[Math.floor(Math.random() * others.length)];
    const thinking = 900 + Math.random() * 1400;

    later(() => {
      handlers?.onTyping(to.channelId, authorId, true);
      const typing = 1100 + Math.random() * 1600;
      later(() => {
        handlers?.onTyping(to.channelId, authorId, false);
        handlers?.onMessage({
          id: uid(),
          channelId: to.channelId,
          authorId,
          body: replyTo(to),
          at: Date.now(),
          // A threaded message is answered in its thread, not the channel.
          parentId: to.parentId,
        });
      }, typing);
    }, thinking);
  };

  return {
    name: "simulated",

    async connect(h) {
      handlers = h;
      channels = SEED_CHANNELS;
      const snapshot: ChatSnapshot = {
        channels: SEED_CHANNELS,
        messages: SEED_MESSAGES,
      };
      return snapshot;
    },

    disconnect() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      handlers = null;
    },

    async send(message) {
      const sent: Message = { ...message, at: Date.now() };
      // Roughly a fifth of messages don't warrant a response, same as life.
      if (Math.random() > 0.2) scheduleReply(sent);
      return sent;
    },

    async react() {
      /* Optimistic locally; a server would broadcast. */
    },

    async createChannel(channel) {
      const created: Channel = { ...channel, createdAt: Date.now() };
      channels = [...channels, created];
      return created;
    },

    setTyping() {
      /* No server to inform. */
    },
  };
}

export { PEERS };
