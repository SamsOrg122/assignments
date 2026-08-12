"use client";

/**
 * The presenting window's half of the second-screen conversation.
 *
 * It publishes where the deck is and accepts requests to move; it never takes
 * a position from the other side. That asymmetry is the whole design — see
 * `channel.ts` — and it is what makes a presenter view that has been closed,
 * reopened, or opened halfway through simply catch up rather than fight.
 */

import { useEffect, useRef } from "react";
import type { Slide } from "../types";
import { buildSteps } from "./build";
import { openChannel, type DeckState, type Message } from "./channel";

export function usePresenterChannel({
  key,
  slides,
  index,
  step,
  presenting,
  onMove,
}: {
  key: string;
  slides: Slide[];
  index: number;
  step: number;
  presenting: boolean;
  onMove: (to: 1 | -1 | number) => void;
}) {
  const send = useRef<(message: Message) => void>(() => {});
  const started = useRef<number | null>(null);
  const move = useRef(onMove);
  const snapshotRef = useRef<() => DeckState>(() => ({
    key,
    index: 0,
    step: 0,
    startedAt: null,
    slides: [],
  }));

  /**
   * Everything the other window needs, and nothing it doesn't.
   *
   * Written into the refs in an effect rather than during render: a ref is not
   * a render value, and React says so. The effect runs before anything can ask
   * for a snapshot, because the only askers are the channel handlers below and
   * the button, both of which exist only after mount.
   */
  useEffect(() => {
    move.current = onMove;
    snapshotRef.current = () => ({
      key,
      index,
      step,
      startedAt: started.current,
      slides: slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        bullets: slide.bullets,
        note: slide.note,
        steps: buildSteps(slide),
      })),
    });
  });

  useEffect(() => {
    const channel = openChannel((message) => {
      if (message.kind === "hello") {
        channel.send({ kind: "state", state: snapshotRef.current() });
        return;
      }
      if (message.kind === "move" && message.key === key) move.current(message.to);
      if (message.kind === "clock" && message.key === key) {
        started.current = message.action === "start" ? Date.now() : null;
        channel.send({ kind: "state", state: snapshotRef.current() });
      }
    });
    send.current = channel.send;

    const bye = () => channel.send({ kind: "bye", key });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      window.removeEventListener("pagehide", bye);
      channel.close();
    };
  }, [key]);

  // Republish on every move, so the second screen is never a slide behind.
  useEffect(() => {
    send.current({ kind: "state", state: snapshotRef.current() });
  }, [index, step, slides, presenting]);

  return {
    /** Open the second screen, and start its clock the moment it appears. */
    open() {
      const opened = window.open(
        "/present",
        "tougather-presenter",
        "width=1100,height=760",
      );
      if (!opened) return false;
      if (!started.current) started.current = Date.now();
      // The new window announces itself when it is ready; this covers the case
      // where it was already open and simply came back to the front.
      setTimeout(
        () => send.current({ kind: "state", state: snapshotRef.current() }),
        400,
      );
      return true;
    },
  };
}
