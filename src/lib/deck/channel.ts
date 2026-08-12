"use client";

/**
 * Keeping two screens in step.
 *
 * The presenter's window and the room's window are two documents in one
 * browser, so they talk over a `BroadcastChannel` rather than through the
 * store: the store is per-tab, and the whole point is that these are different
 * tabs. It also means the presenter window can be closed and reopened without
 * the room's window noticing.
 *
 * The room's window is the authority on where the deck is. Only one side gets
 * to be right about that, and it has to be the side the audience is looking
 * at — a presenter view that could disagree with the screen behind it is worse
 * than no presenter view.
 */

import type { Slide } from "../types";

const NAME = "tougather:present";

export interface DeckState {
  /** Which deck, so two open decks don't drive each other. */
  key: string;
  index: number;
  step: number;
  /** When the clock started. Null when it hasn't. */
  startedAt: number | null;
  slides: Array<Pick<Slide, "id" | "title" | "bullets" | "note"> & { steps: number }>;
}

export type Message =
  /** The room's window, saying where it is. */
  | { kind: "state"; state: DeckState }
  /** The presenter's window, asking to move. The room's window decides. */
  | { kind: "move"; key: string; to: 1 | -1 | number }
  | { kind: "clock"; key: string; action: "start" | "reset" }
  /** A presenter window that has just opened, asking for the state. */
  | { kind: "hello"; key: string }
  /** The room's window going away, so the presenter view stops pretending. */
  | { kind: "bye"; key: string };

export function openChannel(
  onMessage: (message: Message) => void,
): { send: (message: Message) => void; close: () => void } {
  if (typeof BroadcastChannel === "undefined")
    return { send: () => {}, close: () => {} };

  const channel = new BroadcastChannel(NAME);
  channel.onmessage = (event: MessageEvent<Message>) => onMessage(event.data);
  return {
    send: (message) => channel.postMessage(message),
    close: () => {
      channel.onmessage = null;
      channel.close();
    },
  };
}

/** mm:ss, or h:mm:ss once a talk has gone on long enough to need the hour. */
export function elapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return "0:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(minutes).padStart(hours ? 2 : 1, "0");
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}
