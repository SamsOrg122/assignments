"use client";

/**
 * Simulated chat transport.
 *
 * Peers answer you — with a delay, a typing indicator first, and replies that
 * respond to what you actually said (a question gets an answer, a shared
 * project gets acknowledged by name). A canned "Lorem ipsum" bot would make
 * the feature impossible to evaluate; this makes the interaction honest even
 * though the intelligence isn't.
 */

import { LOCAL_USER } from "../realtime";
import { PEERS } from "../realtime/mock";
import { uid } from "../factories";
import { AI_USER_ID, SEED_CHANNELS, SEED_MESSAGES } from "./seed";
import type { Channel, ChatHandlers, ChatProvider, ChatSnapshot, Message } from "./types";

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

  /** Someone in the channel (never you) writes back. */
  const scheduleReply = (to: Message) => {
    const channel = channels.find((c) => c.id === to.channelId);
    // The assistant channel already has a responder — the assistant. A
    // simulated colleague chiming in there produces two answers to one
    // question, from two different things claiming to be in the room.
    if (channel?.kind === "ai") return;
    const others = (channel?.memberIds ?? []).filter(
      (id) => id !== LOCAL_USER.id && id !== AI_USER_ID,
    );
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
