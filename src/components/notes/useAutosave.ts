"use client";

/**
 * Typing that saves itself.
 *
 * The desktop note has had this for a while and the web page had a Save
 * button, which is the wrong shape for the same thing: a note is written in
 * one breath and abandoned, and a button means the last sentence lives only
 * in a textarea until somebody remembers. Every path out of the note — a
 * different note, the assistant, the tab closing — flushes first.
 *
 * Deliberately not a `useEffect` on the draft. That fires on every keystroke
 * and would need the timer id in a ref anyway; worse, it saves on changes the
 * user did not make, like a note arriving from the desktop app mid-sync. The
 * caller says when something was typed, which is the only moment worth
 * saving after.
 */

import { useCallback, useEffect, useRef } from "react";

/** Long enough to be a pause in typing, short enough to feel automatic. */
const QUIET_MS = 900;

export interface Autosave {
  /** Something was typed. Saves once the typing stops. */
  schedule: (id: string, body: string) => void;
  /** Save now if anything is waiting, and wait for it. */
  flush: () => Promise<void>;
  /** Whether a keystroke is still unwritten. */
  pending: () => boolean;
  /** Forget what is waiting — for a note that has just been deleted. */
  forget: () => void;
}

/**
 * `write` must keep a stable identity — a `useCallback` with no changing
 * dependencies. Everything returned here is derived from it, so a new
 * function every render would mean a new `flush` every render, which would
 * resubscribe the unload listener on every keystroke.
 *
 * The usual trick for this is a ref assigned during render. React's own lint
 * refuses that, and it is right to: a ref written while rendering is a value
 * that does not participate in rendering being changed by it. Asking the
 * caller for a stable function says the same thing out loud and needs no ref.
 */
export function useAutosave(
  write: (id: string, body: string) => Promise<void>,
): Autosave {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<{ id: string; body: string } | null>(null);

  const run = useCallback(async () => {
    const next = waiting.current;
    if (!next) return;
    // Cleared before the await, not after: a second flush arriving while this
    // one is in flight must not write the same body twice.
    waiting.current = null;
    await write(next.id, next.body);
  }, [write]);

  const schedule = useCallback(
    (id: string, body: string) => {
      waiting.current = { id, body };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, QUIET_MS);
    },
    [run],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await run();
  }, [run]);

  const pending = useCallback(() => waiting.current !== null, []);

  const forget = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    waiting.current = null;
  }, []);

  useEffect(() => {
    // A tab closing gets no await, so this is a best effort rather than a
    // guarantee — but the alternative is losing the sentence for certain.
    const leaving = () => {
      if (waiting.current) void run();
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      leaving();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [run]);

  return { schedule, flush, pending, forget };
}
